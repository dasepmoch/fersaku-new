/**
 * SEL-200 — store-scoped analytics overview + traffic transport.
 * Domain: sellerOperations (with sellerFinance for balance/revenue siblings).
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  analyticsOverviewEnvelopeSchema,
  analyticsTrafficEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AnalyticsChannel,
  AnalyticsDateRange,
  SellerAnalyticsOverview,
  SellerTrafficAnalytics,
} from "./contracts";
import {
  buildAnalyticsDateRange,
  mapAnalyticsOverviewDto,
  mapTrafficPageToAnalytics,
} from "./mappers";
import { demoAnalyticsOverview, demoTrafficAnalytics } from "./mock";

type OverviewEnvelope = z.infer<typeof analyticsOverviewEnvelopeSchema>;
type TrafficEnvelope = z.infer<typeof analyticsTrafficEnvelopeSchema>;

export type GetAnalyticsOverviewParams = {
  storeId: string;
  range?: AnalyticsDateRange;
  signal?: AbortSignal;
};

export type GetAnalyticsTrafficParams = {
  storeId: string;
  range?: AnalyticsDateRange;
  channel?: AnalyticsChannel;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

function isSellerOpsMock(): boolean {
  return shouldUseMockFixtures("sellerOperations");
}

export async function getSellerAnalyticsOverview(
  params: GetAnalyticsOverviewParams,
): Promise<SellerAnalyticsOverview> {
  const { storeId, signal } = params;
  const range =
    params.range ?? buildAnalyticsDateRange(30, "Asia/Jakarta");

  if (isSellerOpsMock()) {
    return demoAnalyticsOverview(storeId, range);
  }

  const response = await apiRequest<OverviewEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/analytics/overview`,
    {
      schema: analyticsOverviewEnvelopeSchema,
      query: {
        from: range.from,
        to: range.to,
        timezone: range.timezone,
      },
      signal,
    },
  );

  return mapAnalyticsOverviewDto(response.data, response.meta.timestamp);
}

export async function getSellerAnalyticsTraffic(
  params: GetAnalyticsTrafficParams,
): Promise<SellerTrafficAnalytics> {
  const { storeId, signal } = params;
  const range =
    params.range ?? buildAnalyticsDateRange(30, "Asia/Jakarta");
  const channel = params.channel ?? "all";

  if (isSellerOpsMock()) {
    return demoTrafficAnalytics(storeId, range, channel);
  }

  const response = await apiRequest<TrafficEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/analytics/traffic`,
    {
      schema: analyticsTrafficEnvelopeSchema,
      query: {
        from: range.from,
        to: range.to,
        timezone: range.timezone,
        channel,
        ...(params.cursor ? { cursor: params.cursor } : {}),
        limit: params.limit ?? 100,
      },
      signal,
    },
  );

  return mapTrafficPageToAnalytics(
    storeId,
    response.data,
    channel,
    response.meta.timestamp,
  );
}

