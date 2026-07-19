/**
 * ADM-370 — emergency switchboard + provider/system health view models.
 * Exactly three runtime switches; maintenance banner is UI-only / not BE-backed.
 */

export const EMERGENCY_SWITCH_NAMES = [
  "SELLER_REGISTRATION",
  "QRIS_CHECKOUT",
  "WITHDRAWALS",
] as const;

export type EmergencySwitchName = (typeof EMERGENCY_SWITCH_NAMES)[number];

/** UI row id used by existing switchboard chrome. */
export type EmergencyControlUiId = "registration" | "qris" | "withdrawals";

export type EmergencyControl = {
  id: EmergencyControlUiId;
  switchName: EmergencySwitchName;
  label: string;
  description: string;
  enabled: boolean;
  danger: boolean;
  impact: string;
  /** Optimistic concurrency token from BE. */
  version: number;
  reason: string;
  incidentTicket?: string;
  updatedAt?: string;
};

export type HealthStatusKind = "ok" | "degraded" | "down" | "unknown";

export type ProviderHealthRow = {
  id: string;
  provider: string;
  component?: string;
  statusRaw: string;
  statusKind: HealthStatusKind;
  /** Display label — never "Live" unless status is truthfully OK. */
  statusLabel: string;
  latencyMs: number | null;
  latencyLabel: string;
  accountScope: string;
  checkedAt: string;
  checkedLabel: string;
  message: string;
  role: string;
  type: string;
  name: string;
  color: string;
};

export type SystemHealthSnapshot = {
  emergencyControls: EmergencyControl[];
  componentHealth: ProviderHealthRow[];
  feePolicyVersion: string;
  note: string;
  overallKind: HealthStatusKind;
  overallLabel: string;
  checkedLabel: string;
};

export type FeePolicyView = {
  policyVersion: string;
  transactionPercent: number;
  transactionFixedIdr: number;
  withdrawalPercent: number;
  minimumWithdrawalIdr: number;
  immutable: boolean;
  adminMutationAllowed: boolean;
};

export type FeePreviewView = {
  policyVersion: string;
  kind: "transaction" | "withdrawal";
  amount: number;
  platformFee: number;
  processingFee: number | null;
  totalFee: number | null;
  netAmount: number | null;
  minimumAmount?: number;
  belowMinimum?: boolean;
};

export const SWITCH_META: Record<
  EmergencySwitchName,
  {
    id: EmergencyControlUiId;
    label: string;
    description: string;
    danger: boolean;
    impact: string;
  }
> = {
  SELLER_REGISTRATION: {
    id: "registration",
    label: "Seller registration",
    description: "Allow new seller account and store onboarding",
    danger: true,
    impact: "New seller registration and first-store onboarding",
  },
  QRIS_CHECKOUT: {
    id: "qris",
    label: "QRIS checkout",
    description: "Accept new Xendit QRIS payment intents",
    danger: true,
    impact: "All hosted checkout and API payment creation",
  },
  WITHDRAWALS: {
    id: "withdrawals",
    label: "Seller withdrawals",
    description: "Create and approve Xendit disbursements",
    danger: true,
    impact: "Seller payout creation and admin approvals",
  },
};

export const UI_ID_TO_SWITCH: Record<
  EmergencyControlUiId,
  EmergencySwitchName
> = {
  registration: "SELLER_REGISTRATION",
  qris: "QRIS_CHECKOUT",
  withdrawals: "WITHDRAWALS",
};

/** Snapshot seed for mock domain only. */
export const emergencySeed: EmergencyControl[] = (
  EMERGENCY_SWITCH_NAMES as readonly EmergencySwitchName[]
).map((switchName) => {
  const meta = SWITCH_META[switchName];
  return {
    id: meta.id,
    switchName,
    label: meta.label,
    description: meta.description,
    enabled: true,
    danger: meta.danger,
    impact: meta.impact,
    version: 1,
    reason: "",
  };
});

export const maintenanceBannerId = "global-maintenance-banner";

export function isEmergencySwitchName(
  value: string,
): value is EmergencySwitchName {
  return (EMERGENCY_SWITCH_NAMES as readonly string[]).includes(value);
}
