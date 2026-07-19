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
  logoutSession,
} from "@/shared/auth/session-store";
import { decideRouteGuard } from "@/shared/auth/guards";
import { ApiError } from "@/shared/api/api-error";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  ADMIN_AUTH_MUTATION_KEYS,
  assertAuthMutationKeySafe,
  mapAdminLoginDataToResult,
  mapAdminLoginThrown,
  objectContainsPasswordLeak,
  resolveAdminPostAuthPath,
  toAdminLoginRequest,
} from "@/features/auth";
import { loginAdmin, logoutAdmin } from "@/features/auth/api";
import { createMockClaims } from "@/shared/auth/session-model";

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "req_adm100",
      timestamp: "2026-07-17T13:00:00Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_adm100",
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
        requestId: "req_adm100",
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

describe("ADM-100 admin auth mappers", () => {
  it("builds exact login DTO with ADMIN surface", () => {
    const login = toAdminLoginRequest({
      email: "  Dinda@Fersaku.ID ",
      password: "secret-pass-1",
    });
    expect(login).toEqual({
      email: "dinda@fersaku.id",
      password: "secret-pass-1",
      surface: "ADMIN",
    });
  });

  it("maps MFA login data without console redirect", () => {
    const result = mapAdminLoginDataToResult(
      {
        csrfToken: "csrf_raw_test",
        mfaRequired: true,
        sessionId: "sess_1",
      },
      "/admin/merchants",
    );
    expect(result.kind).toBe("mfa_pending");
    expect(result).not.toHaveProperty("redirectTo");
  });

  it("sanitizes returnTo and defaults admin home", () => {
    expect(resolveAdminPostAuthPath({ returnTo: "/admin/orders" })).toBe(
      "/admin/orders",
    );
    expect(
      resolveAdminPostAuthPath({ returnTo: "https://evil.example/x" }),
    ).toBe("/admin");
    expect(resolveAdminPostAuthPath({ returnTo: "/dashboard" })).toBe("/admin");
    expect(resolveAdminPostAuthPath({ returnTo: "//evil.example" })).toBe(
      "/admin",
    );
  });

  it("maps invalid credentials without enumeration", () => {
    const err = new ApiError(401, {
      code: PROBLEM_CODES.AUTH_INVALID_CREDENTIALS,
      message: "Invalid",
    });
    const mapped = mapAdminLoginThrown(err);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok && mapped.kind === "field_errors") {
      expect(mapped.fields[0]?.field).toBe("password");
      expect(mapped.fields[0]?.message).not.toMatch(
        /tidak terdaftar|not found/i,
      );
    }
  });

  it("mutation keys never contain password", () => {
    for (const key of Object.values(ADMIN_AUTH_MUTATION_KEYS)) {
      expect(() => assertAuthMutationKeySafe(key)).not.toThrow();
      expect(objectContainsPasswordLeak({ key: [...key] })).toBe(false);
    }
  });
});

describe("ADM-100 route guards (non-admin / MFA)", () => {
  it("denies seller session on admin console", () => {
    const claims = createMockClaims("seller");
    const d = decideRouteGuard({
      pathname: "/admin",
      snapshot: { status: "authenticated", claims, errorCode: null },
      requiredSurface: "admin",
      requireMfaVerified: true,
    });
    expect(d.action).toBe("redirect");
    if (d.action === "redirect") {
      expect(d.href).toBe("/admin/login");
      expect(d.reason).toBe("wrong_surface");
    }
  });

  it("denies MFA_PENDING from admin console", () => {
    const claims = {
      ...createMockClaims("admin"),
      mfaEnabled: true,
      mfaVerified: false,
    };
    const d = decideRouteGuard({
      pathname: "/admin/merchants",
      snapshot: { status: "mfa_pending", claims, errorCode: null },
      requiredSurface: "admin",
      requireMfaVerified: true,
    });
    expect(d.action).toBe("redirect");
    if (d.action === "redirect") {
      expect(d.href).toContain("/admin/login");
      expect(d.reason).toBe("mfa_pending");
    }
  });

  it("allows MFA_PENDING on admin login entry", () => {
    const claims = {
      ...createMockClaims("admin"),
      mfaEnabled: true,
      mfaVerified: false,
    };
    const d = decideRouteGuard({
      pathname: "/admin/login",
      snapshot: { status: "mfa_pending", claims, errorCode: null },
    });
    expect(d.action).toBe("allow");
  });

  it("allows verified admin on console", () => {
    const claims = createMockClaims("admin");
    const d = decideRouteGuard({
      pathname: "/admin",
      snapshot: { status: "authenticated", claims, errorCode: null },
      requiredSurface: "admin",
      requireMfaVerified: true,
    });
    expect(d.action).toBe("allow");
  });

  it("anonymous admin console redirects to login with returnTo", () => {
    const d = decideRouteGuard({
      pathname: "/admin/orders",
      snapshot: { status: "anonymous", claims: null, errorCode: null },
      requiredSurface: "admin",
      requireMfaVerified: true,
    });
    expect(d.action).toBe("redirect");
    if (d.action === "redirect") {
      expect(d.href).toContain("/admin/login");
      expect(d.href).toContain("returnTo=");
    }
  });
});

