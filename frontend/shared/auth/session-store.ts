/**
 * INT-120 — source-neutral session store with deduped bootstrap.
 * Mock only when domain auth is mock; API mode never hardcodes identity.
 */

import type { QueryClient } from "@tanstack/react-query";
import { getDomainSource } from "@/shared/data/domain-source";
import { clearCsrfToken, wireHttpClientCsrfHooks } from "@/shared/api/csrf";
import {
  clearRecentMfaProof,
  wireHttpClientRecentMfaHooks,
} from "@/shared/api/recent-mfa-proof";
import {
  clearHttpClientSessionHooks,
  getHttpClientSessionHooks,
  setHttpClientSessionHooks,
} from "@/shared/api/http-client";
import {
  clearPrivateQueryCache,
  clearSecretLocalSessionState,
} from "./private-cache";
import { publishSessionBroadcast } from "./session-broadcast";
import { fetchSessionBootstrap, postLogout } from "./session-api";
import {
  ANONYMOUS_SNAPSHOT,
  LOADING_SNAPSHOT,
  claimsCacheIdentity,
  createMockClaims,
  statusFromClaims,
  type SessionClaims,
  type SessionSnapshot,
  type SessionSurface,
} from "./session-model";
import { loginPathForSurface } from "./return-to";

export type SessionStoreListener = (snapshot: SessionSnapshot) => void;

let snapshot: SessionSnapshot = { ...LOADING_SNAPSHOT };
let listeners = new Set<SessionStoreListener>();
let bootstrapInFlight: Promise<SessionSnapshot> | null = null;
let wired = false;
let queryClientRef: QueryClient | null = null;
/** Last identity used for private-cache invalidation. */
let lastCacheIdentity = claimsCacheIdentity(null);
/** Optional mock surface hint for prototype private shells (buyer|seller|admin). */
let mockSurfaceHint: SessionSurface = "buyer";

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // listeners must not break store
    }
  }
}

function setSnapshot(next: SessionSnapshot): void {
  snapshot = next;
  emit();
}

function maybeClearPrivateCache(claims: SessionClaims | null): void {
  const identity = claimsCacheIdentity(claims);
  if (identity === lastCacheIdentity) return;
  lastCacheIdentity = identity;
  if (queryClientRef) {
    clearPrivateQueryCache(queryClientRef);
  }
  if (identity === "anonymous") {
    clearSecretLocalSessionState();
  }
}

function authDomainSource(): "mock" | "api" | "disabled" {
  try {
    return getDomainSource("auth");
  } catch {
    return "mock";
  }
}

/**
 * Wire CSRF + session-expired hooks once (safe to call repeatedly).
 */
export function wireSessionTransportHooks(): void {
  wireHttpClientCsrfHooks();
  wireHttpClientRecentMfaHooks();
  const existing = getHttpClientSessionHooks();
  setHttpClientSessionHooks({
    ...existing,
    onSessionExpired: (error) => {
      existing.onSessionExpired?.(error);
      void handleSessionExpired();
    },
  });
  wired = true;
}

export function bindSessionQueryClient(client: QueryClient | null): void {
  queryClientRef = client;
}

