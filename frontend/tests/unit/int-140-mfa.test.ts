import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRecentMfaProofForTests,
  assertRecentMfaProofNotInWebStorage,
  clearRecentMfaProof,
  getRecentMfaProof,
  setRecentMfaProof,
  wireHttpClientRecentMfaHooks,
} from "@/shared/api/recent-mfa-proof";
import {
  clearHttpClientSessionHooks,
  getHttpClientSessionHooks,
  HTTP_HEADERS,
  setHttpClientSessionHooks,
  apiRequest,
} from "@/shared/api/http-client";
import { __resetCsrfModuleForTests } from "@/shared/api/csrf";
import { decideRouteGuard } from "@/shared/auth/guards";
import {
  createMockClaims,
  isMfaPendingClaims,
  statusFromClaims,
  type SessionSnapshot,
} from "@/shared/auth/session-model";
import { z } from "zod";

describe("INT-140 MFA pending guards", () => {
  it("statusFromClaims marks mfa_pending when enabled and not verified", () => {
    const claims = createMockClaims("admin");
    const pending = { ...claims, mfaEnabled: true, mfaVerified: false };
    expect(isMfaPendingClaims(pending)).toBe(true);
    expect(statusFromClaims(pending)).toBe("mfa_pending");
    expect(statusFromClaims(claims)).toBe("authenticated");
  });

  it("requireMfaVerified redirects MFA_PENDING away from admin console", () => {
    const claims = {
      ...createMockClaims("admin"),
      mfaEnabled: true,
      mfaVerified: false,
    };
    const snapshot: SessionSnapshot = {
      status: "mfa_pending",
      claims,
      errorCode: null,
    };
    const d = decideRouteGuard({
      pathname: "/admin",
      snapshot,
      requiredSurface: "admin",
      requireMfaVerified: true,
    });
    expect(d.action).toBe("redirect");
    if (d.action === "redirect") {
      expect(d.reason).toBe("mfa_pending");
      expect(d.href).toContain("/admin/login");
    }
  });

  it("MFA_PENDING may stay on auth entry", () => {
    const claims = {
      ...createMockClaims("admin"),
      mfaEnabled: true,
      mfaVerified: false,
    };
    const snapshot: SessionSnapshot = {
      status: "mfa_pending",
      claims,
      errorCode: null,
    };
    const d = decideRouteGuard({
      pathname: "/admin/login",
      snapshot,
    });
    expect(d.action).toBe("allow");
  });

  it("fully verified admin is allowed into console", () => {
    const claims = createMockClaims("admin");
    const snapshot: SessionSnapshot = {
      status: "authenticated",
      claims,
      errorCode: null,
    };
    const d = decideRouteGuard({
      pathname: "/admin",
      snapshot,
      requiredSurface: "admin",
      requireMfaVerified: true,
    });
    expect(d.action).toBe("allow");
  });
});

describe("INT-140 recent MFA proof memory store", () => {
  beforeEach(() => {
    __resetRecentMfaProofForTests();
    clearHttpClientSessionHooks();
  });
  afterEach(() => {
    __resetRecentMfaProofForTests();
    clearHttpClientSessionHooks();
  });

  it("stores proof in memory only and clears", () => {
    setRecentMfaProof("proof_abc", {
      purpose: "inventory.reveal",
      expiresAt: Date.now() + 60_000,
    });
    expect(getRecentMfaProof()).toBe("proof_abc");
    expect(getRecentMfaProof("inventory.reveal")).toBe("proof_abc");
    expect(getRecentMfaProof("bank.change")).toBeUndefined();
    clearRecentMfaProof();
    expect(getRecentMfaProof()).toBeUndefined();
  });

  it("expires proof by TTL", () => {
    setRecentMfaProof("stale", {
      purpose: "inventory.reveal",
      expiresAt: Date.now() - 1,
    });
    expect(getRecentMfaProof()).toBeUndefined();
  });

  it("does not use web storage keys", () => {
    setRecentMfaProof("x");
    assertRecentMfaProofNotInWebStorage();
  });

  it("attaches X-Recent-MFA-Proof via requireRecentMfa hook", async () => {
    setRecentMfaProof("hook-proof-token");
    wireHttpClientRecentMfaHooks();
    expect(getHttpClientSessionHooks().getRecentMfaProof?.()).toBe(
      "hook-proof-token",
    );

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: { ok: true },
          meta: {
            requestId: "req_t",
            timestamp: "2026-07-17T10:00:00Z",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/v1/stores/s1/inventory/items/i1/reveal", {
      method: "POST",
      body: { reason: "test" },
      requireRecentMfa: true,
      schema: z.object({
        data: z.object({ ok: z.boolean() }),
        meta: z.object({
          requestId: z.string(),
          timestamp: z.string(),
        }),
      }),
    });

    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit?];
    const init = call[1] ?? {};
    const headers = new Headers(init.headers);
    expect(headers.get(HTTP_HEADERS.RECENT_MFA_PROOF)).toBe("hook-proof-token");
    vi.unstubAllGlobals();
  });
});
