/**
 * PUB-220 — public platform status adapter.
 * GET /v1/status only (sanitized process identity). Never /metrics or admin health.
 */

import { apiRequest } from "@/shared/api/http-client";
import {
  statusEnvelopeSchema,
  type StatusDataDto,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { PublicPlatformStatusView } from "./contracts";
import {
  mapStatusDtoToPublicView,
  mapUnavailablePublicStatus,
} from "./mappers";

/** Short public revalidate; status is informational, not SLA telemetry. */
export const PUBLIC_STATUS_REVALIDATE_SECONDS = 60;
export const PUBLIC_STATUS_CACHE_TAG = "public-platform-status";

/** Deterministic mock process signal — not multi-service operational truth. */
export const MOCK_STATUS_DTO: StatusDataDto = {
  service: "fersaku-api",
  version: "0.0.0-mock",
  appEnv: "local",
  uptimeSeconds: 0,
};

/**
 * Sanitized public status DTO (schema-validated).
 * Mock → local process fixture; API → GET /v1/status; failure → null (caller maps unavailable).
 */
export async function getPublicStatusDto(
  signal?: AbortSignal,
): Promise<{ dto: StatusDataDto; source: "api" | "mock" } | null> {
  if (shouldUseMockFixtures("publicCatalog")) {
    return { dto: MOCK_STATUS_DTO, source: "mock" };
  }

  try {
    const response = await apiRequest<{ data: StatusDataDto }>(
      "/v1/status",
      {
        schema: statusEnvelopeSchema,
        signal,
      },
    );
    return { dto: response.data, source: "api" };
  } catch {
    return null;
  }
}

/**
 * Public /status page view model.
 * Never throws into fake operational green — degrades to unavailable mapping.
 */
export async function getPublicPlatformStatus(
  signal?: AbortSignal,
): Promise<PublicPlatformStatusView> {
  const result = await getPublicStatusDto(signal);
  if (!result) return mapUnavailablePublicStatus();
  return mapStatusDtoToPublicView(result.dto, result.source);
}