export function setMockSurfaceHint(surface: SessionSurface): void {
  mockSurfaceHint = surface;
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

export function subscribeSession(listener: SessionStoreListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isSessionReady(): boolean {
  return snapshot.status !== "loading";
}

/**
 * Dedupe bootstrap: concurrent callers share one GET /session (or mock resolve).
 */
export async function bootstrapSession(options?: {
  force?: boolean;
  mockSurface?: SessionSurface;
}): Promise<SessionSnapshot> {
  if (!wired) wireSessionTransportHooks();

  if (options?.mockSurface) {
    mockSurfaceHint = options.mockSurface;
  }

  // Always share an in-flight bootstrap (force must not stack parallel GET /session).
  if (bootstrapInFlight) {
    return bootstrapInFlight;
  }

  if (
    !options?.force &&
    (snapshot.status === "authenticated" ||
      snapshot.status === "mfa_pending") &&
    snapshot.claims
  ) {
    return snapshot;
  }

  const previousSnapshot = snapshot;
  const previousIdentity = claimsCacheIdentity(previousSnapshot.claims);
  // Keep existing claims visible during force refresh to avoid guard flash / login bounce.
  if (!(
    options?.force &&
    (previousSnapshot.status === "authenticated" ||
      previousSnapshot.status === "mfa_pending") &&
    previousSnapshot.claims
  )) {
    setSnapshot({ ...LOADING_SNAPSHOT });
  }

  bootstrapInFlight = (async () => {
    const source = authDomainSource();

    if (source === "disabled") {
      maybeClearPrivateCache(null);
      setSnapshot({
        status: "anonymous",
        claims: null,
        errorCode: "DOMAIN_DISABLED",
      });
      return snapshot;
    }

    if (source === "mock") {
      const claims = createMockClaims(mockSurfaceHint);
      maybeClearPrivateCache(claims);
      setSnapshot({
        status: statusFromClaims(claims),
        claims,
        errorCode: null,
      });
      return snapshot;
    }

    // API mode: never invent identity.
    const result = await fetchSessionBootstrap();
    if (result.ok) {
      maybeClearPrivateCache(result.claims);
      setSnapshot({
        status: statusFromClaims(result.claims),
        claims: result.claims,
        errorCode: null,
      });
      // Broadcast only when identity changes. Same-tab BroadcastChannel peers
      // receive posts from other channel instances and must not re-force bootstrap
      // (that loops GET /session until rate-limited and kicks the user to login).
      const nextIdentity = claimsCacheIdentity(result.claims);
      if (nextIdentity !== previousIdentity) {
        publishSessionBroadcast({
          type: "session-changed",
          identity: nextIdentity,
        });
      }
      return snapshot;
    }

    // Authoritative unauth: clear. Transient (429/network): keep prior session if any.
    if (result.kind === "expired" || result.kind === "anonymous") {
      maybeClearPrivateCache(null);
      setSnapshot({
        status: result.kind === "expired" ? "expired" : "anonymous",
        claims: null,
        errorCode: result.code,
      });
      return snapshot;
    }
    if (
      previousSnapshot.claims &&
      (previousSnapshot.status === "authenticated" ||
        previousSnapshot.status === "mfa_pending")
    ) {
      setSnapshot({
        ...previousSnapshot,
        errorCode: result.code,
      });
      return snapshot;
    }
    maybeClearPrivateCache(null);
    setSnapshot({
      status: "anonymous",
      claims: null,
      errorCode: result.code,
    });
    return snapshot;
  })();

  try {
    return await bootstrapInFlight;
  } finally {
    bootstrapInFlight = null;
  }
}

/**
 * After successful login form (domain AUT-*): set claims from bootstrap or patch.
 */
export async function refreshSessionAfterLogin(
  mockSurface?: SessionSurface,
): Promise<SessionSnapshot> {
  return bootstrapSession({ force: true, mockSurface });
}

/**
 * Apply claims from login response user object without second /session when possible.
 * Prefer force bootstrap so permissions/roles are complete.
 */
export async function establishSessionFromBootstrap(): Promise<SessionSnapshot> {
  return bootstrapSession({ force: true });
}

async function handleSessionExpired(): Promise<void> {
  clearCsrfToken();
  clearRecentMfaProof();
  maybeClearPrivateCache(null);
  setSnapshot({
    status: "expired",
    claims: null,
    errorCode: "AUTH_SESSION_EXPIRED",
  });
  // Soft: do not hard-redirect here (theme preserved); guards/login shells decide.
}

/**
 * Server-side logout + local private clear + CSRF clear + optional redirect target.
 */
export async function logoutSession(options?: {
  surface?: SessionSurface;
  redirect?: boolean;
}): Promise<{ loginHref: string }> {
  const surface =
    options?.surface ?? snapshot.claims?.surface ?? mockSurfaceHint;
  const loginHref = loginPathForSurface(surface);

  try {
    if (authDomainSource() === "api") {
      await postLogout();
    } else {
      clearCsrfToken();
    }
  } catch {
    clearCsrfToken();
  }
  clearRecentMfaProof();

  maybeClearPrivateCache(null);
  clearSecretLocalSessionState();
  if (queryClientRef) {
    clearPrivateQueryCache(queryClientRef);
  }

  setSnapshot({ ...ANONYMOUS_SNAPSHOT });
  publishSessionBroadcast({ type: "logout" });

  if (options?.redirect !== false && typeof window !== "undefined") {
    window.location.assign(loginHref);
  }

  return { loginHref };
}

/** Apply remote tab logout without re-calling backend. */
export function applyRemoteLogout(): void {
  clearCsrfToken();
  clearRecentMfaProof();
  maybeClearPrivateCache(null);
  clearSecretLocalSessionState();
  if (queryClientRef) {
    clearPrivateQueryCache(queryClientRef);
  }
  setSnapshot({ ...ANONYMOUS_SNAPSHOT });
}

/** Test-only reset. */
export function __resetSessionStoreForTests(): void {
  snapshot = { ...LOADING_SNAPSHOT };
  listeners = new Set();
  bootstrapInFlight = null;
  wired = false;
  queryClientRef = null;
  lastCacheIdentity = claimsCacheIdentity(null);
  mockSurfaceHint = "buyer";
  clearCsrfToken();
  clearRecentMfaProof();
  clearHttpClientSessionHooks();
}
