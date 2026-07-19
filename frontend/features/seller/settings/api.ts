/**
 * SEL-340 — seller profile / prefs / sessions / bank transport adapters.
 * Profile/prefs: /v1/me/* (actor-scoped). Banks: store-scoped sellerFinance.
 * Avatar upload: INT-175 DISABLED — never call personal media endpoints.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  bankAccountCreateRequestSchema,
  bankAccountEnvelopeSchema,
  bankAccountListEnvelopeSchema,
  bankAccountUpdateRequestSchema,
  buyerProfileEnvelopeSchema,
  buyerPatchProfileRequestSchema,
  buyerSessionListEnvelopeSchema,
  buyerSessionRevokeEnvelopeSchema,
  notificationPreferencesEnvelopeSchema,
  notificationPreferencesPatchRequestSchema,
  type BankAccountCreateRequest,
  type BankAccountUpdateRequest,
  type BuyerPatchProfileRequest,
  type NotificationPreferencesPatchRequest,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  CreateSellerBankAccountInput,
  PatchSellerNotificationPreferencesInput,
  PatchSellerProfileInput,
  SellerBankAccount,
  SellerProfile,
  SellerSession,
  UpdateSellerBankAccountInput,
} from "./contracts";
import {
  displayTimezoneToWire,
  mapBankAccountDto,
  mapBankAccountListDto,
  mapSellerProfileDto,
  mapSellerSessionListDto,
  mapNotificationPrefsToSellerToggles,
  profileInitials,
} from "./mappers";
import {
  demoSellerBankAccounts,
  demoSellerProfile,
  demoSellerSessions,
} from "./mock";

type ProfileEnvelope = z.infer<typeof buyerProfileEnvelopeSchema>;
type PrefsEnvelope = z.infer<typeof notificationPreferencesEnvelopeSchema>;
type BankListEnvelope = z.infer<typeof bankAccountListEnvelopeSchema>;
type BankEnvelope = z.infer<typeof bankAccountEnvelopeSchema>;
type SessionListEnvelope = z.infer<typeof buyerSessionListEnvelopeSchema>;

/** Profile/prefs gate: auth domain (shared me endpoints for seller session). */
export function isSellerSettingsApiDomain(): boolean {
  return getDomainSource("auth") === "api";
}

/** Bank accounts gate: sellerFinance domain. */
export function isSellerBankApiDomain(): boolean {
  return getDomainSource("sellerFinance") === "api";
}

function useProfileMock(): boolean {
  return shouldUseMockFixtures("auth");
}

function useBankMock(): boolean {
  return shouldUseMockFixtures("sellerFinance");
}

/**
 * Session-bound seller profile + notification preferences.
 * GET /v1/me/profile + GET /v1/me/notification-preferences.
 */
export async function getSellerProfile(
  signal?: AbortSignal,
): Promise<SellerProfile> {
  if (useProfileMock()) return demoSellerProfile();

  const [profileRes, prefsRes] = await Promise.all([
    apiRequest<ProfileEnvelope>("/v1/me/profile", {
      schema: buyerProfileEnvelopeSchema,
      signal,
    }),
    apiRequest<PrefsEnvelope>("/v1/me/notification-preferences", {
      schema: notificationPreferencesEnvelopeSchema,
      signal,
    }),
  ]);
  return mapSellerProfileDto(
    profileRes.data,
    prefsRes.data.preferences,
  );
}

/**
 * PATCH /v1/me/profile with expectedVersion.
 * Email never patched here (dual-confirm AUT-120). No avatarRef (INT-175).
 */
export async function patchSellerProfile(
  input: PatchSellerProfileInput,
  signal?: AbortSignal,
): Promise<SellerProfile> {
  if (input.expectedVersion < 1) {
    throw new Error("expectedVersion required");
  }

  if (useProfileMock()) {
    const base = demoSellerProfile();
    const displayName = input.displayName?.trim() || base.displayName;
    return {
      ...base,
      displayName,
      locale: input.locale?.trim() || base.locale,
      localeLabel:
        input.locale?.trim() === "en-US" ? "English" : base.localeLabel,
      timezone: input.timezone?.trim()
        ? input.timezone.trim().includes("GMT")
          ? input.timezone.trim()
          : input.timezone.trim()
        : base.timezone,
      revision: base.revision + 1,
      initials: profileInitials(displayName),
    };
  }

  const body: BuyerPatchProfileRequest = buyerPatchProfileRequestSchema.parse({
    expectedVersion: input.expectedVersion,
    displayName: input.displayName,
    locale: input.locale,
    timezone: input.timezone
      ? displayTimezoneToWire(input.timezone)
      : undefined,
  });

  const response = await apiRequest<ProfileEnvelope, BuyerPatchProfileRequest>(
    "/v1/me/profile",
    {
      schema: buyerProfileEnvelopeSchema,
      method: "PATCH",
      body,
      signal,
    },
  );

  let prefs: Parameters<typeof mapSellerProfileDto>[1];
  try {
    const prefsRes = await apiRequest<PrefsEnvelope>(
      "/v1/me/notification-preferences",
      {
        schema: notificationPreferencesEnvelopeSchema,
        signal,
      },
    );
    prefs = prefsRes.data.preferences;
  } catch {
    prefs = undefined;
  }
  return mapSellerProfileDto(response.data, prefs);
}

