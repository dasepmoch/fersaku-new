import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminAuditEvent } from "./contracts";
import { mockAuditEvents, mockPlatformVolume } from "./mock";

export function demoAuditEvents(): AdminAuditEvent[] {
  return mockAuditEvents();
}

export function demoPlatformVolume(): number[] {
  return mockPlatformVolume();
}

export async function listAuditEvents(
  signal?: AbortSignal,
): Promise<AdminAuditEvent[]> {
  if (!isLiveApi()) return demoAuditEvents();
  const response = await apiRequest<ApiEnvelope<AdminAuditEvent[]>>(
    "/v1/admin/audit-logs",
    { signal },
  );
  return response.data;
}

export async function getPlatformVolume(
  signal?: AbortSignal,
): Promise<number[]> {
  if (!isLiveApi()) return demoPlatformVolume();
  const response = await apiRequest<ApiEnvelope<number[]>>(
    "/v1/admin/overview/platform-volume",
    { signal },
  );
  return response.data;
}
