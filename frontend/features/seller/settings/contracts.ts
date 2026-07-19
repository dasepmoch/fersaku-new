/**
 * SEL-340 — seller profile / settings / security / bank view models.
 * Geometry matches existing seller-settings tabs (no redesign).
 */

/** Personal profile bound to existing Profil tab fields. */
export type SellerProfile = {
  displayName: string;
  email: string;
  /** BCP-47 locale wire value (e.g. id-ID). */
  locale: string;
  /** Locale label for existing Bahasa field display. */
  localeLabel: string;
  timezone: string;
  /** Optimistic concurrency revision from BE. */
  revision: number;
  /** Initials only — INT-175 avatar DISABLED. */
  initials: string;
  /**
   * Notification prefs mapped to existing Notifikasi toggles.
   * Closed BE event codes only; unmapped labels are local draft.
   */
  saleSuccess: boolean;
  paymentPending: boolean;
  lowStock: boolean;
  payoutChange: boolean;
  newDeviceLogin: boolean;
  weeklySummary: boolean;
};

export type PatchSellerProfileInput = {
  expectedVersion: number;
  displayName?: string;
  locale?: string;
  timezone?: string;
};

/**
 * Closed-schema preference patch for seller notification labels that map to BE.
 * Unmapped toggles (saleSuccess, lowStock, weeklySummary, paymentPending) stay local.
 */
export type PatchSellerNotificationPreferencesInput = {
  /** SECURITY_ALERT EMAIL — login from new device */
  newDeviceLogin?: boolean;
  /** WITHDRAWAL_UPDATE EMAIL — payout changes */
  payoutChange?: boolean;
  /** MARKETING_NEWSLETTER EMAIL — weekly summary shell */
  weeklySummary?: boolean;
  /** PAYMENT_RECEIPT EMAIL — sale success (mandatory when present) */
  saleSuccess?: boolean;
};

/** Existing bank card geometry. numberLast4 from masked only. */
export type SellerBankAccount = {
  id: string;
  bank: string;
  bankCode: string;
  /** Masked display; never full account number. */
  numberMasked: string;
  /** Last 4 digits for •••• NNNN display. */
  numberLast4: string;
  holder: string;
  verified: boolean;
  primary: boolean;
  revision: number;
  status: string;
};

export type CreateSellerBankAccountInput = {
  bankCode: string;
  bankName?: string;
  accountHolderName: string;
  /** Write-only full number — never stored in query cache keys. */
  accountNumber: string;
  makePrimary?: boolean;
};

export type UpdateSellerBankAccountInput = {
  bankId: string;
  expectedVersion: number;
  bankCode?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
};

/** Session row for optional security list (auth sessions alias). */
export type SellerSession = {
  id: string;
  device: string;
  location: string;
  ip: string;
  active: string;
  current: boolean;
};
