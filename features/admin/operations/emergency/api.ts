/**
 * ADM-370 — providers/system health, emergency controls, fee read+preview.
 * Domains: adminRead (reads), adminWrite (emergency mutation).
 * Truthful health only; no optimistic emergency success.
 */

import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  adminEmergencyControlEnvelopeSchema,
  adminEmergencyControlListEnvelopeSchema,
  adminFeePreviewEnvelopeSchema,
  adminFeePreviewRequestSchema,
  adminProviderHealthListEnvelopeSchema,
  adminSetEmergencyControlRequestSchema,
  adminSystemSnapshotEnvelopeSchema,
  feePolicyEnvelopeSchema,
  type AdminEmergencyControlDto,
  type AdminFeePreviewDto,
  type AdminProviderHealthDto,
  type AdminSystemSnapshotDto,
  type FeePolicyDto,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";
import type {
  EmergencyControl,
  EmergencySwitchName,
  FeePolicyView,
  FeePreviewView,
  ProviderHealthRow,
  SystemHealthSnapshot,
} from "./data";
import {
  composeProviderRows,
  mapEmergencyControlDto,
  mapEmergencyControlList,
  mapFeePolicyDto,
  mapFeePreviewDto,
  mapProviderHealthDto,
  mapSystemSnapshotDto,
} from "./mappers";
import {
  demoComponentHealth,
  demoEmergencyControls,
  demoFeePolicy,
  demoSystemSnapshot,
} from "./mock";

type SystemEnvelope = z.infer<typeof adminSystemSnapshotEnvelopeSchema>;
type EmergencyListEnvelope = z.infer<
  typeof adminEmergencyControlListEnvelopeSchema
>;
type EmergencyEnvelope = z.infer<typeof adminEmergencyControlEnvelopeSchema>;
type ProvidersEnvelope = z.infer<typeof adminProviderHealthListEnvelopeSchema>;
type FeesEnvelope = z.infer<typeof feePolicyEnvelopeSchema>;
type FeePreviewEnvelope = z.infer<typeof adminFeePreviewEnvelopeSchema>;

export function isAdminSystemApiDomain(): boolean {
  return getDomainSource("adminRead") === "api";
}

export function isAdminEmergencyWriteApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

export async function getAdminSystemSnapshot(
  signal?: AbortSignal,
): Promise<SystemHealthSnapshot> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoSystemSnapshot();
  }

  const response = await apiRequest<SystemEnvelope>("/v1/admin/system", {
    schema: adminSystemSnapshotEnvelopeSchema,
    signal,
  });
  return mapSystemSnapshotDto(response.data as AdminSystemSnapshotDto);
}

export async function listAdminEmergencyControls(
  signal?: AbortSignal,
): Promise<EmergencyControl[]> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoEmergencyControls();
  }

  const response = await apiRequest<EmergencyListEnvelope>(
    "/v1/admin/system/emergency-controls",
    {
      schema: adminEmergencyControlListEnvelopeSchema,
      signal,
    },
  );
  return mapEmergencyControlList(response.data.items);
}

export async function listAdminProviders(
  signal?: AbortSignal,
): Promise<ProviderHealthRow[]> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoComponentHealth();
  }

  const response = await apiRequest<ProvidersEnvelope>(
    "/v1/admin/providers",
    {
      schema: adminProviderHealthListEnvelopeSchema,
      signal,
    },
  );
  const items = response.data.items as AdminProviderHealthDto[];
  return items.map(mapProviderHealthDto);
}

/**
 * Providers page source: system component health when present, else providers list.
 * Never invent green rows for missing dependencies.
 */
