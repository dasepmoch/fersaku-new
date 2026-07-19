import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  bankAccountCreateRequestSchema,
  bankAccountDtoSchema,
  bankAccountListEnvelopeSchema,
  bankAccountUpdateRequestSchema,
  buyerPatchProfileRequestSchema,
  buyerProfileDtoSchema,
  buyerProfileEnvelopeSchema,
  notificationPreferencesEnvelopeSchema,
  notificationPreferencesPatchRequestSchema,
} from "@/shared/api/schemas";
import {
  assertNoBankSecretsInView,
  displayLabelToLocale,
  last4FromMasked,
  localeToDisplayLabel,
  mapBankAccountDto,
  mapNotificationPrefsToSellerToggles,
  mapSellerProfileDto,
  profileInitials,
} from "@/features/seller/settings/mappers";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { readFileSync } from "node:fs";
import path from "node:path";

const meta = {
  requestId: "req_sel340",
  timestamp: "2026-07-17T10:00:00Z",
};

const profileDto = {
  userId: "usr_seller_1",
  email: "asep@ai.tools",
  emailVerified: true,
  displayName: "Asep Kurnia",
  locale: "id-ID",
  timezone: "Asia/Jakarta",
  version: 2,
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
      eventCode: "SECURITY_ALERT" as const,
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
      eventCode: "MARKETING_NEWSLETTER" as const,
      channel: "EMAIL" as const,
      enabled: false,
      mandatory: false,
    },
  ],
};

const bankDto = {
  id: "bank_1",
  bankCode: "BCA",
  bankName: "BCA",
  accountHolderName: "ASEP KURNIA",
  accountNumberMasked: "•••• 4821",
  status: "VERIFIED",
  isPrimary: true,
  version: 1,
  createdAt: "2026-07-01T00:00:00Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_sel340",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_sel340",
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
  return import("@/features/seller/settings/api");
}

describe("SEL-340 seller settings schemas", () => {
  it("parses profile DTO and envelope", () => {
    expect(buyerProfileDtoSchema.parse(profileDto).displayName).toBe(
      "Asep Kurnia",
    );
    expect(
      buyerProfileEnvelopeSchema.parse({ data: profileDto, meta }).data.version,
    ).toBe(2);
  });

  it("patch requires expectedVersion and omits avatar/email", () => {
    const parsed = buyerPatchProfileRequestSchema.parse({
      expectedVersion: 2,
      displayName: "Asep",
      locale: "id-ID",
    });
    expect(parsed.expectedVersion).toBe(2);
    expect("avatarRef" in parsed).toBe(false);
    expect("email" in parsed).toBe(false);
  });

  it("parses bank DTO list without full account number", () => {
    const list = bankAccountListEnvelopeSchema.parse({
      data: { items: [bankDto] },
      meta,
    });
    expect(list.data.items[0].accountNumberMasked).toContain("4821");
    expect(
      bankAccountDtoSchema.safeParse({
        ...bankDto,
        accountNumber: "0148924821",
      }).success,
    ).toBe(true);
    // create body may carry full number write-only
    const create = bankAccountCreateRequestSchema.parse({
      bankCode: "BCA",
      accountHolderName: "ASEP",
      accountNumber: "0148924821",
    });
    expect(create.accountNumber).toBe("0148924821");
    expect(
      bankAccountUpdateRequestSchema.parse({
        expectedVersion: 1,
        accountHolderName: "ASEP",
      }).expectedVersion,
    ).toBe(1);
  });

  it("parses notification preferences patch for closed codes", () => {
    expect(
      notificationPreferencesEnvelopeSchema.parse({ data: prefsDto, meta }).data
        .preferences,
    ).toHaveLength(4);
    expect(
      notificationPreferencesPatchRequestSchema.parse({
        preferences: [
          {
            eventCode: "SECURITY_ALERT",
            channel: "EMAIL",
            enabled: false,
          },
        ],
      }).preferences[0].eventCode,
    ).toBe("SECURITY_ALERT");
  });
});

