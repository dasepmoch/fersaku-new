import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { __resetCsrfModuleForTests, getCsrfToken } from "@/shared/api/csrf";
import {
  __resetSessionStoreForTests,
  bindSessionQueryClient,
  getSessionSnapshot,
} from "@/shared/auth/session-store";
import { ApiError } from "@/shared/api/api-error";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  assertAuthMutationKeySafe,
  BUYER_AUTH_MUTATION_KEYS,
  hasForbiddenTokenInLocation,
  mapMagicLinkConsumeData,
  mapMagicLinkConsumeThrown,
  mapMagicLinkRequestThrown,
  objectContainsMagicTokenLeak,
  objectContainsPasswordLeak,
  parseMagicLinkFragmentToken,
  resolveBuyerPostAuthPath,
  scrubUrlFragment,
  toBuyerMagicLinkConsumeRequest,
  toBuyerMagicLinkRequest,
} from "@/features/auth";
import {
  consumeBuyerMagicLink,
  requestBuyerMagicLink,
} from "@/features/auth/api";
import { readFileSync } from "node:fs";
import path from "node:path";

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "req_aut110",
      timestamp: "2026-07-17T13:00:00Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_aut110",
    },
  });
}

function problemResponse(
  status: number,
  code: string,
  details?: Record<string, unknown>,
) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_aut110",
        details,
      },
    },
    status,
  );
}

function installApiAuth() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockAuth() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

describe("AUT-110 fragment token helpers", () => {
  it("parses token from URL fragment only", () => {
    expect(parseMagicLinkFragmentToken("#token=opaque_abc")).toBe("opaque_abc");
    expect(parseMagicLinkFragmentToken("token=opaque_abc")).toBe("opaque_abc");
    expect(parseMagicLinkFragmentToken("#token=a%2Fb&x=1")).toBe("a/b");
    expect(parseMagicLinkFragmentToken("")).toBeNull();
    expect(parseMagicLinkFragmentToken("#")).toBeNull();
    expect(parseMagicLinkFragmentToken("#other=1")).toBeNull();
  });

  it("detects forbidden query/path token placement", () => {
    expect(
      hasForbiddenTokenInLocation({ search: "?token=leak", pathname: "/account/verify" }),
    ).toBe(true);
    expect(
      hasForbiddenTokenInLocation({
        search: "?returnTo=%2Faccount%2Fpurchases",
        pathname: "/account/verify",
      }),
    ).toBe(false);
    expect(
      hasForbiddenTokenInLocation({
        search: "",
        pathname: "/account/verify/token/abc",
      }),
    ).toBe(true);
  });

  it("scrubs hash via replaceState without leaving token in location", () => {
    const replaceState = vi.fn();
    const location = {
      pathname: "/account/verify",
      search: "",
      hash: "#token=secret_scrub_me",
      href: "https://app.example/account/verify#token=secret_scrub_me",
    };
    vi.stubGlobal("window", {
      location,
      history: {
        state: null,
        replaceState: (
          state: unknown,
          _title: string,
          url?: string | null,
        ) => {
          replaceState(state, _title, url);
          if (typeof url === "string") {
            location.hash = "";
            location.href = `https://app.example${url}`;
          }
        },
      },
    });
    scrubUrlFragment();
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/account/verify",
    );
    expect(location.hash).toBe("");
    expect(location.href).not.toMatch(/secret_scrub_me/);
    vi.unstubAllGlobals();
  });

  it("resolves safe buyer returnTo and rejects open redirects", () => {
    expect(resolveBuyerPostAuthPath({ returnTo: "/account/purchases/1" })).toBe(
      "/account/purchases/1",
    );
    expect(resolveBuyerPostAuthPath({ returnTo: "https://evil.example" })).toBe(
      "/account/purchases",
    );
    expect(resolveBuyerPostAuthPath({ returnTo: "//evil.example" })).toBe(
      "/account/purchases",
    );
    expect(resolveBuyerPostAuthPath({ returnTo: "/dashboard" })).toBe(
      "/account/purchases",
    );
    expect(resolveBuyerPostAuthPath({ returnTo: "/account/login" })).toBe(
      "/account/purchases",
    );
  });

  it("builds exact request/consume DTOs", () => {
    expect(toBuyerMagicLinkRequest({ email: "  Nadia@Studio.ID " })).toEqual({
      email: "nadia@studio.id",
    });
    expect(
      toBuyerMagicLinkConsumeRequest({ token: "  opaque_token  " }),
    ).toEqual({ token: "opaque_token" });
  });
});

