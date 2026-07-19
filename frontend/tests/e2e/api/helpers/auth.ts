/**
 * QLT-220 — real API/UI auth helpers for cross-stack Playwright.
 * Ephemeral cookies only; never production credentials or committed storageState.
 */

import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  apiOrigin,
  assertNonProductionHarness,
  SEED_PASSWORD,
  SEED_PERSONAS,
} from "./env";
import { maskToken } from "./mailpit";
import { QLT110_SEED } from "./seed";

export type SeedSurface = "SELLER" | "BUYER";

export type AuthSession = {
  cookie: string;
  csrfToken: string;
  sessionId: string;
  userId: string;
  surface: SeedSurface;
  email: string;
};

/** Gitignored under /test-results — never commit. */
export function authStateDir(): string {
  return path.join(process.cwd(), "test-results", "api", ".auth");
}

export function authStatePath(persona: "seller" | "buyer"): string {
  return path.join(authStateDir(), `${persona}.json`);
}

export function clearEphemeralAuthState(): void {
  const dir = authStateDir();
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseSessionCookie(setCookie: string | undefined): string {
  const raw = setCookie || "";
  const m = raw.match(/fersaku_session=([^;]+)/i);
  return m?.[1] ?? "";
}

function personaFor(surface: SeedSurface): {
  email: string;
  userId: string;
  surface: SeedSurface;
} {
  if (surface === "BUYER") {
    return {
      email: QLT110_SEED.personas.buyerA.email,
      userId: QLT110_SEED.personas.buyerA.userId,
      surface: "BUYER",
    };
  }
  return {
    email: QLT110_SEED.personas.sellerOwnerA.email,
    userId: QLT110_SEED.personas.sellerOwnerA.userId,
    surface: "SELLER",
  };
}

/**
 * Real API login against live backend (QLT-110 seed only).
 * Returns ephemeral cookie + CSRF — do not log raw cookie.
 */
export async function loginViaApi(
  request: APIRequestContext,
  surface: SeedSurface = "SELLER",
): Promise<AuthSession> {
  assertNonProductionHarness();
  const persona = personaFor(surface);
  const origin = apiOrigin().replace(/\/+$/, "");
  const res = await request.post(`${origin}/v1/auth/login`, {
    data: {
      email: persona.email,
      password: SEED_PASSWORD,
      surface: persona.surface,
    },
    headers: { Accept: "application/json" },
  });
  if (res.status() !== 200) {
    const body = await res.text();
    throw new Error(
      `loginViaApi ${surface} failed status=${res.status()} body=${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    data?: {
      csrfToken?: string;
      sessionId?: string;
      mfaRequired?: boolean;
      user?: { id?: string; email?: string; surface?: string };
    };
  };
  if (json.data?.mfaRequired) {
    throw new Error(
      "loginViaApi: seed persona MFA unexpected for parent harness",
    );
  }
  const cookie = parseSessionCookie(res.headers()["set-cookie"]);
  if (cookie.length < 8) {
    throw new Error("loginViaApi: missing fersaku_session cookie");
  }
  const csrfToken = json.data?.csrfToken || "";
  const sessionId = json.data?.sessionId || "";
  if (!csrfToken || !sessionId) {
    throw new Error("loginViaApi: missing csrf/sessionId");
  }
  return {
    cookie,
    csrfToken,
    sessionId,
    userId: json.data?.user?.id || persona.userId,
    surface: persona.surface,
    email: persona.email,
  };
}

/** Refresh CSRF via real GET /v1/auth/session. */
export async function refreshCsrf(
  request: APIRequestContext,
  cookie: string,
): Promise<string> {
  assertNonProductionHarness();
  const origin = apiOrigin().replace(/\/+$/, "");
  const res = await request.get(`${origin}/v1/auth/session`, {
    headers: {
      Accept: "application/json",
      Cookie: `fersaku_session=${cookie}`,
    },
  });
  if (res.status() !== 200) {
    throw new Error(`refreshCsrf status=${res.status()}`);
  }
  const json = (await res.json()) as {
    data?: { csrfToken?: string; sessionStatus?: string };
  };
  if (!json.data?.csrfToken) {
    throw new Error("refreshCsrf: missing csrfToken");
  }
  return json.data.csrfToken;
}

export async function logoutViaApi(
  request: APIRequestContext,
  session: Pick<AuthSession, "cookie" | "csrfToken">,
): Promise<void> {
  assertNonProductionHarness();
  const origin = apiOrigin().replace(/\/+$/, "");
  const csrf =
    session.csrfToken || (await refreshCsrf(request, session.cookie));
  await request.post(`${origin}/v1/auth/logout`, {
    data: {},
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `fersaku_session=${session.cookie}`,
      "X-CSRF-Token": csrf,
    },
  });
}

/**
 * Write Playwright storageState with session cookie only (no secrets beyond cookie).
 * Path is under gitignored test-results/api/.auth/.
 */
export function writeEphemeralStorageState(
  session: AuthSession,
  persona: "seller" | "buyer",
  baseURL?: string,
): string {
  assertNonProductionHarness();
  const dir = authStateDir();
  mkdirSync(dir, { recursive: true });
  const out = authStatePath(persona);
  const origin =
    baseURL ||
    process.env.PLAYWRIGHT_API_BASE_URL ||
    `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT || 3120}`;
  const url = new URL(origin);
  const state = {
    cookies: [
      {
        name: "fersaku_session",
        value: session.cookie,
        domain: url.hostname,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
  writeFileSync(out, JSON.stringify(state, null, 2), { mode: 0o600 });
  return out;
}

/** Browser context preloaded with ephemeral seller/buyer cookie. */
export async function newAuthenticatedContext(
  browser: Browser,
  request: APIRequestContext,
  surface: SeedSurface = "SELLER",
): Promise<{
  context: BrowserContext;
  session: AuthSession;
  statePath: string;
}> {
  assertNonProductionHarness();
  const session = await loginViaApi(request, surface);
  const persona = surface === "BUYER" ? "buyer" : "seller";
  const statePath = writeEphemeralStorageState(session, persona);
  const context = await browser.newContext({ storageState: statePath });
  return { context, session, statePath };
}

/**
 * Optional UI login path: fill real login form when baseURL is Next edge.
 * Falls back to API login + cookie inject when form not available.
 */
export async function loginViaUiOrApi(
  page: Page,
  request: APIRequestContext,
  surface: SeedSurface = "SELLER",
): Promise<AuthSession> {
  assertNonProductionHarness();
  const persona = personaFor(surface);
  const loginPath = surface === "BUYER" ? "/account/login" : "/login";
  try {
    await page.goto(loginPath, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    const email = page.getByLabel(/email|surel/i).first();
    const password = page.getByLabel(/password|kata sandi/i).first();
    if ((await email.count()) > 0 && (await password.count()) > 0) {
      await email.fill(persona.email);
      await password.fill(SEED_PASSWORD);
      await page
        .getByRole("button", { name: /masuk|login|sign in/i })
        .first()
        .click();
      await page.waitForTimeout(500);
      const cookies = await page.context().cookies();
      const sess = cookies.find((c) => c.name === "fersaku_session");
      if (sess?.value) {
        const csrf = await refreshCsrf(request, sess.value);
        return {
          cookie: sess.value,
          csrfToken: csrf,
          sessionId: "ui-session",
          userId: persona.userId,
          surface: persona.surface,
          email: persona.email,
        };
      }
    }
  } catch {
    // UI form may not be fully wired; API path is authoritative for parent harness.
  }
  return loginViaApi(request, surface);
}

/** Safe annotation value — never full cookie/token. */
export function sanitizeAuthSummary(session: AuthSession): string {
  return [
    `surface=${session.surface}`,
    `userId=${session.userId}`,
    `email=${session.email}`,
    `sessionId=${maskToken(session.sessionId)}`,
    `cookie=${maskToken(session.cookie)}`,
    `csrf=${maskToken(session.csrfToken)}`,
  ].join(" ");
}

/** Host patterns that must not appear in API-mode network (mock simulator). */
export const MOCK_NETWORK_BLOCKLIST = [
  /mock\.fersaku/i,
  /mock-simulator/i,
  /fixture\.local/i,
  /msw/i,
  /\/__mock\//i,
  /\/api\/mock\//i,
  /example\.test/i,
  /localhost:31(?!20)\d{2}/i, // mock e2e default 3100; allow API Next 3120
] as const;

export function isBlockedMockUrl(url: string): boolean {
  return MOCK_NETWORK_BLOCKLIST.some((re) => re.test(url));
}

/** Re-export seed emails for specs. */
export { SEED_PERSONAS, SEED_PASSWORD };
