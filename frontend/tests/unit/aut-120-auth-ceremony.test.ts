import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { __resetCsrfModuleForTests } from "@/shared/api/csrf";
import {
  __resetRecentMfaProofForTests,
  getRecentMfaProof,
  peekRecentMfaProofMeta,
} from "@/shared/api/recent-mfa-proof";
import {
  __resetSessionStoreForTests,
  bindSessionQueryClient,
} from "@/shared/auth/session-store";
import { ApiError } from "@/shared/api/api-error";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  assertAuthMutationKeySafe,
  AUTH_CEREMONY_MUTATION_KEYS,
  mapMfaVerifyData,
  mapMfaVerifyThrown,
  mapPasswordResetThrown,
  objectContainsMagicTokenLeak,
  objectContainsMfaSecretLeak,
  objectContainsPasswordLeak,
  parseAuthFragmentToken,
  toMfaVerifyRequest,
  toPasswordResetRequest,
} from "@/features/auth";
import {
  enrollMfa,
  resetPassword,
  stepUpMfa,
  verifyMfa,
} from "@/features/auth/api";
import { readFileSync } from "node:fs";
import path from "node:path";

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "req_aut120",
      timestamp: "2026-07-17T14:00:00Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_aut120",
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
        requestId: "req_aut120",
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

describe("AUT-120 password reset ceremony", () => {
  beforeEach(() => {
    clearDomainSourceSnapshot();
    __resetCsrfModuleForTests();
    __resetSessionStoreForTests();
    __resetRecentMfaProofForTests();
    bindSessionQueryClient(new QueryClient());
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
    vi.unstubAllGlobals();
  });

  it("builds exact reset DTO without leaking password into keys", () => {
    const dto = toPasswordResetRequest({
      token: " opaque_reset ",
      newPassword: "new-secret-99",
    });
    expect(dto).toEqual({
      token: "opaque_reset",
      newPassword: "new-secret-99",
    });
    assertAuthMutationKeySafe(AUTH_CEREMONY_MUTATION_KEYS.passwordReset);
    expect(
      objectContainsPasswordLeak({
        key: AUTH_CEREMONY_MUTATION_KEYS.passwordReset,
      }),
    ).toBe(false);
  });

  it("parses reset fragment token like AUT-110", () => {
    expect(parseAuthFragmentToken("#token=reset_abc")).toBe("reset_abc");
  });

  it("maps invalid reset token without enumeration", () => {
    const err = new ApiError(404, {
      code: PROBLEM_CODES.RESOURCE_NOT_FOUND,
      message: "x",
      requestId: "r",
    });
    const mapped = mapPasswordResetThrown(err);
    expect(mapped).toEqual({
      ok: false,
      kind: "invalid_token",
      code: PROBLEM_CODES.RESOURCE_NOT_FOUND,
    });
  });

  it("mock reset succeeds generically", async () => {
    installMockAuth();
    const result = await resetPassword({
      token: "tok",
      newPassword: "password12",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("reset");
      expect(objectContainsPasswordLeak(result)).toBe(false);
      expect(objectContainsMagicTokenLeak(result, "tok")).toBe(false);
    }
  });

  it("API reset posts exact body and never returns token", async () => {
    installApiAuth();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/auth/password/reset")) {
          const body = JSON.parse(String(init?.body));
          expect(body).toEqual({
            token: "reset_token_xyz",
            newPassword: "newpass99",
          });
          return jsonResponse(envelope({ message: "ok" }));
        }
        return problemResponse(500, "INTERNAL");
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resetPassword({
      token: "reset_token_xyz",
      newPassword: "newpass99",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(objectContainsMagicTokenLeak(result, "reset_token_xyz")).toBe(
        false,
      );
      expect(objectContainsPasswordLeak(result)).toBe(false);
    }
  });

  it("rate-limit on reset is blocked not success", async () => {
    installApiAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => problemResponse(429, PROBLEM_CODES.RATE_LIMITED)),
    );
    const result = await resetPassword({
      token: "t",
      newPassword: "password12",
    });
    expect(result).toEqual({
      ok: false,
      kind: "blocked",
      code: PROBLEM_CODES.RATE_LIMITED,
    });
  });
});

