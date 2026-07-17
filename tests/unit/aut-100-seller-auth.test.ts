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
  mapFieldViolationsToAuthFields,
  mapLoginDataToResult,
  mapLoginThrown,
  mapRegisterThrown,
  objectContainsPasswordLeak,
  resolveSellerPostAuthPath,
  toSellerLoginRequest,
  toSellerRegisterRequest,
  SELLER_AUTH_MUTATION_KEYS,
} from "@/features/auth";
import {
  forgotSellerPassword,
  loginSeller,
  registerSeller,
} from "@/features/auth/api";

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "req_aut100",
      timestamp: "2026-07-17T13:00:00Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_aut100",
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
        requestId: "req_aut100",
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

describe("AUT-100 seller auth mappers", () => {
  it("builds exact register/login DTOs with SELLER surface", () => {
    const reg = toSellerRegisterRequest({
      email: "  Asep@Email.COM ",
      password: "secret-pass-1",
      name: " Asep ",
    });
    expect(reg).toEqual({
      email: "asep@email.com",
      password: "secret-pass-1",
      name: "Asep",
      surface: "SELLER",
    });
    const login = toSellerLoginRequest({
      email: "Asep@Email.COM",
      password: "secret-pass-1",
    });
    expect(login.surface).toBe("SELLER");
    expect(login.email).toBe("asep@email.com");
  });

  it("maps field violations to existing AuthForm fields only", () => {
    const fields = mapFieldViolationsToAuthFields([
      { field: "email", code: "INVALID", message: "Masukkan email yang valid" },
      { field: "body.password", code: "TOO_SHORT", message: "Minimal 8 karakter" },
      { field: "unknown", code: "X" },
    ]);
    expect(fields).toEqual([
      { field: "email", message: "Masukkan email yang valid" },
      { field: "password", message: "Minimal 8 karakter" },
    ]);
  });

  it("maps invalid credentials to password field (generic, no enumeration)", () => {
    const err = new ApiError(401, {
      code: PROBLEM_CODES.AUTH_INVALID_CREDENTIALS,
      message: "Invalid",
    });
    const mapped = mapLoginThrown(err);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok && mapped.kind === "field_errors") {
      expect(mapped.fields[0]?.field).toBe("password");
      expect(mapped.fields[0]?.message).not.toMatch(/tidak terdaftar|not found/i);
    }
  });

  it("maps MFA login data without dashboard redirect", () => {
    const result = mapLoginDataToResult(
      {
        csrfToken: "csrf_raw_test",
        mfaRequired: true,
        sessionId: "sess_1",
      },
      "/dashboard/orders",
    );
    expect(result.kind).toBe("mfa_pending");
    expect(result).not.toHaveProperty("redirectTo");
  });

  it("sanitizes returnTo and defaults seller home", () => {
    expect(resolveSellerPostAuthPath({ returnTo: "/dashboard/orders" })).toBe(
      "/dashboard/orders",
    );
    expect(
      resolveSellerPostAuthPath({ returnTo: "https://evil.example/x" }),
    ).toBe("/dashboard");
    expect(
      resolveSellerPostAuthPath({ returnTo: "//evil.example", preferOnboarding: true }),
    ).toBe("/dashboard/onboarding");
  });

  it("mutation keys never contain password", () => {
    for (const key of Object.values(SELLER_AUTH_MUTATION_KEYS)) {
      expect(() => assertAuthMutationKeySafe(key)).not.toThrow();
      expect(objectContainsPasswordLeak({ key: [...key] })).toBe(false);
    }
    expect(() =>
      assertAuthMutationKeySafe(["auth", "login", { password: "x" } as const]),
    ).toThrow(/secrets/);
    expect(() => assertAuthMutationKeySafe(["auth", "password"])).toThrow(
      /secrets/,
    );
  });

  it("register mapper does not leak password from ApiError details", () => {
    const err = new ApiError(400, {
      code: PROBLEM_CODES.VALIDATION_FAILED,
      message: "v",
      details: {
        fields: [{ field: "password", code: "WEAK", message: "Minimal 8 karakter" }],
        submitted: { password: "super-secret-should-not-map" },
      },
    });
    const mapped = mapRegisterThrown(err);
    expect(objectContainsPasswordLeak(mapped)).toBe(false);
    if (!mapped.ok && mapped.kind === "field_errors") {
      expect(mapped.fields.some((f) => f.field === "password")).toBe(true);
    }
  });
});