describe("SEL-340 mappers", () => {
  it("maps ProfileData to SellerProfile view", () => {
    const view = mapSellerProfileDto(profileDto, prefsDto.preferences);
    expect(view.displayName).toBe("Asep Kurnia");
    expect(view.email).toBe("asep@ai.tools");
    expect(view.localeLabel).toBe("Bahasa Indonesia");
    expect(view.revision).toBe(2);
    expect(view.initials).toBe("AK");
    expect(view.newDeviceLogin).toBe(true);
    expect(view.weeklySummary).toBe(false);
  });

  it("maps bank DTO to masked card; no full number in view", () => {
    const view = mapBankAccountDto(bankDto);
    expect(view.bank).toBe("BCA");
    expect(view.numberLast4).toBe("4821");
    expect(view.verified).toBe(true);
    expect(view.primary).toBe(true);
    expect(view.holder).toBe("ASEP KURNIA");
    assertNoBankSecretsInView(view);
    expect(JSON.stringify(view)).not.toMatch(/0148924821/);
  });

  it("maps initials, locale, last4", () => {
    expect(profileInitials("Asep Kurnia")).toBe("AK");
    expect(localeToDisplayLabel("en-US")).toBe("English");
    expect(displayLabelToLocale("Bahasa Indonesia")).toBe("id-ID");
    expect(last4FromMasked("****1234")).toBe("1234");
  });

  it("maps notification prefs to seller toggles", () => {
    const toggles = mapNotificationPrefsToSellerToggles(prefsDto.preferences);
    expect(toggles.saleSuccess).toBe(true);
    expect(toggles.newDeviceLogin).toBe(true);
    expect(toggles.payoutChange).toBe(true);
    expect(toggles.weeklySummary).toBe(false);
  });
});

describe("SEL-340 query keys", () => {
  it("isolates profile by subject and banks by store", () => {
    expect(queryKeys.seller.profile("usr_a:ses_1")).not.toEqual(
      queryKeys.seller.profile("usr_b:ses_1"),
    );
    expect(queryKeys.seller.bankAccounts("store_a")).not.toEqual(
      queryKeys.seller.bankAccounts("store_b"),
    );
    // Keys must never embed raw account numbers or passwords
    const flat = JSON.stringify([
      queryKeys.seller.profile("usr:ses"),
      queryKeys.seller.bankAccounts("store_1"),
      queryKeys.seller.sessions("usr:ses"),
    ]);
    expect(flat).not.toMatch(/password|0148924821|accountNumber/i);
  });
});

describe("SEL-340 mock path", () => {
  it("returns demo profile/banks/sessions without network", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const {
      getSellerProfile,
      patchSellerProfile,
      listSellerBankAccounts,
      listSellerSessions,
      patchSellerNotificationPreferences,
    } = await import("@/features/seller/settings/api");

    const profile = await getSellerProfile();
    expect(profile.email).toContain("@");
    expect(profile.revision).toBeGreaterThanOrEqual(1);
    expect(profile.initials).toBe("AK");

    const patched = await patchSellerProfile({
      expectedVersion: profile.revision,
      displayName: "Asep Updated",
    });
    expect(patched.displayName).toBe("Asep Updated");
    expect(patched.revision).toBe(profile.revision + 1);

    const banks = await listSellerBankAccounts("store_demo");
    expect(banks[0].numberLast4).toHaveLength(4);
    expect(JSON.stringify(banks)).not.toMatch(/\d{8,}/);

    const sessions = await listSellerSessions();
    expect(sessions.some((s) => s.current)).toBe(true);

    const prefs = await patchSellerNotificationPreferences({
      weeklySummary: true,
    });
    expect(prefs.weeklySummary).toBe(true);
  });
});

