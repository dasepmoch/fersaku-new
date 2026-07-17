/**
 * INT-140 — opaque recent MFA step-up proof (memory only).
 *
 * - Never localStorage / sessionStorage / URL / React Query variables.
 * - Server mints via POST /v1/auth/mfa/verify|step-up; client attaches
 *   X-Recent-MFA-Proof on privileged ops via http-client hooks.
 * - Clear on logout, session expiry, security transition, or single-use consume.
 */

import {
  getHttpClientSessionHooks,
  setHttpClientSessionHooks,
} from "./http-client";

export type RecentMfaProofEntry = {
  proof: string;
  purpose: string;
  expiresAt: number | null;
};

/** In-memory only. Never write to web storage. */
let memory: RecentMfaProofEntry | undefined;

export function setRecentMfaProof(
  proof: string | undefined,
  meta?: { purpose?: string; expiresAt?: string | number | Date | null },
): void {
  if (!proof) {
    memory = undefined;
    return;
  }
  let expiresAt: number | null = null;
  if (meta?.expiresAt != null && meta.expiresAt !== "") {
    const t =
      typeof meta.expiresAt === "number"
        ? meta.expiresAt
        : new Date(meta.expiresAt).getTime();
    expiresAt = Number.isFinite(t) ? t : null;
  }
  memory = {
    proof,
    purpose: meta?.purpose?.trim() || "",
    expiresAt,
  };
}

/** Current raw proof if present and not expired. */
export function getRecentMfaProof(purpose?: string): string | undefined {
  if (!memory?.proof) return undefined;
  if (memory.expiresAt != null && Date.now() >= memory.expiresAt) {
    memory = undefined;
    return undefined;
  }
  if (purpose && memory.purpose && memory.purpose !== purpose) {
    return undefined;
  }
  return memory.proof;
}

/** Drop proof after single-use attach or logout. */
export function clearRecentMfaProof(): void {
  memory = undefined;
}

export function peekRecentMfaProofMeta(): RecentMfaProofEntry | undefined {
  if (!memory) return undefined;
  if (memory.expiresAt != null && Date.now() >= memory.expiresAt) {
    memory = undefined;
    return undefined;
  }
  return memory ? { ...memory } : undefined;
}

/**
 * Wire INT-100 session hooks for automatic X-Recent-MFA-Proof when
 * request opts in with `requireRecentMfa: true` (or explicit recentMfaProof).
 */
export function wireHttpClientRecentMfaHooks(): void {
  const existing = getHttpClientSessionHooks();
  setHttpClientSessionHooks({
    ...existing,
    getRecentMfaProof: () => getRecentMfaProof(),
  });
}

export function __resetRecentMfaProofForTests(): void {
  memory = undefined;
}

export function assertRecentMfaProofNotInWebStorage(): void {
  if (typeof window === "undefined") return;
  const keys = [
    ...Object.keys(window.localStorage || {}),
    ...Object.keys(window.sessionStorage || {}),
  ];
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      lower.includes("recent-mfa") ||
      lower.includes("recentmfa") ||
      lower.includes("mfa-proof") ||
      lower.includes("mfaproof")
    ) {
      throw new Error(`Recent MFA proof must not use web storage key: ${key}`);
    }
  }
}
