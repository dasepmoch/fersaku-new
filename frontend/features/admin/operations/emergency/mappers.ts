/**
 * ADM-370 mappers — never invent OK/Live when BE says degraded/unknown/down.
 */

import type {
  AdminComponentHealthDto,
  AdminEmergencyControlDto,
  AdminFeePreviewDto,
  AdminProviderHealthDto,
  AdminSystemSnapshotDto,
  FeePolicyDto,
} from "@/shared/api/schemas";
import type {
  EmergencyControl,
  EmergencySwitchName,
  FeePolicyView,
  FeePreviewView,
  HealthStatusKind,
  ProviderHealthRow,
  SystemHealthSnapshot,
} from "./data";
import {
  EMERGENCY_SWITCH_NAMES,
  SWITCH_META,
  isEmergencySwitchName,
} from "./data";

const PROVIDER_DISPLAY: Record<
  string,
  { name: string; type: string; role: string; color: string; id: string }
> = {
  xendit: {
    id: "xendit",
    name: "Xendit Payments",
    type: "QRIS acceptance & disbursement",
    role: "Payment rail",
    color: "#5b7cfa",
  },
  r2: {
    id: "r2",
    name: "Cloudflare R2",
    type: "Digital asset storage",
    role: "Object storage",
    color: "#e59633",
  },
  redis: {
    id: "redis",
    name: "Redis / Asynq",
    type: "Queues & background jobs",
    role: "Queue runtime",
    color: "#ef6351",
  },
  mail: {
    id: "resend",
    name: "Resend",
    type: "Transactional email",
    role: "Email delivery",
    color: "#8b6ee8",
  },
  resend: {
    id: "resend",
    name: "Resend",
    type: "Transactional email",
    role: "Email delivery",
    color: "#8b6ee8",
  },
};

export function classifyHealthStatus(raw: string | undefined | null): HealthStatusKind {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return "unknown";
  if (s === "OK" || s === "LIVE" || s === "HEALTHY" || s === "UP") return "ok";
  if (
    s === "DEGRADED" ||
    s === "WARN" ||
    s === "WARNING" ||
    s === "PARTIAL"
  ) {
    return "degraded";
  }
  if (
    s === "DOWN" ||
    s === "UNAVAILABLE" ||
    s === "ERROR" ||
    s === "FAILED" ||
    s === "CRITICAL"
  ) {
    return "down";
  }
  return "unknown";
}

/** Display label for chrome; never show Live/OK unless kind is ok. */
export function healthStatusLabel(
  kind: HealthStatusKind,
  raw: string,
): string {
  switch (kind) {
    case "ok":
      return "Live";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    default:
      return raw.trim() ? raw.trim() : "Unknown";
  }
}

export function overallHealthKind(
  rows: { statusKind: HealthStatusKind }[],
): HealthStatusKind {
  if (rows.length === 0) return "unknown";
  if (rows.some((r) => r.statusKind === "down")) return "down";
  if (rows.some((r) => r.statusKind === "unknown")) return "unknown";
  if (rows.some((r) => r.statusKind === "degraded")) return "degraded";
  if (rows.every((r) => r.statusKind === "ok")) return "ok";
  return "unknown";
}

export function overallHealthLabel(kind: HealthStatusKind): string {
  switch (kind) {
    case "ok":
      return "Provider vault healthy";
    case "degraded":
      return "Provider vault degraded";
    case "down":
      return "Provider vault unavailable";
    default:
      return "Provider health unknown";
  }
}

