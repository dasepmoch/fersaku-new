import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buyerPatchProfileRequestSchema,
  buyerProfileDtoSchema,
  buyerProfileEnvelopeSchema,
  buyerSessionListEnvelopeSchema,
  buyerSessionRevokeEnvelopeSchema,
  notificationPreferencesEnvelopeSchema,
  notificationPreferencesPatchRequestSchema,
} from "@/shared/api/schemas";
import {
  mapAdminProfileDto,
  mapAdminSessionDto,
  mapNotificationPrefsToAdminToggles,
  profileInitials,
} from "@/features/admin/profile/mappers";
import { clearDomainSourceSnapshot } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { readFileSync } from "node:fs";
import path from "node:path";

const meta = {
  requestId: "req_adm230",
  timestamp: "2026-07-17T10:00:00Z",
};

const profileDto = {
  userId: "usr_admin_1",
  email: "dinda@fersaku.id",
  emailVerified: true,
  displayName: "Dinda Kusuma",
  locale: "id-ID",
  timezone: "Asia/Jakarta",
  version: 2,
  mfaEnabled: true,
};

const prefsDto = {
  preferences: [
    {
      eventCode: "KYC_UPDATE" as const,
      channel: "EMAIL" as const,
      enabled: true,
      mandatory: false,
    },
    {
      eventCode: "WITHDRAWAL_UPDATE" as const,
      channel: "EMAIL" as const,
      enabled: true,
      mandatory: false,
    },
    {
      eventCode: "SECURITY_ALERT" as const,
      channel: "EMAIL" as const,
      enabled: true,
      mandatory: false,
    },
    {
      eventCode: "MARKETING_NEWSLETTER" as const,
      channel: "EMAIL" as const,
      enabled: false,
      mandatory: false,
    },
  ],
};

const sessionDto = {
  id: "ses_admin_1",
  surface: "ADMIN",
  createdAt: "2026-07-17T08:00:00Z",
  lastSeenAt: new Date().toISOString(),
  current: true,
  mfaVerified: true,
  deviceLabel: "Chrome on Linux",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_adm230",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_adm230",
      },
    },
    status,
  );
}

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadApiMode() {
  vi.resetModules();
  const domain = await import("@/shared/data/domain-source");
  vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
  vi.spyOn(domain, "getDomainSource").mockReturnValue("api");
  return import("@/features/admin/profile/api");
}

async function loadNotificationApi(domainReturn: "api" | "mock" = "api") {
  vi.resetModules();
  const domain = await import("@/shared/data/domain-source");
  vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(
    domainReturn === "mock",
  );
  vi.spyOn(domain, "getDomainSource").mockReturnValue(domainReturn);
  return import("@/shared/notifications/api");
}

describe("ADM-230 admin profile schemas", () => {
  it("parses profile DTO and envelope", () => {
    expect(buyerProfileDtoSchema.parse(profileDto).displayName).toBe(
      "Dinda Kusuma",
    );
    expect(
      buyerProfileEnvelopeSchema.parse({ data: profileDto, meta }).data.version,
    ).toBe(2);
  });

  it("patch requires expectedVersion and omits avatar/email/jobTitle", () => {
    const parsed = buyerPatchProfileRequestSchema.parse({
      expectedVersion: 2,
      displayName: "Dinda",
      timezone: "Asia/Jakarta",
    });
    expect(parsed.expectedVersion).toBe(2);
    expect("avatarRef" in parsed).toBe(false);
    expect("email" in parsed).toBe(false);
    expect("jobTitle" in parsed).toBe(false);
  });

  it("parses prefs and sessions envelopes", () => {
    expect(
      notificationPreferencesEnvelopeSchema.parse({ data: prefsDto, meta })
        .data.preferences,
    ).toHaveLength(4);
    expect(
      buyerSessionListEnvelopeSchema.parse({
        data: { sessions: [sessionDto] },
        meta,
      }).data.sessions[0].id,
    ).toBe("ses_admin_1");
  });
});

