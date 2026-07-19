/**
 * Mock fixtures for ADM-370 — non-live only. Never used when domain is api.
 */

import type {
  EmergencyControl,
  FeePolicyView,
  ProviderHealthRow,
  SystemHealthSnapshot,
} from "./data";
import { emergencySeed } from "./data";
import {
  overallHealthKind,
  overallHealthLabel,
} from "./mappers";

export function demoEmergencyControls(): EmergencyControl[] {
  return emergencySeed.map((c) => ({ ...c }));
}

export function demoComponentHealth(): ProviderHealthRow[] {
  const now = new Date().toISOString();
  return [
    {
      id: "xendit",
      provider: "xendit",
      component: "xendit",
      statusRaw: "OK",
      statusKind: "ok",
      statusLabel: "Live",
      latencyMs: 142,
      latencyLabel: "142ms",
      accountScope: "xendit-primary",
      checkedAt: now,
      checkedLabel: "just now",
      message: "mock probe",
      role: "Payment rail",
      type: "QRIS acceptance & disbursement",
      name: "Xendit Payments",
      color: "#5b7cfa",
    },
    {
      id: "r2",
      provider: "r2",
      component: "r2",
      statusRaw: "OK",
      statusKind: "ok",
      statusLabel: "Live",
      latencyMs: 86,
      latencyLabel: "86ms",
      accountScope: "platform",
      checkedAt: now,
      checkedLabel: "just now",
      message: "mock probe",
      role: "Object storage",
      type: "Digital asset storage",
      name: "Cloudflare R2",
      color: "#e59633",
    },
    {
      id: "redis",
      provider: "redis",
      component: "redis",
      statusRaw: "DEGRADED",
      statusKind: "degraded",
      statusLabel: "Degraded",
      latencyMs: 386,
      latencyLabel: "386ms",
      accountScope: "platform",
      checkedAt: now,
      checkedLabel: "just now",
      message: "mock elevated latency",
      role: "Queue runtime",
      type: "Queues & background jobs",
      name: "Redis / Asynq",
      color: "#ef6351",
    },
    {
      id: "resend",
      provider: "mail",
      component: "mail",
      statusRaw: "OK",
      statusKind: "ok",
      statusLabel: "Live",
      latencyMs: 121,
      latencyLabel: "121ms",
      accountScope: "platform",
      checkedAt: now,
      checkedLabel: "just now",
      message: "mock probe",
      role: "Email delivery",
      type: "Transactional email",
      name: "Resend",
      color: "#8b6ee8",
    },
  ];
}

export function demoSystemSnapshot(): SystemHealthSnapshot {
  const componentHealth = demoComponentHealth();
  const overallKind = overallHealthKind(componentHealth);
  return {
    emergencyControls: demoEmergencyControls(),
    componentHealth,
    feePolicyVersion: "LAUNCH_FEE_POLICY_V1",
    note: "Mock system snapshot — not live authority",
    overallKind,
    overallLabel: overallHealthLabel(overallKind),
    checkedLabel: "just now",
  };
}

export function demoFeePolicy(): FeePolicyView {
  return {
    policyVersion: "LAUNCH_FEE_POLICY_V1",
    transactionPercent: 3,
    transactionFixedIdr: 700,
    withdrawalPercent: 3,
    minimumWithdrawalIdr: 50_000,
    immutable: true,
    adminMutationAllowed: false,
  };
}