export async function listAdminProviderInfrastructure(
  signal?: AbortSignal,
): Promise<{
  rows: ProviderHealthRow[];
  emergencyControls: EmergencyControl[];
  overallLabel: string;
  overallKind: SystemHealthSnapshot["overallKind"];
  checkedLabel: string;
  feePolicyVersion: string;
  note: string;
  systemError: string | null;
  providersError: string | null;
}> {
  if (shouldUseMockFixtures("adminRead")) {
    const snap = demoSystemSnapshot();
    return {
      rows: snap.componentHealth,
      emergencyControls: snap.emergencyControls,
      overallLabel: snap.overallLabel,
      overallKind: snap.overallKind,
      checkedLabel: snap.checkedLabel,
      feePolicyVersion: snap.feePolicyVersion,
      note: snap.note,
      systemError: null,
      providersError: null,
    };
  }

  const [sysSettled, provSettled] = await Promise.allSettled([
    getAdminSystemSnapshot(signal),
    listAdminProviders(signal),
  ]);

  const system =
    sysSettled.status === "fulfilled" ? sysSettled.value : null;
  const providers =
    provSettled.status === "fulfilled" ? provSettled.value : [];

  const rows = composeProviderRows(
    system?.componentHealth ?? [],
    providers,
  );

  let emergencyControls = system?.emergencyControls ?? [];
  if (!system && emergencyControls.length === 0) {
    try {
      emergencyControls = await listAdminEmergencyControls(signal);
    } catch {
      emergencyControls = [];
    }
  }

  const overallKind = system?.overallKind
    ?? (rows.length
      ? rows.some((r) => r.statusKind === "down")
        ? "down"
        : rows.some((r) => r.statusKind === "degraded")
          ? "degraded"
          : rows.every((r) => r.statusKind === "ok")
            ? "ok"
            : "unknown"
      : "unknown");

  return {
    rows,
    emergencyControls,
    overallLabel:
      system?.overallLabel ??
      (overallKind === "ok"
        ? "Provider vault healthy"
        : overallKind === "degraded"
          ? "Provider vault degraded"
          : overallKind === "down"
            ? "Provider vault unavailable"
            : "Provider health unknown"),
    overallKind,
    checkedLabel:
      system?.checkedLabel ??
      rows.map((r) => r.checkedLabel).find(Boolean) ??
      "unknown",
    feePolicyVersion: system?.feePolicyVersion ?? "—",
    note: system?.note ?? "",
    systemError:
      sysSettled.status === "rejected"
        ? errorMessage(sysSettled.reason, "System snapshot unavailable")
        : null,
    providersError:
      provSettled.status === "rejected"
        ? errorMessage(provSettled.reason, "Provider health unavailable")
        : null,
  };
}

export type SetEmergencyControlInput = {
  switchName: EmergencySwitchName;
  enabled: boolean;
  reason: string;
  incidentTicket?: string;
  expectedVersion: number;
  idempotencyKey?: string;
};

export type SetEmergencyControlResult = {
  control: EmergencyControl;
  requestId: string;
  conflict: boolean;
};

/**
 * POST /v1/admin/system/emergency-controls
 * Requires reason, expectedVersion, recent MFA, idempotency.
 * On version conflict: throws ApiError (409) so UI can refresh version without losing reason.
 */