describe("ADM-230 admin profile mappers", () => {
  it("maps profile + closed prefs to admin toggles", () => {
    const view = mapAdminProfileDto(profileDto, prefsDto.preferences);
    expect(view.fullName).toBe("Dinda Kusuma");
    expect(view.email).toBe("dinda@fersaku.id");
    expect(view.revision).toBe(2);
    expect(view.initials).toBe("DK");
    expect(view.kyc).toBe(true);
    expect(view.withdrawals).toBe(true);
    expect(view.incidents).toBe(true);
    expect(view.digest).toBe(false);
    expect(view.jobTitle).toBe("");
  });

  it("maps notification prefs closed codes only", () => {
    const toggles = mapNotificationPrefsToAdminToggles(prefsDto.preferences);
    expect(toggles).toEqual({
      kyc: true,
      withdrawals: true,
      incidents: true,
      digest: false,
    });
  });

  it("maps session device label and current flag", () => {
    const row = mapAdminSessionDto(sessionDto);
    expect(row.id).toBe("ses_admin_1");
    expect(row.device).toBe("Chrome on Linux");
    expect(row.current).toBe(true);
    expect(row.active).toBe("Now");
  });

  it("profileInitials from display name", () => {
    expect(profileInitials("Dinda Kusuma")).toBe("DK");
    expect(profileInitials("A")).toBe("A");
  });
});

describe("ADM-230 query keys subject isolation", () => {
  it("binds profile/sessions/prefs to subjectKey under admin private root", () => {
    const a = "usr_a:ses_a";
    const b = "usr_b:ses_b";
    expect(queryKeys.admin.profile(a)).toEqual(["admin", a, "profile"]);
    expect(queryKeys.admin.sessions(b)).toEqual(["admin", b, "sessions"]);
    expect(queryKeys.admin.notificationPreferences(a)).toEqual([
      "admin",
      a,
      "notification-preferences",
    ]);
    expect(queryKeys.admin.profile(a)).not.toEqual(queryKeys.admin.profile(b));
  });
});