export function formatCheckedAt(iso: string | undefined): string {
  if (!iso?.trim()) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const delta = Date.now() - t;
  if (delta < 15_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  try {
    return new Date(t).toLocaleString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function resolveDisplay(key: string) {
  const k = key.trim().toLowerCase();
  return (
    PROVIDER_DISPLAY[k] ?? {
      id: k || "unknown",
      name: key.trim() || "Unknown provider",
      type: "Dependency",
      role: "Infrastructure",
      color: "#7c879d",
    }
  );
}

export function mapProviderHealthDto(
  dto: AdminProviderHealthDto,
): ProviderHealthRow {
  const statusRaw = dto.status?.trim() || "UNKNOWN";
  const statusKind = classifyHealthStatus(statusRaw);
  const display = resolveDisplay(dto.provider);
  const latencyMs =
    dto.latencyMs == null || Number.isNaN(dto.latencyMs)
      ? null
      : dto.latencyMs;
  return {
    id: display.id,
    provider: dto.provider,
    statusRaw,
    statusKind,
    statusLabel: healthStatusLabel(statusKind, statusRaw),
    latencyMs,
    latencyLabel: latencyMs == null ? "—" : `${latencyMs}ms`,
    accountScope: dto.accountScope?.trim() || "—",
    checkedAt: dto.checkedAt?.trim() || "",
    checkedLabel: formatCheckedAt(dto.checkedAt),
    message: dto.message?.trim() || "",
    role: display.role,
    type: display.type,
    name: display.name,
    color: display.color,
  };
}

export function mapComponentHealthDto(
  dto: AdminComponentHealthDto,
): ProviderHealthRow {
  const statusRaw = dto.status?.trim() || "UNKNOWN";
  const statusKind = classifyHealthStatus(statusRaw);
  const display = resolveDisplay(dto.component);
  const latencyMs =
    dto.latencyMs == null || Number.isNaN(dto.latencyMs)
      ? null
      : dto.latencyMs;
  return {
    id: display.id,
    provider: dto.component,
    component: dto.component,
    statusRaw,
    statusKind,
    statusLabel: healthStatusLabel(statusKind, statusRaw),
    latencyMs,
    latencyLabel: latencyMs == null ? "—" : `${latencyMs}ms`,
    accountScope: "platform",
    checkedAt: dto.checkedAt?.trim() || "",
    checkedLabel: formatCheckedAt(dto.checkedAt),
    message: dto.message?.trim() || "",
    role: display.role,
    type: display.type,
    name: display.name,
    color: display.color,
  };
}

export function mapEmergencyControlDto(
  dto: AdminEmergencyControlDto,
): EmergencyControl | null {
  const name = dto.switchName?.trim().toUpperCase() ?? "";
  if (!isEmergencySwitchName(name)) return null;
  const meta = SWITCH_META[name];
  return {
    id: meta.id,
    switchName: name,
    label: meta.label,
    description: meta.description,
    enabled: Boolean(dto.enabled),
    danger: meta.danger,
    impact: meta.impact,
    version: dto.version,
    reason: dto.reason ?? "",
    ...(dto.incidentTicket ? { incidentTicket: dto.incidentTicket } : {}),
    ...(dto.updatedAt ? { updatedAt: String(dto.updatedAt) } : {}),
  };
}

/**
 * Exactly the three approved switches, in stable order.
 * Missing BE rows surface as disabled/unknown version 0 (not fake-enabled).
 */
export function mapEmergencyControlList(
  items: AdminEmergencyControlDto[] | undefined,
): EmergencyControl[] {
  const byName = new Map<EmergencySwitchName, EmergencyControl>();
  for (const raw of items ?? []) {
    const mapped = mapEmergencyControlDto(raw);
    if (mapped) byName.set(mapped.switchName, mapped);
  }
  return EMERGENCY_SWITCH_NAMES.map((switchName) => {
    const existing = byName.get(switchName);
    if (existing) return existing;
    const meta = SWITCH_META[switchName];
    return {
      id: meta.id,
      switchName,
      label: meta.label,
      description: meta.description,
      enabled: false,
      danger: meta.danger,
      impact: meta.impact,
      version: 0,
      reason: "Control not returned by server",
    };
  });
}

export function mapSystemSnapshotDto(
  dto: AdminSystemSnapshotDto,
): SystemHealthSnapshot {
  const emergencyControls = mapEmergencyControlList(dto.emergencyControls);
  const componentHealth = (dto.componentHealth ?? []).map(
    mapComponentHealthDto,
  );
  const overallKind = overallHealthKind(componentHealth);
  const checked =
    componentHealth
      .map((c) => c.checkedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
  return {
    emergencyControls,
    componentHealth,
    feePolicyVersion: dto.feePolicyVersion?.trim() || "—",
    note: dto.note?.trim() || "",
    overallKind,
    overallLabel: overallHealthLabel(overallKind),
    checkedLabel: formatCheckedAt(checked || undefined),
  };
}

/**
 * Prefer component health (4 deps). If only Xendit provider list is available,
 * show that without inventing healthy R2/Redis/mail rows.
 */
export function composeProviderRows(
  components: ProviderHealthRow[],
  providers: ProviderHealthRow[],
): ProviderHealthRow[] {
  if (components.length > 0) return components;
  return providers;
}

export function mapFeePolicyDto(dto: FeePolicyDto): FeePolicyView {
  return {
    policyVersion: dto.policyVersion,
    transactionPercent: dto.transactionPercentBps / 100,
    transactionFixedIdr: dto.transactionFixedIdr,
    withdrawalPercent: dto.withdrawalPercentBps / 100,
    minimumWithdrawalIdr: dto.minimumWithdrawalIdr,
    immutable: dto.immutable,
    adminMutationAllowed: dto.adminMutationAllowed,
  };
}

export function mapFeePreviewDto(dto: AdminFeePreviewDto): FeePreviewView {
  const kind =
    dto.kind?.toLowerCase() === "withdrawal" ? "withdrawal" : "transaction";
  const amount = dto.amount ?? dto.gross ?? 0;
  const platformFee = dto.platformFee ?? 0;
  const processingFee =
    kind === "withdrawal"
      ? (dto.providerProcessingFee ?? dto.processingFee ?? null)
      : (dto.processingFee ?? null);
  const totalFee =
    dto.totalFee ??
    (processingFee == null ? null : platformFee + processingFee);
  const netAmount =
    dto.netAmount ?? dto.netDisbursement ?? null;
  const minimumAmount = dto.minimumAmount;
  return {
    policyVersion: dto.policyVersion,
    kind,
    amount,
    platformFee,
    processingFee,
    totalFee,
    netAmount,
    ...(minimumAmount != null
      ? {
          minimumAmount,
          belowMinimum: amount < minimumAmount,
        }
      : {}),
  };
}

export function incidentModeLabel(controls: EmergencyControl[]): string {
  const paused = controls.filter((c) => !c.enabled);
  if (paused.length === 0) return "Normal operations";
  if (paused.length === controls.length) return "All circuits paused";
  return `${paused.length} circuit${paused.length === 1 ? "" : "s"} paused`;
}

export function incidentModeHealthy(controls: EmergencyControl[]): boolean {
  return controls.every((c) => c.enabled);
}