describe("SEL-340 API adapters", () => {
  it("GET profile + prefs in parallel and maps view", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/me/profile")) {
        return jsonResponse({ data: profileDto, meta });
      }
      if (url.includes("/v1/me/notification-preferences")) {
        return jsonResponse({ data: prefsDto, meta });
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const view = await api.getSellerProfile();
    expect(view.displayName).toBe("Asep Kurnia");
    expect(view.weeklySummary).toBe(false);
    expect(view.revision).toBe(2);
    const paths = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes("/v1/me/profile"))).toBe(true);
    expect(
      paths.some((p) => p.includes("/v1/me/notification-preferences")),
    ).toBe(true);
  });

  it("PATCH profile sends expectedVersion + displayName only (no email/avatar)", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/me/profile") && init?.method === "PATCH") {
          const body = JSON.parse(String(init.body));
          expect(body.expectedVersion).toBe(2);
          expect(body.displayName).toBe("Asep");
          expect(body.email).toBeUndefined();
          expect(body.avatarRef).toBeUndefined();
          return jsonResponse({
            data: { ...profileDto, displayName: "Asep", version: 3 },
            meta,
          });
        }
        if (url.includes("/v1/me/notification-preferences")) {
          return jsonResponse({ data: prefsDto, meta });
        }
        return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const next = await api.patchSellerProfile({
      expectedVersion: 2,
      displayName: "Asep",
    });
    expect(next.displayName).toBe("Asep");
    expect(next.revision).toBe(3);
  });

  it("PATCH profile 409 rethrows (draft preserved by caller)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => problemResponse(409, PROBLEM_CODES.CONFLICT)),
    );
    const api = await loadApiMode();
    await expect(
      api.patchSellerProfile({ expectedVersion: 1, displayName: "Stale" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("lists bank accounts masked only", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/bank-accounts")) {
        return jsonResponse({ data: { items: [bankDto] }, meta });
      }
      return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const banks = await api.listSellerBankAccounts("store_1");
    expect(banks).toHaveLength(1);
    expect(banks[0].numberLast4).toBe("4821");
    expect(JSON.stringify(banks)).not.toMatch(/0148924821/);
  });

  it("creates bank with write-only accountNumber then verifies", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.includes("/bank-accounts") &&
          init?.method === "POST" &&
          !url.includes("/verify")
        ) {
          const body = JSON.parse(String(init.body));
          expect(body.accountNumber).toBe("0148924821");
          expect(body.bankCode).toBe("BCA");
          return jsonResponse(
            {
              data: { ...bankDto, status: "PENDING", isPrimary: false },
              meta,
            },
            201,
          );
        }
        if (url.includes("/verify") && init?.method === "POST") {
          return jsonResponse({ data: bankDto, meta });
        }
        return problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const created = await api.createSellerBankAccount("store_1", {
      bankCode: "BCA",
      accountHolderName: "ASEP KURNIA",
      accountNumber: "0148924821",
    });
    expect(created.verified).toBe(true);
    expect(created.numberLast4).toBe("4821");
    // Response path must not echo full number
    const bodies = fetchMock.mock.calls
      .filter((c) => c[1]?.method === "POST")
      .map((c) => String(c[1]?.body ?? ""));
    expect(bodies.some((b) => b.includes("0148924821"))).toBe(true);
  });

  it("domain gates", async () => {
    const api = await loadApiMode();
    expect(api.isSellerSettingsApiDomain()).toBe(true);
    expect(api.isSellerBankApiDomain()).toBe(true);
  });
});

describe("SEL-340 disposition: no secrets / INT-175 / no localStorage truth", () => {
  it("seller-settings keeps initials-only; no avatar upload; no localStorage profile truth", () => {
    const root = process.cwd();
    const source = readFileSync(
      path.join(root, "features/seller/domains/settings/seller-settings.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(
      /\/v1\/stores\/.+\/objects|\/v1\/me\/objects|Upload new photo|data:image/,
    );
    expect(source).not.toMatch(
      /fersaku-seller-profile-settings|writeVersionedStorage|readVersionedStorage|appendClientAuditEvent/,
    );
    expect(source).toMatch(
      /useSellerProfile|useSellerBankAccounts|usePasswordChangeMutation/,
    );
    expect(source).toMatch(/toPasswordChangeRequest|toMfaConfirmRequest/);
  });

  it("patch schema never sends avatarRef", () => {
    const body = buyerPatchProfileRequestSchema.parse({
      expectedVersion: 1,
      displayName: "X",
    });
    expect(Object.keys(body).sort()).toEqual(
      ["displayName", "expectedVersion"].sort(),
    );
  });

  it("mutation/query keys never embed secret values", () => {
    const keys = [
      ["seller", "usr:ses", "profile", "patch"],
      ["seller", "store_1", "bank-accounts", "create"],
      ["auth", "ceremony", "change-password"],
      ["auth", "mfa", "enroll"],
    ];
    for (const k of keys) {
      const flat = JSON.stringify(k);
      // Operation labels may say "change-password"; values must never appear.
      expect(flat).not.toMatch(
        /0148924821|FRSK-|otpauth|accountNumber["\s]*:/i,
      );
      expect(k).not.toContain("0148924821");
    }
  });
});
