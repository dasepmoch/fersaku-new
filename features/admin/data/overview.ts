/**
 * ADM-120 — admin overview + platform volume transport.
 * Domain: adminRead. Permission: admin.dashboard.read (overview/volume).
 * Audit stream: re-export ADM-360 adapters from ./audit.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  adminOverviewEnvelopeSchema,
  adminPlatformVolumeEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminOverview, AdminPlatformVolumeSeries } from "./contracts";
import {
  mapAdminOverviewDto,
  mapMockPlatformVolumeHeights,
  mapPlatformVolumeBuckets,
} from "./mappers";
import { mockPlatformVolume } from "./mock";

export { demoAuditEvents, listAuditEvents } from "./audit";

type OverviewEnvelope = z.infer<typeof adminOverviewEnvelopeSchema>;
type VolumeEnvelope = z.infer<typeof adminPlatformVolumeEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

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