export async function setAdminEmergencyControl(
  input: SetEmergencyControlInput,
  signal?: AbortSignal,
): Promise<SetEmergencyControlResult> {
  const reason = input.reason.trim();
  if (reason.length < 12) {
    throw new Error("A reason of at least 12 characters is required for audit");
  }
  if (input.expectedVersion < 1) {
    throw new Error("expectedVersion is required");
  }

  const body = adminSetEmergencyControlRequestSchema.parse({
    switchName: input.switchName,
    enabled: input.enabled,
    reason,
    expectedVersion: input.expectedVersion,
    ...(input.incidentTicket?.trim()
      ? { incidentTicket: input.incidentTicket.trim() }
      : {}),
  });
  const idempotencyKey = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const existing =
      demoEmergencyControls().find((c) => c.switchName === input.switchName) ??
      demoEmergencyControls()[0]!;
    if (existing.version !== input.expectedVersion) {
      throw new ApiError(409, {
        code: PROBLEM_CODES.CONFLICT,
        message: "Emergency control version conflict",
        requestId: "mock_emg_conflict",
      });
    }
    const next: EmergencyControl = {
      ...existing,
      enabled: input.enabled,
      version: existing.version + 1,
      reason,
      ...(input.incidentTicket?.trim()
        ? { incidentTicket: input.incidentTicket.trim() }
        : {}),
    };
    appendClientAuditEvent({
      actor: "admin@fersaku.id",
      action: `emergency.${input.enabled ? "enabled" : "paused"}`,
      target: input.switchName,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      control: next,
      requestId: `mock_emg_${input.switchName}`,
      conflict: false,
    };
  }

  try {
    const response = await apiRequest<
      EmergencyEnvelope,
      z.infer<typeof adminSetEmergencyControlRequestSchema>
    >("/v1/admin/system/emergency-controls", {
      method: "POST",
      body,
      schema: adminEmergencyControlEnvelopeSchema,
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
      ifMatch: String(input.expectedVersion),
    });
    const mapped = mapEmergencyControlDto(
      response.data as AdminEmergencyControlDto,
    );
    if (!mapped) {
      throw new Error("Server returned an unknown emergency switch");
    }
    return {
      control: mapped,
      requestId: response.meta.requestId,
      conflict: false,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 409 || error.code === PROBLEM_CODES.CONFLICT)) {
      throw error;
    }
    throw error;
  }
}

export async function getAdminSystemFees(
  signal?: AbortSignal,
): Promise<FeePolicyView> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoFeePolicy();
  }

  const response = await apiRequest<FeesEnvelope>("/v1/admin/system/fees", {
    schema: feePolicyEnvelopeSchema,
    signal,
  });
  return mapFeePolicyDto(response.data as FeePolicyDto);
}

export type FeePreviewInput = {
  kind: "transaction" | "withdrawal";
  amount: number;
  providerFee?: number;
  source?: "STOREFRONT" | "QRIS_API";
};

/**
 * POST /v1/admin/system/fees/preview — pure calculator; never persists.
 */
export async function previewAdminSystemFees(
  input: FeePreviewInput,
  signal?: AbortSignal,
): Promise<FeePreviewView> {
  const body = adminFeePreviewRequestSchema.parse({
    kind: input.kind,
    amount: Math.max(0, Math.round(input.amount)),
    ...(input.providerFee != null
      ? { providerFee: Math.max(0, Math.round(input.providerFee)) }
      : {}),
    ...(input.source ? { source: input.source } : {}),
  });

  if (shouldUseMockFixtures("adminRead")) {
    const { calculateTransactionFee, calculateWithdrawalFee } = await import(
      "@/shared/finance/fee-policy"
    );
    if (body.kind === "withdrawal") {
      const w = calculateWithdrawalFee(body.amount, body.providerFee);
      return {
        policyVersion: "LAUNCH_FEE_POLICY_V1",
        kind: "withdrawal",
        amount: w.amount,
        platformFee: w.platformFee,
        processingFee: w.processingFee,
        totalFee: w.totalFee,
        netAmount: w.netAmount,
        minimumAmount: w.minimumAmount,
        belowMinimum: w.belowMinimum,
      };
    }
    const t = calculateTransactionFee(body.amount);
    return {
      policyVersion: "LAUNCH_FEE_POLICY_V1",
      kind: "transaction",
      amount: t.amount,
      platformFee: t.platformFee,
      processingFee: t.processingFee,
      totalFee: t.totalFee,
      netAmount: t.netAmount,
    };
  }

  const response = await apiRequest<
    FeePreviewEnvelope,
    z.infer<typeof adminFeePreviewRequestSchema>
  >("/v1/admin/system/fees/preview", {
    method: "POST",
    body,
    schema: adminFeePreviewEnvelopeSchema,
    signal,
  });
  return mapFeePreviewDto(response.data as AdminFeePreviewDto);
}

function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return fallback;
}