describe("AUT-110 mappers + secret guards", () => {
  it("mutation keys never contain token values or password", () => {
    for (const key of Object.values(BUYER_AUTH_MUTATION_KEYS)) {
      expect(() => assertAuthMutationKeySafe(key)).not.toThrow();
      expect(objectContainsPasswordLeak({ key: [...key] })).toBe(false);
    }
  });

  it("generic request success message does not enumerate accounts", () => {
    const err = new ApiError(429, {
      code: PROBLEM_CODES.RATE_LIMITED,
      message: "slow down",
    });
    const mapped = mapMagicLinkRequestThrown(err);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) expect(mapped.kind).toBe("blocked");
  });

  it("maps invalid/expired consume to invalid_token without leaking token", () => {
    const raw = "super-secret-magic-token-xyz";
    const err = new ApiError(401, {
      code: PROBLEM_CODES.AUTH_INVALID_CREDENTIALS,
      message: "bad",
      details: { token: raw },
    });
    const mapped = mapMagicLinkConsumeThrown(err);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) expect(mapped.kind).toBe("invalid_token");
    expect(objectContainsMagicTokenLeak(mapped, raw)).toBe(false);
  });

  it("maps consume data to buyer redirect without password leak", () => {
    const result = mapMagicLinkConsumeData(
      { csrfToken: "csrf_buyer", mfaRequired: false, sessionId: "s1" },
      "/account/profile",
    );
    expect(result.ok).toBe(true);
    expect(result.redirectTo).toBe("/account/profile");
    expect(objectContainsPasswordLeak(result)).toBe(false);
  });
});