describe("ADM-100 admin auth API", () => {
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

  it("mock login bootstraps admin session without network", async () => {
    installMockAuth();
    const login = await loginAdmin(
      toAdminLoginRequest({ email: "a@b.com", password: "password1" }),
      { returnTo: "/admin/merchants" },
    );
    expect(login.ok).toBe(true);
    if (login.ok && login.kind === "authenticated") {
      expect(login.redirectTo).toBe("/admin/merchants");
    }
    const snap = getSessionSnapshot();
    expect(snap.status).toBe("authenticated");
    expect(snap.claims?.surface).toBe("admin");
  });

  it("API login posts ADMIN surface, applies CSRF, bootstraps session", async () => {
    installApiAuth();
    const qc = new QueryClient();
    bindSessionQueryClient(qc);

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/auth/login") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          expect(body.surface).toBe("ADMIN");
          expect(body.password).toBe("password1");
          expect(body.email).toBe("admin@example.com");
          return jsonResponse(
            envelope({
              sessionId: "sess_admin",
              csrfToken: "csrf_admin_login",
              mfaRequired: false,
              user: { id: "adm1" },
            }),
          );
        }
        if (url.includes("/v1/auth/session")) {
          return jsonResponse(
            envelope({
              userId: "adm1",
              sessionId: "sess_admin",
              surface: "ADMIN",
              email: "admin@example.com",
              name: "Admin",
              mfaEnabled: true,
              mfaVerified: true,
              emailVerified: true,
              status: "ACTIVE",
              csrfToken: "csrf_admin_sess",
              permissions: ["*"],
              roles: ["super_admin"],
            }),
          );
        }
        return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginAdmin(
      toAdminLoginRequest({
        email: "admin@example.com",
        password: "password1",
      }),
      { returnTo: "/admin/orders" },
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "authenticated") {
      expect(result.redirectTo).toBe("/admin/orders");
    }
    expect(getCsrfToken()).toBeTruthy();
    const snap = getSessionSnapshot();
    expect(snap.status).toBe("authenticated");
    expect(snap.claims?.subjectId).toBe("adm1");
    expect(snap.claims?.surface).toBe("admin");
  });

  it("API MFA_PENDING does not mark full console redirect", async () => {
    installApiAuth();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/auth/login") && init?.method === "POST") {
          return jsonResponse(
            envelope({
              sessionId: "sess_mfa",
              csrfToken: "csrf_mfa",
              mfaRequired: true,
            }),
          );
        }
        if (url.includes("/v1/auth/session")) {
          return jsonResponse(
            envelope({
              userId: "u_mfa",
              sessionId: "sess_mfa",
              surface: "ADMIN",
              email: "mfa@example.com",
              name: "MFA Admin",
              mfaEnabled: true,
              mfaVerified: false,
              emailVerified: true,
              status: "ACTIVE",
              sessionStatus: "MFA_PENDING",
              csrfToken: "csrf_mfa_sess",
              permissions: [],
              roles: ["admin"],
            }),
          );
        }
        return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginAdmin(
      toAdminLoginRequest({ email: "mfa@example.com", password: "password1" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("mfa_pending");
      expect(result).not.toHaveProperty("redirectTo");
    }
    expect(getSessionSnapshot().status).toBe("mfa_pending");
  });

  it("API non-admin / forbidden maps without success", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        problemResponse(403, PROBLEM_CODES.FORBIDDEN, {
          message: "Admin MFA enrollment required",
        }),
      ),
    );
    const result = await loginAdmin(
      toAdminLoginRequest({ email: "x@y.com", password: "password1" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["field_errors", "blocked", "generic"]).toContain(result.kind);
    }
  });

  it("API invalid credentials map to field error without success", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        problemResponse(401, PROBLEM_CODES.AUTH_INVALID_CREDENTIALS),
      ),
    );
    const result = await loginAdmin(
      toAdminLoginRequest({ email: "x@y.com", password: "password1" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("field_errors");
  });

  it("rate limit does not map to fake success", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => problemResponse(429, PROBLEM_CODES.RATE_LIMITED)),
    );
    const result = await loginAdmin(
      toAdminLoginRequest({ email: "x@y.com", password: "password1" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("blocked");
  });

  it("logout clears admin session and returns login href", async () => {
    installMockAuth();
    await loginAdmin(
      toAdminLoginRequest({ email: "a@b.com", password: "password1" }),
    );
    expect(getSessionSnapshot().status).toBe("authenticated");

    // redirect:false avoids window.location.assign in node vitest.
    const { loginHref } = await logoutSession({
      surface: "admin",
      redirect: false,
    });
    expect(loginHref).toBe("/admin/login");
    expect(getSessionSnapshot().status).toBe("anonymous");
    expect(getSessionSnapshot().claims).toBeNull();
    expect(typeof logoutAdmin).toBe("function");
  });
});
