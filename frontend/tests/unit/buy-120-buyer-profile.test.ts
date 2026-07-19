import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  buyerPatchProfileRequestSchema,
  buyerProfileDtoSchema,
  buyerProfileEnvelopeSchema,
  notificationPreferencesEnvelopeSchema,
  notificationPreferencesPatchRequestSchema,
} from "@/shared/api/schemas";
import {
  displayLabelToLocale,
  localeToDisplayLabel,
  mapBuyerProfileDto,
  mapNotificationPrefsToBuyerToggles,
  profileInitials,
} from "@/features/buyer/data/mappers";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { readFileSync } from "node:fs";
import path from "node:path";

const meta = {
  requestId: "req_buy120",
  timestamp: "2026-07-17T10:00:00Z",
};

const profileDto = {
  userId: "usr_buyer_1",
  email: "nadia@studio.id",
  emailVerified: true,
  displayName: "Nadia Putri",
  phone: "+62 812 3456 7890",
  locale: "id-ID",
  timezone: "Asia/Jakarta",
  version: 3,
};

const prefsDto = {
  preferences: [
    {
      eventCode: "PAYMENT_RECEIPT" as const,
      channel: "EMAIL" as const,
      enabled: true,
      mandatory: true,
    },
    {
      eventCode: "MARKETING_NEWSLETTER" as const,
      channel: "EMAIL" as const,
      enabled: false,
      mandatory: false,
    },
    {
      eventCode: "SECURITY_ALERT" as const,
      channel: "EMAIL" as const,
      enabled: true,
      mandatory: true,
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_buy120",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_buy120",
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
  return import("@/features/buyer/data/api");
}

describe("BUY-120 buyer profile schemas", () => {
  it("parses profile DTO and envelope", () => {
    expect(buyerProfileDtoSchema.parse(profileDto).displayName).toBe(
      "Nadia Putri",
    );
    expect(
      buyerProfileEnvelopeSchema.parse({ data: profileDto, meta }).data.version,
    ).toBe(3);
  });

  it("patch requires expectedVersion and omits avatar/email", () => {
    const parsed = buyerPatchProfileRequestSchema.parse({
      expectedVersion: 3,
      displayName: "Nadia",
      phone: "+62",
      locale: "id-ID",
    });
    expect(parsed.expectedVersion).toBe(3);
    expect(
      buyerPatchProfileRequestSchema.safeParse({ displayName: "x" }).success,
    ).toBe(false);
    expect("avatarRef" in parsed).toBe(false);
    expect("email" in parsed).toBe(false);
  });

  it("parses notification preferences and marketing patch", () => {
    expect(
      notificationPreferencesEnvelopeSchema.parse({ data: prefsDto, meta }).data
        .preferences,
    ).toHaveLength(3);
    expect(
      notificationPreferencesPatchRequestSchema.parse({
        preferences: [
          {
            eventCode: "MARKETING_NEWSLETTER",
            channel: "EMAIL",
            enabled: true,
          },
        ],
      }).preferences[0].enabled,
    ).toBe(true);
  });
});

describe("BUY-120 profile mappers", () => {
  it("maps ProfileData to BuyerProfile view", () => {
    const view = mapBuyerProfileDto(profileDto, prefsDto.preferences);
    expect(view.name).toBe("Nadia Putri");
    expect(view.email).toBe("nadia@studio.id");
    expect(view.phone).toBe("+62 812 3456 7890");
    expect(view.locale).toBe("id-ID");
    expect(view.localeLabel).toBe("Bahasa Indonesia");
    expect(view.revision).toBe(3);
    expect(view.initials).toBe("NP");
    expect(view.receiptEmail).toBe(true);
    expect(view.marketingEmail).toBe(false);
  });

  it("maps initials and locale labels", () => {
    expect(profileInitials("Nadia Putri")).toBe("NP");
    expect(profileInitials("Solo")).toBe("SO");
    expect(localeToDisplayLabel("en-US")).toBe("English");
    expect(displayLabelToLocale("Bahasa Indonesia")).toBe("id-ID");
  });

  it("maps notification prefs: receipt mandatory, marketing optional", () => {
    const toggles = mapNotificationPrefsToBuyerToggles([
      {
        eventCode: "PAYMENT_RECEIPT",
        channel: "EMAIL",
        enabled: false,
        mandatory: true,
      },
      {
        eventCode: "MARKETING_NEWSLETTER",
        channel: "EMAIL",
        enabled: true,
      },
    ]);
    expect(toggles.receiptEmail).toBe(true);
    expect(toggles.marketingEmail).toBe(true);
  });
});

describe("BUY-120 query keys", () => {
  it("isolates profile cache by subject", () => {
    expect(queryKeys.buyer.profile("usr_a:ses_1")).not.toEqual(
      queryKeys.buyer.profile("usr_b:ses_1"),
    );
  });
});

describe("BUY-120 mock path", () => {
  it("returns demo profile without network", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { getBuyerProfile, patchBuyerProfile, patchBuyerNotificationPreferences } =
      await import("@/features/buyer/data/api");
    const profile = await getBuyerProfile();
    expect(profile.email).toContain("@");
    expect(profile.revision).toBeGreaterThanOrEqual(1);
    expect(profile.initials).toBe("NP");

    const patched = await patchBuyerProfile({
      expectedVersion: profile.revision,
      displayName: "Nadia Updated",
    });
    expect(patched.name).toBe("Nadia Updated");
    expect(patched.revision).toBe(profile.revision + 1);

    const prefs = await patchBuyerNotificationPreferences({
      marketingEmail: true,
    });
    expect(prefs.marketingEmail).toBe(true);
    expect(prefs.receiptEmail).toBe(true);
  });
});

describe("BUY-120 API adapters", () => {
  it("GET profile + prefs in parallel and maps view", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/buyer/profile")) {
        return jsonResponse({ data: profileDto, meta });
      }
      if (url.includes("/v1/me/notification-preferences")) {
        return jsonResponse({ data: prefsDto, meta });
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const view = await api.getBuyerProfile();
    expect(view.name).toBe("Nadia Putri");
    expect(view.marketingEmail).toBe(false);
    expect(view.revision).toBe(3);
    const paths = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes("/v1/buyer/profile"))).toBe(true);
    expect(
      paths.some((p) => p.includes("/v1/me/notification-preferences")),
    ).toBe(true);
  });

  it("PATCH profile sends expectedVersion + displayName only (no email)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/buyer/profile") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        expect(body.expectedVersion).toBe(3);
        expect(body.displayName).toBe("Ada");
        expect(body.email).toBeUndefined();
        expect(body.avatarRef).toBeUndefined();
        return jsonResponse({
          data: { ...profileDto, displayName: "Ada", version: 4 },
          meta,
        });
      }
      if (url.includes("/v1/me/notification-preferences")) {
        return jsonResponse({ data: prefsDto, meta });
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const next = await api.patchBuyerProfile({
      expectedVersion: 3,
      displayName: "Ada",
    });
    expect(next.name).toBe("Ada");
    expect(next.revision).toBe(4);
  });

  it("PATCH profile 409 rethrows (draft preserved by caller)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => problemResponse(409, PROBLEM_CODES.CONFLICT)),
    );
    const api = await loadApiMode();
    await expect(
      api.patchBuyerProfile({ expectedVersion: 1, displayName: "Stale" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("PATCH marketing preference only", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/v1/me/notification-preferences") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        expect(body.preferences).toEqual([
          {
            eventCode: "MARKETING_NEWSLETTER",
            channel: "EMAIL",
            enabled: true,
          },
        ]);
        return jsonResponse({
          data: {
            preferences: [
              ...prefsDto.preferences.filter(
                (p) => p.eventCode !== "MARKETING_NEWSLETTER",
              ),
              {
                eventCode: "MARKETING_NEWSLETTER",
                channel: "EMAIL",
                enabled: true,
                mandatory: false,
              },
            ],
          },
          meta,
        });
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const toggles = await api.patchBuyerNotificationPreferences({
      marketingEmail: true,
    });
    expect(toggles.marketingEmail).toBe(true);
    expect(toggles.receiptEmail).toBe(true);
  });

  it("domain gate isBuyerProfileApiDomain", async () => {
    const api = await loadApiMode();
    expect(api.isBuyerProfileApiDomain()).toBe(true);
  });
});

describe("BUY-120 avatar / email-change disposition", () => {
  it("buyer profile keeps initials-only avatar; no upload; email CTA disabled", () => {
    const root = process.cwd();
    const source = readFileSync(
      path.join(root, "features/buyer/screens/buyer-profile.tsx"),
      "utf8",
    );
    expect(source).toMatch(/INT-175/);
    expect(source).toMatch(/initials/);
    expect(source).not.toMatch(/\/v1\/stores\/.+\/objects|\/v1\/me\/objects|Upload new photo|localStorage|data:image/);
    expect(source).toMatch(/Mulai perubahan email/);
    expect(source).toMatch(/disabled/);
    expect(source).toMatch(/AUT-120/);
  });

  it("patch schema and adapter never send avatarRef", () => {
    const body = buyerPatchProfileRequestSchema.parse({
      expectedVersion: 1,
      displayName: "X",
    });
    expect(Object.keys(body).sort()).toEqual(
      ["displayName", "expectedVersion"].sort(),
    );
  });
});
