/**
 * ADM-230 — admin own profile / prefs / sessions view models.
 * Geometry matches existing /admin/profile controls (no redesign).
 */

/** Own staff profile bound to existing Staff identity fields. */
export type AdminProfile = {
  fullName: string;
  email: string;
  /**
   * Job title is display-only local draft on API path (no closed BE field).
   * Mock may seed a value for snapshot continuity.
   */
  jobTitle: string;
  timezone: string;
  revision: number;
  /** Initials only — INT-175 avatar DISABLED. */
  initials: string;
  mfaEnabled: boolean;
  /**
   * Notification prefs mapped to existing Personal notifications toggles.
   * Closed BE event codes only.
   */
  kyc: boolean;
  withdrawals: boolean;
  incidents: boolean;
  digest: boolean;
};

export type PatchAdminProfileInput = {
  expectedVersion: number;
  displayName?: string;
  timezone?: string;
};

/**
 * Closed-schema preference patch for admin notification labels that map to BE.
 */
export type PatchAdminNotificationPreferencesInput = {
  /** KYC_UPDATE — QRIS API KYC reviews */
  kyc?: boolean;
  /** WITHDRAWAL_UPDATE — high-value withdrawal reviews */
  withdrawals?: boolean;
  /** SECURITY_ALERT — provider/infra incidents */
  incidents?: boolean;
  /** MARKETING_NEWSLETTER — daily operations digest */
  digest?: boolean;
};

/** Session row for Trusted sessions panel. */
export type AdminSession = {
  id: string;
  device: string;
  ip: string;
  active: string;
  current: boolean;
};

export type RevokeAdminSessionInput = {
  sessionId: string;
  /** Claims session id — authoritative current check. */
  currentSessionId?: string;
  reason?: string;
  idempotencyKey?: string;
};

export type RevokeAdminSessionResult = {
  accepted: boolean;
  sessionId: string;
  revokedCurrent: boolean;
  requestId?: string;
};