/**
 * PATCH /v1/me/notification-preferences for closed event codes only.
 * Unmapped seller labels (stock/pending) are not sent.
 */
export async function patchSellerNotificationPreferences(
  input: PatchSellerNotificationPreferencesInput,
  signal?: AbortSignal,
): Promise<
  Pick<
    SellerProfile,
    | "saleSuccess"
    | "paymentPending"
    | "lowStock"
    | "payoutChange"
    | "newDeviceLogin"
    | "weeklySummary"
  >
> {
  if (useProfileMock()) {
    const base = demoSellerProfile();
    return {
      saleSuccess: input.saleSuccess ?? base.saleSuccess,
      paymentPending: base.paymentPending,
      lowStock: base.lowStock,
      payoutChange: input.payoutChange ?? base.payoutChange,
      newDeviceLogin: input.newDeviceLogin ?? base.newDeviceLogin,
      weeklySummary: input.weeklySummary ?? base.weeklySummary,
    };
  }

  const preferences: NotificationPreferencesPatchRequest["preferences"] = [];
  if (input.newDeviceLogin !== undefined) {
    preferences.push({
      eventCode: "SECURITY_ALERT",
      channel: "EMAIL",
      enabled: Boolean(input.newDeviceLogin),
    });
  }
  if (input.payoutChange !== undefined) {
    preferences.push({
      eventCode: "WITHDRAWAL_UPDATE",
      channel: "EMAIL",
      enabled: Boolean(input.payoutChange),
    });
  }
  if (input.weeklySummary !== undefined) {
    preferences.push({
      eventCode: "MARKETING_NEWSLETTER",
      channel: "EMAIL",
      enabled: Boolean(input.weeklySummary),
    });
  }
  if (input.saleSuccess !== undefined) {
    preferences.push({
      eventCode: "PAYMENT_RECEIPT",
      channel: "EMAIL",
      enabled: Boolean(input.saleSuccess),
    });
  }
  if (preferences.length === 0) {
    return mapNotificationPrefsToSellerToggles([]);
  }

  const body = notificationPreferencesPatchRequestSchema.parse({
    preferences,
  });

  const response = await apiRequest<
    PrefsEnvelope,
    NotificationPreferencesPatchRequest
  >("/v1/me/notification-preferences", {
    schema: notificationPreferencesEnvelopeSchema,
    method: "PATCH",
    body,
    signal,
  });
  return mapNotificationPrefsToSellerToggles(response.data.preferences);
}

/**
 * List store bank accounts (masked only).
 * GET /v1/stores/{storeId}/bank-accounts
 */
export async function listSellerBankAccounts(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerBankAccount[]> {
  if (!storeId) return [];
  if (useBankMock()) return demoSellerBankAccounts(storeId);

  const response = await apiRequest<BankListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/bank-accounts`,
    {
      schema: bankAccountListEnvelopeSchema,
      signal,
    },
  );
  return mapBankAccountListDto(response.data.items);
}

/**
 * Create bank account then verify (existing "Verify & save" control).
 * Full accountNumber is write-only body — never returned or cached in keys.
 */
export async function createSellerBankAccount(
  storeId: string,
  input: CreateSellerBankAccountInput,
  signal?: AbortSignal,
): Promise<SellerBankAccount> {
  if (useBankMock()) {
    const list = demoSellerBankAccounts(storeId);
    const last4 = input.accountNumber.replace(/\D/g, "").slice(-4) || "0000";
    return {
      id: `bank_mock_${Date.now()}`,
      bank: input.bankName || input.bankCode,
      bankCode: input.bankCode,
      numberMasked: `•••• ${last4}`,
      numberLast4: last4,
      holder: input.accountHolderName.trim().toUpperCase(),
      verified: true,
      primary: Boolean(input.makePrimary) || list.length === 0,
      revision: 1,
      status: "VERIFIED",
    };
  }

  const body: BankAccountCreateRequest = bankAccountCreateRequestSchema.parse({
    bankCode: input.bankCode,
    bankName: input.bankName,
    accountHolderName: input.accountHolderName.trim(),
    accountNumber: input.accountNumber.replace(/\s/g, ""),
    makePrimary: input.makePrimary,
  });

  const created = await apiRequest<BankEnvelope, BankAccountCreateRequest>(
    `/v1/stores/${encodeURIComponent(storeId)}/bank-accounts`,
    {
      schema: bankAccountEnvelopeSchema,
      method: "POST",
      body,
      idempotencyKey: createIdempotencyKey(),
      signal,
      // Sensitive bank mutation — attach recent MFA proof when available.
      requireRecentMfa: true,
    },
  );

  // Auto-verify when still pending (existing Verify & save control).
  const status = created.data.status.trim().toUpperCase();
  if (status === "VERIFIED") {
    return mapBankAccountDto(created.data);
  }

  try {
    const verified = await apiRequest<BankEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/bank-accounts/${encodeURIComponent(created.data.id)}/verify`,
      {
        schema: bankAccountEnvelopeSchema,
        method: "POST",
        idempotencyKey: createIdempotencyKey(),
        signal,
        requireRecentMfa: true,
      },
    );
    return mapBankAccountDto(verified.data);
  } catch {
    // Return created row if verify fails — UI shows Pending.
    return mapBankAccountDto(created.data);
  }
}