describe("ADM-230 admin profile API transport", () => {
  it("GET profile + prefs on /v1/me/* when auth is api", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/me/profile")) {
        return jsonResponse({ data: profileDto, meta });
      }
      if (url.includes("/v1/me/notification-preferences")) {
        return jsonResponse({ data: prefsDto, meta });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const profile = await api.getAdminProfile();
    expect(profile.fullName).toBe("Dinda Kusuma");
    expect(profile.revision).toBe(2);
    expect(profile.digest).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("PATCH profile sends expectedVersion without email/avatar", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/me/profile") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        expect(body.expectedVersion).toBe(2);
        expect(body.displayName).toBe("Dinda K");
        expect(body.email).toBeUndefined();
        expect(body.avatarRef).toBeUndefined();
        return jsonResponse({
          data: { ...profileDto, displayName: "Dinda K", version: 3 },
          meta,
        });
      }
      if (url.includes("/v1/me/notification-preferences")) {
        return jsonResponse({ data: prefsDto, meta });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const updated = await api.patchAdminProfile({
      expectedVersion: 2,
      displayName: "Dinda K",
      timezone: "Asia/Jakarta",
    });
    expect(updated.revision).toBe(3);
    expect(updated.fullName).toBe("Dinda K");
  });

  it("PATCH prefs maps closed admin event codes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        url.includes("/v1/me/notification-preferences") &&
        init?.method === "PATCH"
      ) {
        const body = JSON.parse(String(init.body));
        const parsed = notificationPreferencesPatchRequestSchema.parse(body);
        expect(parsed.preferences.map((p) => p.eventCode).sort()).toEqual(
          ["KYC_UPDATE", "MARKETING_NEWSLETTER"].sort(),
        );
        return jsonResponse({
          data: {
            preferences: [
              {
                eventCode: "KYC_UPDATE",
                channel: "EMAIL",
                enabled: false,
              },
              {
                eventCode: "MARKETING_NEWSLETTER",
                channel: "EMAIL",
                enabled: true,
              },
            ],
          },
          meta,
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const toggles = await api.patchAdminNotificationPreferences({
      kyc: false,
      digest: true,
    });
    expect(toggles.kyc).toBe(false);
    expect(toggles.digest).toBe(true);
  });

  it("lists sessions from /v1/auth/sessions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/auth/sessions") && !url.includes("revoke")) {
        return jsonResponse({
          data: {
            sessions: [
              sessionDto,
              {
                ...sessionDto,
                id: "ses_other",
                current: false,
                deviceLabel: "Safari on iPhone",
                lastSeenAt: "2026-07-17T08:00:00Z",
              },
            ],
          },
          meta,
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const sessions = await api.listAdminSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].current).toBe(true);
    expect(sessions[1].device).toBe("Safari on iPhone");
  });

  it("revokes single session and detects current", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/auth/sessions/") && url.includes("/revoke")) {
        return jsonResponse({
          data: { revoked: true },
          meta,
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const result = await api.revokeAdminSession({
      sessionId: "ses_admin_1",
      currentSessionId: "ses_admin_1",
    });
    expect(result.accepted).toBe(true);
    expect(result.revokedCurrent).toBe(true);
  });

  it("revokes others and all via auth aliases", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/auth/sessions/revoke-others")) {
        return jsonResponse({ data: { revokedCount: 2 }, meta });
      }
      if (url.endsWith("/v1/auth/sessions/revoke-all")) {
        return jsonResponse({ data: { revokedCount: 3 }, meta });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    expect((await api.revokeOtherAdminSessions()).revokedCount).toBe(2);
    expect((await api.revokeAllAdminSessions()).clearedCookie).toBe(true);
  });

  it("rejects patch without expectedVersion", async () => {
    const api = await loadApiMode();
    await expect(
      api.patchAdminProfile({ expectedVersion: 0, displayName: "X" }),
    ).rejects.toThrow(/expectedVersion/);
  });

  it("rethrows 409 on profile conflict", async () => {
    const fetchMock = vi.fn(async () =>
      problemResponse(409, "CONFLICT_VERSION"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    await expect(
      api.patchAdminProfile({ expectedVersion: 2, displayName: "X" }),
    ).rejects.toBeTruthy();
  });
});

describe("ADM-230 shell + screen disposition", () => {
  it("admin shell reuses shared NotificationCenter + ProfileMenu surface=admin", () => {
    const root = process.cwd();
    const source = readFileSync(
      path.join(root, "features/admin/components/admin-shell.tsx"),
      "utf8",
    );
    expect(source).toMatch(/from ["']@\/shared\/ui\/account-controls["']/);
    expect(source).toMatch(/NotificationCenter\s+surface=["']admin["']/);
    expect(source).toMatch(/ProfileMenu\s+surface=["']admin["']/);
    expect(source).not.toMatch(
      /features\/admin\/notifications|adminNotificationsAdapter/,
    );
  });

  it("profile screen wires adapters; photo DISABLED; no localStorage on API path", () => {
    const root = process.cwd();
    const source = readFileSync(
      path.join(root, "features/admin/screens/access/profile.tsx"),
      "utf8",
    );
    expect(source).toMatch(/useAdminProfile|isAdminProfileApiDomain/);
    expect(source).toMatch(/useAdminSessions|useRevokeAdminSessionMutation/);
    expect(source).toMatch(/useMfaRegenerateRecoveryMutation/);
    expect(source).toMatch(/INT-175/);
    expect(source).toMatch(/disabled/);
    expect(source).not.toMatch(/readVersionedStorage|writeVersionedStorage/);
    expect(source).not.toMatch(/fersaku-admin-profile-settings/);
    expect(source).not.toMatch(/features\/admin\/notifications/);
  });

  it("does not invent a second notification adapter module", () => {
    const root = process.cwd();
    let hasAdminNotifModule = false;
    try {
      readFileSync(
        path.join(root, "features/admin/notifications/api.ts"),
        "utf8",
      );
      hasAdminNotifModule = true;
    } catch {
      hasAdminNotifModule = false;
    }
    expect(hasAdminNotifModule).toBe(false);
  });
});

describe("ADM-230 admin notification alias isolation (shared BUY-140)", () => {
  it("admin list uses /v1/admin/notifications and drops non-admin rows", async () => {
    const adminDto = {
      id: "ntf_admin_1",
      eventCode: "SECURITY_ALERT" as const,
      title: "Provider incident",
      body: "QRIS degraded",
      ctaPath: "/admin/system",
      contentVersion: "1",
      priority: "CRITICAL" as const,
      surface: "ADMIN" as const,
      createdAt: "2026-07-17T09:58:00Z",
      unread: true,
    };
    const buyerDto = {
      id: "ntf_buyer_1",
      eventCode: "PAYMENT_RECEIPT" as const,
      title: "Buyer receipt",
      body: "x",
      ctaPath: "/account/purchases/1",
      contentVersion: "1",
      priority: "INFO" as const,
      surface: "BUYER" as const,
      createdAt: "2026-07-17T09:00:00Z",
      unread: true,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/admin/notifications") && !url.includes("unread")) {
        return jsonResponse({
          data: [adminDto, buyerDto],
          meta: { ...meta, hasMore: false },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadNotificationApi("api");
    const items = await api.listNotifications("admin");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("ntf_admin_1");
  });
});

describe("ADM-230 revoke envelope schema", () => {
  it("parses revoke response", () => {
    expect(
      buyerSessionRevokeEnvelopeSchema.parse({
        data: { revoked: true, revokedCount: 1 },
        meta,
      }).data.revoked,
    ).toBe(true);
  });
});