describe("AUT-110 buyer magic-link API", () => {
  beforeEach(() => {
    __resetCsrfModuleForTests();
    __resetSessionStoreForTests();
    clearDomainSourceSnapshot();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
    __resetSessionStoreForTests();
    __resetCsrfModuleForTests();
    vi.unstubAllGlobals();
  });

  it("mock request always generic_sent without network", async () => {
    installMockAuth();
    const result = await requestBuyerMagicLink(
      toBuyerMagicLinkRequest({ email: "anyone@example.com" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("generic_sent");
      expect(result.message).toMatch(/if an account exists/i);
    }
  });

  it("mock consume bootstraps buyer session + safe returnTo", async () => {
    installMockAuth();
    const result = await consumeBuyerMagicLink(
      toBuyerMagicLinkConsumeRequest({ token: "mock_buyer_token" }),
      { returnTo: "/account/purchases" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("authenticated");
      expect(result.redirectTo).toBe("/account/purchases");
    }
    expect(getSessionSnapshot().status).toBe("authenticated");
    expect(getSessionSnapshot().claims?.surface).toBe("buyer");
  });

  it("API request posts email only and returns generic success", async () => {
    installApiAuth();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("/v1/auth/magic-link/request");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ email: "buyer@example.com" });
      expect(body).not.toHaveProperty("token");
      expect(body).not.toHaveProperty("password");
      return jsonResponse(
        envelope({
          message:
            "If an account exists for that email, a sign-in link has been sent",
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestBuyerMagicLink(
      toBuyerMagicLinkRequest({ email: "Buyer@Example.com" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("generic_sent");
  });

  it("API request unknown email still generic (anti-enumeration)", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          envelope({
            message:
              "If an account exists for that email, a sign-in link has been sent",
          }),
        ),
      ),
    );
    const known = await requestBuyerMagicLink({ email: "known@example.com" });
    const ghost = await requestBuyerMagicLink({ email: "ghost@example.com" });
    expect(known.ok).toBe(true);
    expect(ghost.ok).toBe(true);
    if (known.ok && ghost.ok) {
      expect(known.kind).toBe(ghost.kind);
    }
  });

  it("API consume posts token in body only, applies CSRF + session", async () => {
    installApiAuth();
    const qc = new QueryClient();
    bindSessionQueryClient(qc);
    const secret = "opaque_magic_one_time";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/auth/magic-link/consume") && init?.method === "POST") {
        expect(url).not.toMatch(/token=/);
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({ token: secret });
        return jsonResponse(
          envelope({
            sessionId: "sess_buyer",
            csrfToken: "csrf_magic_raw",
            mfaRequired: false,
            user: { id: "buyer_1" },
          }),
        );
      }
      if (url.includes("/v1/auth/session")) {
        return jsonResponse(
          envelope({
            userId: "buyer_1",
            sessionId: "sess_buyer",
            surface: "BUYER",
            email: "buyer@example.com",
            name: "Buyer",
            mfaEnabled: false,
            mfaVerified: true,
            emailVerified: true,
            status: "ACTIVE",
            csrfToken: "csrf_session_buyer",
            permissions: ["buyer.*"],
            roles: ["buyer"],
          }),
        );
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await consumeBuyerMagicLink(
      toBuyerMagicLinkConsumeRequest({ token: secret }),
      { returnTo: "/account/profile" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.redirectTo).toBe("/account/profile");
      expect(objectContainsMagicTokenLeak(result, secret)).toBe(false);
    }
    expect(getCsrfToken()).toBeTruthy();
    const snap = getSessionSnapshot();
    expect(snap.status).toBe("authenticated");
    expect(snap.claims?.subjectId).toBe("buyer_1");
    expect(snap.claims?.surface).toBe("buyer");

    for (const mut of qc.getMutationCache().getAll()) {
      expect(JSON.stringify(mut.options.mutationKey ?? [])).not.toContain(secret);
    }
  });

  it("API invalid/expired token does not create session", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        problemResponse(401, PROBLEM_CODES.AUTH_INVALID_CREDENTIALS),
      ),
    );
    const result = await consumeBuyerMagicLink(
      toBuyerMagicLinkConsumeRequest({ token: "expired_or_reused" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("invalid_token");
    expect(getSessionSnapshot().status).not.toBe("authenticated");
  });

  it("rate limit on request does not map to fake sent", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => problemResponse(429, PROBLEM_CODES.RATE_LIMITED)),
    );
    const result = await requestBuyerMagicLink({ email: "x@y.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("blocked");
  });

  it("empty token rejected without network", async () => {
    installApiAuth();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await consumeBuyerMagicLink({ token: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("invalid_token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AUT-110 source architecture (no query token)", () => {
  it("buyer-login does not link magic token via query string", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/buyer-login.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/verify\?token=/);
    expect(src).not.toMatch(/\?token=/);
    // Mock prototype may use fragment only.
    if (src.includes("mock_buyer_token")) {
      expect(src).toMatch(/#token=/);
    }
  });

  it("buyer-verify scrubs fragment and posts consume body", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/buyer-verify.tsx"),
      "utf8",
    );
    expect(src).toMatch(/scrubUrlFragment/);
    expect(src).toMatch(/parseMagicLinkFragmentToken/);
    expect(src).toMatch(/useBuyerMagicLinkConsumeMutation|consumeBuyerMagicLink/);
    expect(src).not.toMatch(/searchParams\.get\(["']token["']\)/);
  });
});
