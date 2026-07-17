/**
 * ADM-120 — admin overview + platform volume + audit stream transport.
 * Domain: adminRead. Permission: admin.dashboard.read (overview/volume).
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  adminOverviewEnvelopeSchema,
  adminPlatformVolumeEnvelopeSchema,
  structuralEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminAuditEvent,
  AdminListFilters,
  AdminOverview,
  AdminPlatformVolumeSeries,
} from "./contracts";
import {
  mapAdminOverviewDto,
  mapMockPlatformVolumeHeights,
  mapPlatformVolumeBuckets,
  normalizeAdminListFilters,
} from "./mappers";
import { mockAuditEvents, mockPlatformVolume } from "./mock";
import { combineMockAuditChains, readMockAuditEvents } from "./mock-audit";

type OverviewEnvelope = z.infer<typeof adminOverviewEnvelopeSchema>;
type VolumeEnvelope = z.infer<typeof adminPlatformVolumeEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export function demoAuditEvents(): AdminAuditEvent[] {
  return combineMockAuditChains(readMockAuditEvents(), mockAuditEvents());
}

export function demoPlatformVolume(): AdminPlatformVolumeSeries {
  return mapMockPlatformVolumeHeights(mockPlatformVolume(), MOCK_AS_OF);
}

export function demoAdminOverview(): AdminOverview {
  return {
    merchantCount: 1284,
    buyerCount: 8420,
    orderCount: 19420,
    paymentCount: 18800,
    pendingWithdrawalCount: 12,
    openKycCount: 5,
    grossVolumePaidIdr: 84_200_000,
    platformFeePaidIdr: 3_180_000,
    paymentSuccessRateBps: 9684,
    asOf: MOCK_AS_OF,
  };
}

export async function getAdminOverview(
  signal?: AbortSignal,
): Promise<AdminOverview> {
  if (shouldUseMockFixtures("adminRead")) return demoAdminOverview();

  const response = await apiRequest<OverviewEnvelope>("/v1/admin/overview", {
    schema: adminOverviewEnvelopeSchema,
    signal,
  });
  return mapAdminOverviewDto(response.data, response.meta.timestamp);
}

export async function getPlatformVolume(
  signal?: AbortSignal,
): Promise<AdminPlatformVolumeSeries> {
  if (shouldUseMockFixtures("adminRead")) return demoPlatformVolume();

  const response = await apiRequest<VolumeEnvelope>(
    "/v1/admin/overview/platform-volume",
    {
      schema: adminPlatformVolumeEnvelopeSchema,
      signal,
    },
  );
  return mapPlatformVolumeBuckets(response.data, response.meta.timestamp);
}

/**
 * Live audit stream for overview: mock uses fixtures; API uses audit-logs
 * wrapper `{ items }` (ADM-360 owns full search schema). Structural parse only.
 */
export async function listAuditEvents(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminAuditEvent[]> {
  if (shouldUseMockFixtures("adminRead")) return demoAuditEvents();

  const normalized = normalizeAdminListFilters(filters);
  const response = await apiRequest<{
    data: { items?: unknown[] } | unknown[];
    meta: { requestId: string; timestamp: string };
  }>("/v1/admin/audit-logs", {
    schema: structuralEnvelopeSchema,
    query: {
      limit: (normalized.limit as number | undefined) ?? 50,
      action:
        typeof filters.status === "string" ? filters.status : undefined,
    },
    signal,
  });

  const raw = response.data;
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] })?.items)
      ? ((raw as { items: unknown[] }).items)
      : [];

  return items
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? r.eventId ?? "");
      if (!id) return null;
      return {
        id,
        actor: String(r.actor ?? r.actorEmail ?? r.actorUserId ?? "—"),
        action: String(r.action ?? "—"),
        target: String(r.target ?? r.resourceId ?? r.resourceType ?? "—"),
        ip: String(r.ip ?? r.ipAddress ?? "—"),
        result: String(r.result ?? r.outcome ?? "—"),
        time: String(r.time ?? r.createdAt ?? r.occurredAt ?? "—"),
        ...(typeof r.context === "string" ? { context: r.context } : {}),
        ...(typeof r.previousHash === "string"
          ? { previousHash: r.previousHash }
          : {}),
        ...(typeof r.integrityHash === "string"
          ? { integrityHash: r.integrityHash }
          : {}),
      } satisfies AdminAuditEvent;
    })
    .filter((e): e is AdminAuditEvent => e !== null);
}
