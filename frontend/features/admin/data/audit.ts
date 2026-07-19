/**
 * ADM-360 — audit list/detail/integrity/export adapters.
 * Domain: adminRead. Permission: audit.read (export uses same per ADM-110).
 * API path never appends client mock chain or local full-data CSV authority.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  adminAuditEventEnvelopeSchema,
  adminAuditEventListItemsEnvelopeSchema,
  adminAuditExportEnvelopeSchema,
  adminAuditIntegrityEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminAuditEvent,
  AdminAuditExportJob,
  AdminAuditIntegrity,
  AdminAuditSearchFilters,
  AdminListFilters,
} from "./contracts";
import {
  mapAdminAuditEventDto,
  mapAdminAuditExportDto,
  mapAdminAuditIntegrityDto,
  normalizeAdminAuditSearchFilters,
  normalizeAdminListFilters,
} from "./mappers";
import { mockAuditEvents } from "./mock";
import { combineMockAuditChains, readMockAuditEvents } from "./mock-audit";

type ListEnvelope = z.infer<typeof adminAuditEventListItemsEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof adminAuditEventEnvelopeSchema>;
type IntegrityEnvelope = z.infer<typeof adminAuditIntegrityEnvelopeSchema>;
type ExportEnvelope = z.infer<typeof adminAuditExportEnvelopeSchema>;

const EXPORT_POLL_MS = 800;
const EXPORT_POLL_MAX = 12;

export function demoAuditEvents(): AdminAuditEvent[] {
  return combineMockAuditChains(readMockAuditEvents(), mockAuditEvents());
}

export function demoAuditIntegrity(
  events: AdminAuditEvent[] = demoAuditEvents(),
): AdminAuditIntegrity {
  const withHash = events.filter((e) => e.integrityHash);
  return {
    eventCount: events.length,
    headSequence: events.length,
    minSequence: events.length > 0 ? 1 : 0,
    ...(withHash[0]?.integrityHash
      ? { headPayloadHash: withHash[0].integrityHash }
      : {}),
    chainMode: "mock-fnv1a32",
    verifierStatus: "OK",
    chainValid: true,
  };
}

/**
 * List audit events. Accepts AdminListFilters (overview) or audit search bag.
 * Server filters: action, resourceType, resourceId, actorUserId, limit.
 */
export async function listAuditEvents(
  filters: AdminListFilters & AdminAuditSearchFilters = {},
  signal?: AbortSignal,
): Promise<AdminAuditEvent[]> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoAuditEvents();
  }

  const normalized = normalizeAdminListFilters(filters);
  const search = normalizeAdminAuditSearchFilters({
    action:
      typeof filters.action === "string"
        ? filters.action
        : typeof filters.status === "string"
          ? filters.status
          : undefined,
    resourceType: filters.resourceType,
    resourceId: filters.resourceId,
    actorUserId: filters.actorUserId,
    limit: (normalized.limit as number | undefined) ?? filters.limit ?? 50,
  });

  const response = await apiRequest<ListEnvelope>("/v1/admin/audit-logs", {
    schema: adminAuditEventListItemsEnvelopeSchema,
    query: {
      limit: search.limit ?? 50,
      ...(search.action ? { action: search.action } : {}),
      ...(search.resourceType ? { resourceType: search.resourceType } : {}),
      ...(search.resourceId ? { resourceId: search.resourceId } : {}),
      ...(search.actorUserId ? { actorUserId: search.actorUserId } : {}),
    },
    signal,
  });

  return response.data.items.map(mapAdminAuditEventDto);
}

export async function getAuditEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<AdminAuditEvent> {
  const id = eventId.trim();
  if (!id) throw new Error("eventId is required");

  if (shouldUseMockFixtures("adminRead")) {
    const found = demoAuditEvents().find((e) => e.id === id);
    if (!found) throw new Error("Audit event not found");
    return found;
  }

  const response = await apiRequest<DetailEnvelope>(
    `/v1/admin/audit-logs/${encodeURIComponent(id)}`,
    {
      schema: adminAuditEventEnvelopeSchema,
      signal,
    },
  );
  return mapAdminAuditEventDto(response.data);
}

export async function getAuditIntegrity(
  signal?: AbortSignal,
): Promise<AdminAuditIntegrity> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoAuditIntegrity();
  }

  const response = await apiRequest<IntegrityEnvelope>(
    "/v1/admin/audit-integrity",
    {
      schema: adminAuditIntegrityEnvelopeSchema,
      signal,
    },
  );
  return mapAdminAuditIntegrityDto(response.data);
}

export type CreateAuditExportInput = {
  reason: string;
  filter?: Record<string, unknown>;
};

export async function createAuditExport(
  input: CreateAuditExportInput,
  signal?: AbortSignal,
): Promise<AdminAuditExportJob> {
  const reason = input.reason.trim();
  if (reason.length < 12) {
    throw new Error("Reason must be at least 12 characters for audit export");
  }

  if (shouldUseMockFixtures("adminRead")) {
    return {
      id: `aex_mock_${Date.now().toString(36)}`,
      status: "COMPLETE",
      redactionPolicy: "MOCK_LOCAL",
      reason,
      rowCount: demoAuditEvents().length,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
  }

  const response = await apiRequest<
    ExportEnvelope,
    { reason: string; filter?: Record<string, unknown> }
  >("/v1/admin/audit-exports", {
    schema: adminAuditExportEnvelopeSchema,
    method: "POST",
    body: {
      reason,
      ...(input.filter && Object.keys(input.filter).length > 0
        ? { filter: input.filter }
        : {}),
    },
    auditReason: reason,
    signal,
  });
  return mapAdminAuditExportDto(response.data);
}

export async function getAuditExport(
  exportId: string,
  signal?: AbortSignal,
): Promise<AdminAuditExportJob> {
  const id = exportId.trim();
  if (!id) throw new Error("exportId is required");

  if (shouldUseMockFixtures("adminRead")) {
    return {
      id,
      status: "COMPLETE",
      redactionPolicy: "MOCK_LOCAL",
      rowCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  const response = await apiRequest<ExportEnvelope>(
    `/v1/admin/audit-exports/${encodeURIComponent(id)}`,
    {
      schema: adminAuditExportEnvelopeSchema,
      signal,
    },
  );
  return mapAdminAuditExportDto(response.data);
}

/**
 * Create export job and poll until terminal status (bounded).
 * Opens signed downloadUrl when BE provides it — never builds local full CSV on API.
 */
export async function runAuditExportJob(
  input: CreateAuditExportInput,
  signal?: AbortSignal,
): Promise<AdminAuditExportJob> {
  let job = await createAuditExport(input, signal);
  const terminal = new Set([
    "COMPLETE",
    "COMPLETED",
    "FAILED",
    "EXPIRED",
    "ERROR",
  ]);

  for (
    let i = 0;
    i < EXPORT_POLL_MAX && !terminal.has(job.status.toUpperCase());
    i += 1
  ) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((resolve) => {
      window.setTimeout(resolve, EXPORT_POLL_MS);
    });
    job = await getAuditExport(job.id, signal);
  }

  return job;
}

export function isAuditExportComplete(job: AdminAuditExportJob): boolean {
  const s = job.status.toUpperCase();
  return s === "COMPLETE" || s === "COMPLETED";
}