describe("AUT-120 MFA verify + recent proof", () => {
  beforeEach(() => {
    clearDomainSourceSnapshot();
    __resetCsrfModuleForTests();
    __resetSessionStoreForTests();
    __resetRecentMfaProofForTests();
    bindSessionQueryClient(new QueryClient());
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
    vi.unstubAllGlobals();
  });

  it("builds MFA verify DTO and secret-free keys", () => {
    expect(
      toMfaVerifyRequest({ code: " 123456 ", purpose: " inventory.reveal " }),
    ).toEqual({
      code: "123456",
      purpose: "inventory.reveal",
    });
    assertAuthMutationKeySafe(AUTH_CEREMONY_MUTATION_KEYS.mfaVerify);
  });

  it("maps invalid MFA code without inventing success", () => {
    const err = new ApiError(401, {
      code: PROBLEM_CODES.AUTH_MFA_PROOF_INVALID,
      message: "x",
      requestId: "r",
    });
    expect(mapMfaVerifyThrown(err)).toEqual({
      ok: false,
      kind: "invalid_code",
      code: PROBLEM_CODES.AUTH_MFA_PROOF_INVALID,
    });
  });

  it("maps verify data with seller redirect", () => {
    const mapped = mapMfaVerifyData(
      { mfaVerified: true },
      { returnTo: "/dashboard/products", surface: "seller" },
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.redirectTo).toBe("/dashboard/products");
      expect(mapped.recentMfaProof).toBeUndefined();
    }
  });

  it("mock verify refreshes session path", async () => {
    installMockAuth();
    const result = await verifyMfa(
      { code: "123456" },
      { surface: "seller", returnTo: "/dashboard" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("verified");
      expect(result.redirectTo).toBe("/dashboard");
    }
  });

  it("API verify stores recent proof in memory only", async () => {
    installApiAuth();
    const proof = "opaque-recent-proof-value";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/auth/mfa/verify")) {
        return jsonResponse(
          envelope({
            mfaVerified: true,
            recentMfaProof: proof,
            purpose: "inventory.reveal",
            expiresAt: "2099-01-01T00:00:00Z",
            factor: "totp",
          }),
        );
      }
      if (url.includes("/v1/auth/session")) {
        return jsonResponse(
          envelope({
            userId: "u1",
            sessionId: "s1",
            surface: "SELLER",
            mfaEnabled: true,
            mfaVerified: true,
            sessionStatus: "AUTHENTICATED",
            csrfToken: "csrf_after_mfa",
          }),
        );
      }
      return problemResponse(500, "INTERNAL");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyMfa(
      { code: "654321", purpose: "inventory.reveal" },
      { surface: "seller" },
    );
    expect(result.ok).toBe(true);
    expect(getRecentMfaProof("inventory.reveal")).toBe(proof);
    expect(peekRecentMfaProofMeta()?.purpose).toBe("inventory.reveal");
    if (result.ok) {
      // Result may include proof for caller wiring — must not appear in keys.
      expect(
        objectContainsMfaSecretLeak(
          AUTH_CEREMONY_MUTATION_KEYS.mfaVerify,
          proof,
        ),
      ).toBe(false);
    }
  });

  it("step-up mints purpose-bound proof (mock)", async () => {
    installMockAuth();
    const result = await stepUpMfa({
      code: "123456",
      purpose: "withdrawal.create",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.purpose).toBe("withdrawal.create");
      expect(getRecentMfaProof("withdrawal.create")).toBe(
        result.recentMfaProof,
      );
    }
  });

  it("enroll returns secret once (mock) and keys stay clean", async () => {
    installMockAuth();
    const result = await enrollMfa();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.secret.length).toBeGreaterThan(0);
      expect(result.otpauthUrl.startsWith("otpauth://")).toBe(true);
      expect(
        objectContainsMfaSecretLeak(
          AUTH_CEREMONY_MUTATION_KEYS.mfaEnroll,
          result.secret,
        ),
      ).toBe(false);
    }
  });
});

describe("AUT-120 UI disposition freeze", () => {
  it("buyer email-change button remains disabled until dual-confirm composition", () => {
    const src = readFileSync(
      path.join(process.cwd(), "features/buyer/screens/buyer-profile.tsx"),
      "utf8",
    );
    expect(src).toMatch(/Mulai perubahan email/);
    expect(src).toMatch(/disabled/);
    expect(src).toMatch(/AUT-120|out of scope/i);
  });

  it("seller settings does not hardcode fake QR seed when auth is api path present", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "features/seller/domains/settings/seller-settings.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/enrollMfa|useMfaEnrollMutation/);
    expect(src).toMatch(/authIsApi/);
    expect(src).toMatch(/otpauth/);
  });

  it("AuthForm wires MFA verify + password reset fragment", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/auth-form.tsx"),
      "utf8",
    );
    expect(src).toMatch(/useMfaVerifyMutation/);
    expect(src).toMatch(/usePasswordResetMutation/);
    expect(src).toMatch(/parseAuthFragmentToken|parseMagicLinkFragmentToken/);
    expect(src).toMatch(/scrubUrlFragment/);
  });
});