export async function updateSellerBankAccount(
  storeId: string,
  input: UpdateSellerBankAccountInput,
  signal?: AbortSignal,
): Promise<SellerBankAccount> {
  if (useBankMock()) {
    const base = demoSellerBankAccounts(storeId)[0];
    const last4 = input.accountNumber
      ? input.accountNumber.replace(/\D/g, "").slice(-4)
      : base.numberLast4;
    return {
      ...base,
      id: input.bankId,
      bank: input.bankName || input.bankCode || base.bank,
      bankCode: input.bankCode || base.bankCode,
      holder: (input.accountHolderName || base.holder).toUpperCase(),
      numberMasked: `•••• ${last4}`,
      numberLast4: last4,
      revision: base.revision + 1,
    };
  }

  const body: BankAccountUpdateRequest = bankAccountUpdateRequestSchema.parse({
    expectedVersion: input.expectedVersion,
    bankCode: input.bankCode,
    bankName: input.bankName,
    accountHolderName: input.accountHolderName,
    accountNumber: input.accountNumber
      ? input.accountNumber.replace(/\s/g, "")
      : undefined,
  });

  const response = await apiRequest<BankEnvelope, BankAccountUpdateRequest>(
    `/v1/stores/${encodeURIComponent(storeId)}/bank-accounts/${encodeURIComponent(input.bankId)}`,
    {
      schema: bankAccountEnvelopeSchema,
      method: "PATCH",
      body,
      signal,
      requireRecentMfa: true,
    },
  );
  return mapBankAccountDto(response.data);
}

export async function archiveSellerBankAccount(
  storeId: string,
  bankId: string,
  signal?: AbortSignal,
): Promise<SellerBankAccount> {
  if (useBankMock()) {
    const base = demoSellerBankAccounts(storeId)[0];
    return { ...base, id: bankId, status: "ARCHIVED", verified: false };
  }

  const response = await apiRequest<BankEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/bank-accounts/${encodeURIComponent(bankId)}`,
    {
      schema: bankAccountEnvelopeSchema,
      method: "DELETE",
      signal,
      requireRecentMfa: true,
    },
  );
  return mapBankAccountDto(response.data);
}

export async function makePrimarySellerBankAccount(
  storeId: string,
  bankId: string,
  signal?: AbortSignal,
): Promise<SellerBankAccount> {
  if (useBankMock()) {
    const base = demoSellerBankAccounts(storeId)[0];
    return { ...base, id: bankId, primary: true };
  }

  const response = await apiRequest<BankEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/bank-accounts/${encodeURIComponent(bankId)}/make-primary`,
    {
      schema: bankAccountEnvelopeSchema,
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      signal,
      requireRecentMfa: true,
    },
  );
  return mapBankAccountDto(response.data);
}

/**
 * List own sessions (auth surface).
 * GET /v1/auth/sessions — same SessionView as buyer alias.
 */
export async function listSellerSessions(
  signal?: AbortSignal,
): Promise<SellerSession[]> {
  if (useProfileMock()) return demoSellerSessions();

  const response = await apiRequest<SessionListEnvelope>("/v1/auth/sessions", {
    schema: buyerSessionListEnvelopeSchema,
    signal,
  });
  return mapSellerSessionListDto(response.data.sessions);
}

export async function revokeOtherSellerSessions(
  signal?: AbortSignal,
): Promise<{ revokedCount: number }> {
  if (useProfileMock()) return { revokedCount: 0 };

  const response = await apiRequest<
    z.infer<typeof buyerSessionRevokeEnvelopeSchema>
  >("/v1/auth/sessions/revoke-others", {
    schema: buyerSessionRevokeEnvelopeSchema,
    method: "POST",
    signal,
  });
  return {
    revokedCount: response.data.revokedCount ?? 0,
  };
}
