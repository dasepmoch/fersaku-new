import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminAuditEvent } from "./contracts";
import { mockAuditEvents, mockPlatformVolume } from "./mock";
import { combineMockAuditChains, readMockAuditEvents } from "./mock-audit";

export function demoAuditEvents(): AdminAuditEvent[] {
  return combineMockAuditChains(readMockAuditEvents(), mockAuditEvents());
}

export function demoPlatformVolume(): number[] {
  return mockPlatformVolume();
}

export async function listAuditEvents(
  signal?: AbortSignal,
): Promise<AdminAuditEvent[]> {
  if (shouldUseMockFixtures("adminRead")) return demoAuditEvents();
  const response = await apiRequest<ApiEnvelope<AdminAuditEvent[]>>(
    "/v1/admin/audit-logs",
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getPlatformVolume(
  signal?: AbortSignal,
): Promise<number[]> {
  if (shouldUseMockFixtures("adminRead")) return demoPlatformVolume();
  const response = await apiRequest<ApiEnvelope<number[]>>(
    "/v1/admin/overview/platform-volume",
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