describe("AUT-100 seller auth API", () => {
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

  it("mock register/login/forgot succeed without network", async () => {
    installMockAuth();
    const reg = await registerSeller(
      toSellerRegisterRequest({
        email: "a@b.com",
        password: "password1",
        name: "A",
      }),
    );
    expect(reg.ok).toBe(true);

    const forgot = await forgotSellerPassword({ email: "a@b.com" });
    expect(forgot.ok).toBe(true);
    if (forgot.ok) expect(forgot.kind).toBe("generic_sent");

    const login = await loginSeller(
      toSellerLoginRequest({ email: "a@b.com", password: "password1" }),
    );
    expect(login.ok).toBe(true);
    if (login.ok && login.kind === "authenticated") {
      expect(login.redirectTo).toBe("/dashboard");
    }
    expect(getSessionSnapshot().status).toBe("authenticated");
  });

  it("API login applies CSRF and bootstraps session", async () => {
    installApiAuth();
    const qc = new QueryClient();
    bindSessionQueryClient(qc);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/auth/login") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.surface).toBe("SELLER");
        expect(body.password).toBe("password1");
        expect(body.email).toBe("seller@example.com");
        // body is transport-only; must not be cached as query key
        return jsonResponse(
          envelope({
            sessionId: "sess_api",
            csrfToken: "csrf_login_raw",
            mfaRequired: false,
            user: { id: "u1" },
          }),
        );
      }
      if (url.includes("/v1/auth/session")) {
        return jsonResponse(
          envelope({
            userId: "u1",
            sessionId: "sess_api",
            surface: "SELLER",
            email: "seller@example.com",
            name: "Seller",
            mfaEnabled: false,
            mfaVerified: true,
            emailVerified: true,
            status: "ACTIVE",
            csrfToken: "csrf_session_raw",
            permissions: ["seller.*"],
            roles: ["seller"],
          }),
        );
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginSeller(
      toSellerLoginRequest({
        email: "seller@example.com",
        password: "password1",
      }),
      { returnTo: "/dashboard/products" },
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "authenticated") {
      expect(result.redirectTo).toBe("/dashboard/products");
    }
    expect(getCsrfToken()).toBeTruthy();
    const snap = getSessionSnapshot();
    expect(snap.status).toBe("authenticated");
    expect(snap.claims?.subjectId).toBe("u1");
    expect(snap.claims?.surface).toBe("seller");

    // Password must not appear in any mutation cache keys
    for (const mut of qc.getMutationCache().getAll()) {
      expect(JSON.stringify(mut.options.mutationKey ?? [])).not.toMatch(
        /password1|password/i,
      );
    }
  });

  it("API MFA_PENDING does not mark full authenticated redirect", async () => {
    installApiAuth();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
            surface: "SELLER",
            email: "mfa@example.com",
            name: "MFA User",
            mfaEnabled: true,
            mfaVerified: false,
            emailVerified: true,
            status: "ACTIVE",
            sessionStatus: "MFA_PENDING",
            csrfToken: "csrf_mfa_sess",
            permissions: ["seller.*"],
            roles: ["seller"],
          }),
        );
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginSeller(
      toSellerLoginRequest({ email: "mfa@example.com", password: "password1" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("mfa_pending");
    }
    expect(getSessionSnapshot().status).toBe("mfa_pending");
  });

  it("API invalid credentials map to field error without success", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        problemResponse(401, PROBLEM_CODES.AUTH_INVALID_CREDENTIALS),
      ),
    );
    const result = await loginSeller(
      toSellerLoginRequest({ email: "x@y.com", password: "password1" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("field_errors");
    }
  });

  it("API register posts exact DTO and returns generic success", async () => {
    installApiAuth();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("/v1/auth/register");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        email: "new@example.com",
        password: "password1",
        name: "New Seller",
        surface: "SELLER",
      });
      return jsonResponse(
        envelope({
          message:
            "If the email is eligible, a verification message has been sent",
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await registerSeller(
      toSellerRegisterRequest({
        email: "new@example.com",
        password: "password1",
        name: "New Seller",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("registered");
  });

  it("forgot password always generic when 200", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          envelope({
            message:
              "If an account exists for that email, a reset message has been sent",
          }),
        ),
      ),
    );
    const result = await forgotSellerPassword({ email: "anyone@example.com" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("generic_sent");
  });

  it("rate limit does not map to fake success", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => problemResponse(429, PROBLEM_CODES.RATE_LIMITED)),
    );
    const result = await loginSeller(
      toSellerLoginRequest({ email: "x@y.com", password: "password1" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("blocked");
  });
});
