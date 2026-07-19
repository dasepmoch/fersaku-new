import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { __resetCsrfModuleForTests, getCsrfToken } from "@/shared/api/csrf";
import {
  __resetSessionStoreForTests,
  bindSessionQueryClient,
  bootstrapSession,
  getSessionSnapshot,
  logoutSession,
  applyRemoteLogout,
} from "@/shared/auth/session-store";
import {
  claimsCacheIdentity,
  createMockClaims,
  mapAuthSessionToClaims,
} from "@/shared/auth/session-model";
import {
  buildLoginHref,
  isSafeReturnTo,
  resolvePostLoginPath,
  sanitizeReturnTo,
  sanitizeReturnToForSurface,
} from "@/shared/auth/return-to";
import { decideRouteGuard } from "@/shared/auth/guards";
import {
  clearPrivateQueryCache,
  isPrivateQueryKey,
} from "@/shared/auth/private-cache";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "req_session_test",
      timestamp: "2026-07-17T10:00:00Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_session_test",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_session_test",
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

describe("INT-120 session bootstrap / guards / logout", () => {
  beforeEach(() => {
    __resetSessionStoreForTests();
    __resetCsrfModuleForTests();
    clearDomainSourceSnapshot();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    __resetSessionStoreForTests();
    __resetCsrfModuleForTests();
    clearDomainSourceSnapshot();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("returnTo safety", () => {
    it("accepts relative same-origin paths only", () => {
      expect(isSafeReturnTo("/account/purchases")).toBe(true);
      expect(isSafeReturnTo("/dashboard/orders?tab=1")).toBe(true);
      expect(isSafeReturnTo("//evil.com")).toBe(false);
      expect(isSafeReturnTo("https://evil.com")).toBe(false);
      expect(isSafeReturnTo("/\\evil")).toBe(false);
      expect(isSafeReturnTo("javascript:alert(1)")).toBe(false);
      expect(sanitizeReturnTo("https://evil.com")).toBeNull();
      expect(sanitizeReturnTo("/admin/orders")).toBe("/admin/orders");
    });

    it("scopes returnTo to surface prefix", () => {
      expect(sanitizeReturnToForSurface("/dashboard/products", "seller")).toBe(
        "/dashboard/products",
      );
      expect(sanitizeReturnToForSurface("/admin", "seller")).toBeNull();
      expect(sanitizeReturnToForSurface("/account/login", "buyer")).toBeNull();
      expect(buildLoginHref("buyer", "/account/security")).toContain(
        "returnTo=",
      );
      expect(resolvePostLoginPath("admin", "/admin/merchants")).toBe(
        "/admin/merchants",
      );
      expect(resolvePostLoginPath("admin", "https://x")).toBe("/admin");
    });
  });

  describe("route guards", () => {
    it("waits while bootstrap loading on private routes", () => {
      const d = decideRouteGuard({
        pathname: "/dashboard",
        snapshot: { status: "loading", claims: null, errorCode: null },
        requiredSurface: "seller",
      });
      expect(d.action).toBe("wait");
    });

    it("redirects missing session to surface login with returnTo", () => {
      const d = decideRouteGuard({
        pathname: "/account/purchases",
        snapshot: { status: "anonymous", claims: null, errorCode: null },
        requiredSurface: "buyer",
      });
      expect(d.action).toBe("redirect");
      if (d.action === "redirect") {
        expect(d.href).toContain("/account/login");
        expect(d.href).toContain("returnTo=");
        expect(d.reason).toBe("missing_session");
      }
    });

    it("rejects wrong surface without open redirect", () => {
      const claims = createMockClaims("seller");
      const d = decideRouteGuard({
        pathname: "/admin",
        snapshot: {
          status: "authenticated",
          claims,
          errorCode: null,
        },
        requiredSurface: "admin",
      });
      expect(d.action).toBe("redirect");
      if (d.action === "redirect") {
        expect(d.href).toBe("/admin/login");
        expect(d.reason).toBe("wrong_surface");
      }
    });

    it("allows matching authenticated surface", () => {
      const claims = createMockClaims("admin");
      const d = decideRouteGuard({
        pathname: "/admin/merchants",
        snapshot: {
          status: "authenticated",
          claims,
          errorCode: null,
        },
        requiredSurface: "admin",
      });
      expect(d).toEqual({ action: "allow" });
    });

    it("redirects authenticated user away from auth entry", () => {
      const claims = createMockClaims("seller");
      const d = decideRouteGuard({
        pathname: "/login",
        snapshot: {
          status: "authenticated",
          claims,
          errorCode: null,
        },
      });
      expect(d.action).toBe("redirect");
      if (d.action === "redirect") {
        expect(d.href).toBe("/dashboard");
      }
    });
  });

  describe("claims mapping (no raw token)", () => {
    it("maps session DTO without exposing csrf on claims", () => {
      const claims = mapAuthSessionToClaims(
        {
          userId: "usr_1",
          sessionId: "sess_1",
          surface: "SELLER",
          email: "a@b.c",
          name: "A",
          mfaVerified: true,
          mfaEnabled: true,
          emailVerified: true,
          status: "ACTIVE",
          csrfToken: "raw_csrf_secret",
          permissions: ["seller.products.read"],
          roles: ["seller"],
        },
        "api",
      );
      expect(claims).not.toBeNull();
      expect(claims!.subjectId).toBe("usr_1");
      expect(claims!.surface).toBe("seller");
      expect(claims!.permissions).toContain("seller.products.read");
      expect(JSON.stringify(claims)).not.toContain("raw_csrf_secret");
      expect(JSON.stringify(claims)).not.toContain("csrf");
    });
  });

  describe("bootstrap", () => {
    it("dedupes concurrent bootstrap to one GET /session", async () => {
      installApiAuth();
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          calls += 1;
          await new Promise((r) => setTimeout(r, 20));
          return jsonResponse(
            envelope({
              userId: "usr_api",
              sessionId: "sess_api",
              surface: "BUYER",
              email: "buyer@example.com",
              name: "Buyer",
              mfaVerified: false,
              csrfToken: "csrf_from_session",
              permissions: ["buyer.*"],
              roles: ["buyer"],
            }),
          );
        }),
      );

      const [a, b, c] = await Promise.all([
        bootstrapSession(),
        bootstrapSession(),
        bootstrapSession(),
      ]);
      expect(calls).toBe(1);
      expect(a.claims?.subjectId).toBe("usr_api");
      expect(b.claims?.subjectId).toBe("usr_api");
      expect(c.status).toBe("authenticated");
      expect(getCsrfToken()).toBe("csrf_from_session");
    });

    it("never hardcodes identity in API mode when unauthenticated", async () => {
      installApiAuth();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          problemResponse(401, PROBLEM_CODES.AUTH_REQUIRED),
        ),
      );
      const snap = await bootstrapSession();
      expect(snap.status).toBe("anonymous");
      expect(snap.claims).toBeNull();
      expect(getCsrfToken()).toBeUndefined();
    });

    it("uses mock claims only when auth domain is mock", async () => {
      installMockAuth();
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const snap = await bootstrapSession({ mockSurface: "admin" });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(snap.claims?.mode).toBe("mock");
      expect(snap.claims?.surface).toBe("admin");
      expect(snap.claims?.subjectId).toBe("mock_admin");
    });
  });

  describe("logout + cache clear", () => {
    it("clears private query cache keys only", () => {
      const client = new QueryClient();
      client.setQueryData(["buyer", "purchases"], { items: [1] });
      client.setQueryData(["admin", "merchants", {}], { items: [2] });
      client.setQueryData(["public", "catalog"], { items: [3] });
      client.setQueryData(["theme"], "dark");

      expect(isPrivateQueryKey(["buyer", "purchases"])).toBe(true);
      expect(isPrivateQueryKey(["public", "catalog"])).toBe(false);

      clearPrivateQueryCache(client);
      expect(client.getQueryData(["buyer", "purchases"])).toBeUndefined();
      expect(client.getQueryData(["admin", "merchants", {}])).toBeUndefined();
      expect(client.getQueryData(["public", "catalog"])).toEqual({
        items: [3],
      });
      expect(client.getQueryData(["theme"])).toBe("dark");
    });

    it("logout posts backend, clears CSRF and private cache, returns login href", async () => {
      installApiAuth();
      const client = new QueryClient();
      bindSessionQueryClient(client);
      client.setQueryData(["seller", "store1", "products"], { ok: true });

      // bootstrap first
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.includes("/v1/auth/session") && (!init?.method || init.method === "GET")) {
            return jsonResponse(
              envelope({
                userId: "usr_s",
                sessionId: "sess_s",
                surface: "SELLER",
                csrfToken: "csrf_login",
                permissions: [],
                roles: [],
              }),
            );
          }
          if (url.includes("/v1/auth/logout")) {
            return jsonResponse(
              envelope({ message: "Logged out" }),
            );
          }
          return problemResponse(404, "NOT_FOUND");
        }),
      );

      await bootstrapSession();
      expect(getCsrfToken()).toBe("csrf_login");
      expect(getSessionSnapshot().claims?.subjectId).toBe("usr_s");

      const { loginHref } = await logoutSession({
        surface: "seller",
        redirect: false,
      });
      expect(loginHref).toBe("/login");
      expect(getCsrfToken()).toBeUndefined();
      expect(getSessionSnapshot().status).toBe("anonymous");
      expect(client.getQueryData(["seller", "store1", "products"])).toBeUndefined();

      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const logoutCall = calls.find((c) =>
        String(c[0]).includes("/v1/auth/logout"),
      );
      expect(logoutCall).toBeTruthy();
      expect(String(logoutCall?.[1]?.method || "").toUpperCase()).toBe("POST");
    });

    it("remote logout clears local state without second network hop", async () => {
      installMockAuth();
      await bootstrapSession({ mockSurface: "buyer" });
      expect(getSessionSnapshot().status).toBe("authenticated");
      applyRemoteLogout();
      expect(getSessionSnapshot().status).toBe("anonymous");
      expect(getSessionSnapshot().claims).toBeNull();
    });

    it("clears cache when actor identity changes", async () => {
      installApiAuth();
      const client = new QueryClient();
      bindSessionQueryClient(client);
      client.setQueryData(["buyer", "profile"], { name: "old" });

      let step = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          step += 1;
          if (step === 1) {
            return jsonResponse(
              envelope({
                userId: "usr_a",
                sessionId: "sess_a",
                surface: "BUYER",
                csrfToken: "csrf_a",
                permissions: [],
                roles: [],
              }),
            );
          }
          return jsonResponse(
            envelope({
              userId: "usr_b",
              sessionId: "sess_b",
              surface: "BUYER",
              csrfToken: "csrf_b",
              permissions: [],
              roles: [],
            }),
          );
        }),
      );

      await bootstrapSession();
      expect(claimsCacheIdentity(getSessionSnapshot().claims)).toContain(
        "usr_a",
      );
      client.setQueryData(["buyer", "profile"], { name: "a" });
      await bootstrapSession({ force: true });
      expect(getSessionSnapshot().claims?.subjectId).toBe("usr_b");
      expect(client.getQueryData(["buyer", "profile"])).toBeUndefined();
    });
  });
});
