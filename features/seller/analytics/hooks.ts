"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import type {
  AnalyticsChannel,
  OverviewRangeLabel,
  TrafficChannelLabel,
  TrafficRangeLabel,
} from "./contracts";
import {
  getSellerAnalyticsOverview,
  getSellerAnalyticsTraffic,
} from "./api";
import {
  buildAnalyticsDateRange,
  rangeDaysFromOverviewLabel,
  rangeDaysFromTrafficLabel,
  wireChannelFromUiLabel,
} from "./mappers";
import { demoAnalyticsOverview, demoTrafficAnalytics } from "./mock";

export function useSellerAnalyticsOverview(
  storeId: string,
  rangeLabel: OverviewRangeLabel = "7 hari",
) {
  const days = rangeDaysFromOverviewLabel(rangeLabel);
  const range = buildAnalyticsDateRange(days, "Asia/Jakarta");

  return useAppQuery({
    queryKey: queryKeys.seller.analyticsOverview(storeId, {
      from: range.from,
      to: range.to,
      timezone: range.timezone,
      days: range.days,
    }),
    queryFn: (signal) =>
      getSellerAnalyticsOverview({ storeId, range, signal }),
    enabled: Boolean(storeId),
    surface: "private",
    keepPrevious: true,
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoAnalyticsOverview(storeId, range),
    ),
  });
}

export function useSellerAnalyticsTraffic(
  storeId: string,
  rangeLabel: TrafficRangeLabel = "30 hari",
  channelLabel: TrafficChannelLabel = "Semua channel",
) {
  const days = rangeDaysFromTrafficLabel(rangeLabel);
  const range = buildAnalyticsDateRange(days, "Asia/Jakarta");
  const channel: AnalyticsChannel = wireChannelFromUiLabel(channelLabel);

  return useAppQuery({
    queryKey: queryKeys.seller.analyticsTraffic(storeId, {
      from: range.from,
      to: range.to,
      timezone: range.timezone,
      days: range.days,
      channel,
    }),
    queryFn: (signal) =>
      getSellerAnalyticsTraffic({ storeId, range, channel, signal }),
    enabled: Boolean(storeId),
    surface: "private",
    keepPrevious: true,
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoTrafficAnalytics(storeId, range, channel),
    ),
  });
}
