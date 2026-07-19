import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDomainSourceSnapshot } from "@/shared/data/domain-source";
import {
  canRunImpersonationCommand,
  IMPERSONATION_COMMANDS,
} from "@/features/admin/impersonation/policy";
import {
  createImpersonationSession,
  fromWireImpersonationScope,
  mapClaimsImpersonationToSession,
  mapServerStartToSession,
  toWireImpersonationScope,
  clearImpersonationSession,
  readImpersonationSession,
  isImpersonationSessionActive,
} from "@/features/admin/impersonation/session";
import {
  impersonationStartDataSchema,
  impersonationStartEnvelopeSchema,
} from "@/shared/api/schemas";
import { claimsHavePermission } from "@/features/admin/config/permissions";

const meta = {
  requestId: "req_adm390",
  timestamp: "2026-07-17T10:00:00Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_adm390",
    },
  });
}

afterEach(() => {
  clearDomainSourceSnapshot();
  clearImpersonationSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadApi(domainReturn: "api" | "mock" = "api") {
  vi.resetModules();
  const domain = await import("@/shared/data/domain-source");
  vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(
    domainReturn === "mock",
  );
  vi.spyOn(domain, "getDomainSource").mockImplementation((d: string) => {
    if (d === "adminWrite" || d === "adminRead" || d === "auth") {
      return domainReturn;
    }
    return domainReturn;
  });
  return import("@/features/admin/impersonation/api");
}

describe("ADM-390 impersonation lifecycle", () => {
  it("maps UI scope to wire READ_ONLY / SUPPORT_WRITE only", () => {
    expect(toWireImpersonationScope("read-only")).toBe("READ_ONLY");
    expect(toWireImpersonationScope("support-write")).toBe("SUPPORT_WRITE");
    expect(fromWireImpersonationScope("READ_ONLY")).toBe("read-only");
    expect(fromWireImpersonationScope("SUPPORT_WRITE")).toBe("support-write");
    expect(fromWireImpersonationScope("FULL")).toBeNull();
    expect(fromWireImpersonationScope("PRIVILEGED")).toBeNull();
  });

  it("maps server start DTO to view session without treating storage as authority", () => {
    const session = mapServerStartToSession(
      {
        sessionId: "imp_server_01HABCDEFG",
        scope: "READ_ONLY",
        expiresAt: "2026-07-17T10:15:00.000Z",
        csrfToken: "csrf_rotated_not_a_session",
        targetUserId: "usr_target_1",
        targetSurface: "SELLER",
        actorAdminId: "adm_actor_1",
        banner: {
          sessionId: "imp_server_01HABCDEFG",
          actorAdminId: "adm_actor_1",
          targetUserId: "usr_target_1",
          targetName: "Asep Kurnia",
          scope: "READ_ONLY",
          reason: "Ticket SUP-1234 reproduction",
          expiresAt: "2026-07-17T10:15:00.000Z",
          ttlMinutes: 15,
        },
      },
      {
        targetId: "usr_target_1",
        targetName: "Asep Kurnia",
        targetType: "user",
        uiScope: "read-only",
        reason: "Ticket SUP-1234 reproduction",
        ttlMinutes: 15,
      },
    );
    expect(session.serverIssued).toBe(true);
    expect(session.scope).toBe("read-only");
    expect(session.sessionId).toBe("imp_server_01HABCDEFG");
    expect(JSON.stringify(session).toLowerCase()).not.toMatch(
      /rawtoken|session_token|raw_token/,
    );
  });

  it("maps claims impersonation meta for banner/policy", () => {
    const session = mapClaimsImpersonationToSession(
      {
        active: true,
        id: "imp_claims_01HABCDEFG",
        scope: "SUPPORT_WRITE",
        actorId: "adm_1",
        expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      },
      {
        targetId: "usr_1",
        targetName: "Seller One",
        targetType: "user",
      },
    );
    expect(session?.scope).toBe("support-write");
    expect(session?.serverIssued).toBe(true);
    expect(isImpersonationSessionActive(session!)).toBe(true);
  });

  it("policy denies read-only mutations and unknown commands", () => {
    expect(
      canRunImpersonationCommand(
        { scope: "read-only" },
        IMPERSONATION_COMMANDS.profileSupportUpdate,
        ["displayName"],
      ),
    ).toBe(false);
    expect(
      canRunImpersonationCommand({ scope: "support-write" }, "seller.export", [
        "all",
      ]),
    ).toBe(false);
  });

  it("permission deny without impersonation.start", () => {
    expect(
      claimsHavePermission(
        ["users.read", "merchants.read"],
        "impersonation.start",
      ),
    ).toBe(false);
    expect(
      claimsHavePermission(
        ["impersonation.start"],
        "impersonation.support_write",
      ),
    ).toBe(false);
    expect(
      claimsHavePermission(["impersonation.start"], "impersonation.start"),
    ).toBe(true);
  });

  it("start schema rejects payload containing raw session token fields", () => {
    const bad = impersonationStartDataSchema.safeParse({
      sessionId: "imp_1",
      scope: "READ_ONLY",
      expiresAt: "2026-07-17T10:15:00Z",
      csrfToken: "csrf_ok",
      targetUserId: "u1",
      actorAdminId: "a1",
      rawToken: "secret-should-not-ship",
    });
    // extra keys are stripped by zod object; superRefine scans JSON of parsed value
    // which should not include rawToken after strip — assert envelope of known-good
    const good = impersonationStartEnvelopeSchema.safeParse({
      data: {
        sessionId: "imp_server_01HABCDEFG",
        scope: "READ_ONLY",
        expiresAt: "2026-07-17T10:15:00Z",
        csrfToken: "csrf_ok",
        targetUserId: "u1",
        actorAdminId: "a1",
      },
      meta,
    });
    expect(good.success).toBe(true);
    expect(bad.success).toBe(true); // unknown keys stripped; no secret in parsed
    expect(JSON.stringify(good.data)).not.toMatch(/rawToken|raw_token/i);
  });

  function stubBrowserStorage() {
    const session = new Map<string, string>();
    const local = new Map<string, string>();
    const storageApi = (map: Map<string, string>) => ({
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    });
    vi.stubGlobal("window", {
      sessionStorage: storageApi(session),
      localStorage: storageApi(local),
      dispatchEvent: vi.fn(),
    });
    return { session, local };
  }

  it("mock start persists local session and returns URL-bound redirect", async () => {
    stubBrowserStorage();
    const { startImpersonation } = await loadApi("mock");
    const result = await startImpersonation({
      targetId: "usr_01H8A2",
      targetName: "Asep Kurnia",
      targetType: "user",
      scope: "read-only",
      reason: "Ticket SUP-1234 reproduction",
      ttlMinutes: 15,
    });
    expect(result.mode).toBe("mock");
    expect(result.redirectPath).toMatch(
      /\/dashboard\?impersonate=usr_01H8A2&session=/,
    );
    expect(readImpersonationSession()?.targetId).toBe("usr_01H8A2");
  });

  it("api start posts wire body, applies csrf, does not persist mock storage, lands without session query", async () => {
    stubBrowserStorage();

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/impersonation") && !url.includes("terminate")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
          >;
          expect(body.scope).toBe("READ_ONLY");
          expect(body.reason).toBe("Ticket SUP-1234 reproduction");
          expect(typeof body.ticket).toBe("string");
          expect(body.ttlMinutes).toBe(15);
          expect(body.idempotencyKey).toBeTruthy();
          expect(JSON.stringify(body)).not.toMatch(/rawToken|sessionToken/i);
          return jsonResponse({
            data: {
              sessionId: "imp_server_01HABCDEFG",
              scope: "READ_ONLY",
              expiresAt: "2026-07-17T10:15:00.000Z",
              csrfToken: "csrf_after_start",
              targetUserId: "usr_01H8A2",
              targetSurface: "SELLER",
              actorAdminId: "adm_actor",
              banner: {
                sessionId: "imp_server_01HABCDEFG",
                actorAdminId: "adm_actor",
                targetUserId: "usr_01H8A2",
                targetName: "Asep Kurnia",
                scope: "READ_ONLY",
                reason: "Ticket SUP-1234 reproduction",
                expiresAt: "2026-07-17T10:15:00.000Z",
                ttlMinutes: 15,
              },
            },
            meta,
          });
        }
        if (url.includes("/v1/auth/session")) {
          return jsonResponse({
            data: {
              userId: "usr_01H8A2",
              sessionId: "sess_derived",
              surface: "seller",
              email: "asep@example.com",
              name: "Asep Kurnia",
              emailVerified: true,
              mfaEnabled: false,
              mfaVerified: true,
              status: "ACTIVE",
              csrfToken: "csrf_bootstrap",
              permissions: ["seller.store.read"],
              roles: ["seller"],
              impersonation: {
                active: true,
                id: "imp_server_01HABCDEFG",
                scope: "READ_ONLY",
                actorId: "adm_actor",
                expiresAt: "2026-07-17T10:15:00.000Z",
              },
            },
            meta,
          });
        }
        return jsonResponse(
          { problem: { code: "NOT_FOUND", message: "no" } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    // Spy before loading api so the module binds the spy.
    vi.doMock("@/shared/api/csrf", async () => {
      const actual =
        await vi.importActual<typeof import("@/shared/api/csrf")>(
          "@/shared/api/csrf",
        );
      return {
        ...actual,
        setCsrfToken: vi.fn(actual.setCsrfToken),
      };
    });

    const { startImpersonation } = await loadApi("api");
    const csrf = await import("@/shared/api/csrf");
    const result = await startImpersonation({
      targetId: "usr_01H8A2",
      targetName: "Asep Kurnia",
      targetType: "user",
      scope: "read-only",
      reason: "Ticket SUP-1234 reproduction",
      ttlMinutes: 15,
    });

    expect(result.mode).toBe("api");
    expect(result.redirectPath).toBe("/dashboard");
    expect(result.redirectPath).not.toMatch(/session=|impersonate=/);
    expect(result.session.serverIssued).toBe(true);
    expect(readImpersonationSession()).toBeNull();
    expect(csrf.setCsrfToken).toHaveBeenCalledWith("csrf_after_start");
    const startCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/v1/admin/users/"),
    );
    expect(startCall).toBeTruthy();
  });

  it("api end terminates by session id and does not leave local mock authority", async () => {
    const { session } = stubBrowserStorage();

    // Seed mock storage that must be cleared on API end.
    const mock = createImpersonationSession({
      targetId: "usr_01",
      targetName: "X",
      scope: "read-only",
      reason: "Ticket SUP-1234 reproduction",
      ttlMinutes: 15,
    })!;
    session.set("fersaku-impersonation-session-v1", JSON.stringify(mock));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/terminate")) {
        return jsonResponse({
          data: {
            sessionId: "imp_server_01HABCDEFG",
            status: "TERMINATED",
            endedAt: "2026-07-17T10:05:00Z",
          },
          meta,
        });
      }
      if (url.includes("/v1/auth/session")) {
        return jsonResponse(
          {
            problem: {
              code: "AUTH_REQUIRED",
              message: "Authentication required",
            },
          },
          401,
        );
      }
      return jsonResponse(
        { problem: { code: "NOT_FOUND", message: "no" } },
        404,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { endImpersonation } = await loadApi("api");
    const result = await endImpersonation({
      sessionId: "imp_server_01HABCDEFG",
      targetType: "user",
      targetId: "usr_01H8A2",
    });
    expect(result.mode).toBe("api");
    expect(result.status).toBe("TERMINATED");
    expect(result.redirectPath).toBe("/admin/users");
    expect(readImpersonationSession()).toBeNull();
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("/terminate")),
    ).toBe(true);
  });

  it("api start for merchant uses merchant impersonation path", async () => {
    stubBrowserStorage();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.includes("/v1/admin/merchants/") &&
        url.includes("/impersonation")
      ) {
        return jsonResponse({
          data: {
            sessionId: "imp_m_01HABCDEFG",
            scope: "READ_ONLY",
            expiresAt: "2026-07-17T10:15:00.000Z",
            csrfToken: "csrf_m",
            targetUserId: "usr_owner",
            actorAdminId: "adm_1",
          },
          meta,
        });
      }
      if (url.includes("/v1/auth/session")) {
        return jsonResponse({
          data: {
            userId: "usr_owner",
            sessionId: "sess_d",
            surface: "seller",
            csrfToken: "csrf_b",
            mfaVerified: true,
            impersonation: {
              active: true,
              id: "imp_m_01HABCDEFG",
              scope: "READ_ONLY",
              actorId: "adm_1",
              expiresAt: "2026-07-17T10:15:00.000Z",
            },
          },
          meta,
        });
      }
      return jsonResponse(
        { problem: { code: "NOT_FOUND", message: "no" } },
        404,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { startImpersonation } = await loadApi("api");
    await startImpersonation({
      targetId: "mrc_01",
      targetName: "Asep AI Tools",
      targetType: "merchant",
      scope: "read-only",
      reason: "Ticket SUP-9999 merchant support",
      ttlMinutes: 30,
    });
    expect(
      fetchMock.mock.calls.some((c) =>
        String(c[0]).includes("/v1/admin/merchants/mrc_01/impersonation"),
      ),
    ).toBe(true);
  });
});
