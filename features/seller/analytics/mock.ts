/**
 * SEL-200 — mock fixtures for seller overview/traffic (prototype geometry).
 */

import { compactRupiah } from "@/shared/format/money";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import type {
  AnalyticsChannel,
  AnalyticsDateRange,
  SellerAnalyticsOverview,
  SellerTrafficAnalytics,
  SellerTrafficSourceRow,
} from "./contracts";
import { buildTrafficMetrics } from "./mappers";

export const demoTrafficSources: SellerTrafficSourceRow[] = [
  {
    key: "twitter.com",
    source: "twitter.com",
    channel: "Social",
    channelLabel: "Social",
    clicks: 2842,
    sales: 126,
    revenueIdr: 9_950_000,
    revenue: compactRupiah(9_950_000),
    campaign: "launch_july",
    color: "#1d9bf0",
  },
  {
    key: "instagram.com",
    source: "instagram.com",
    channel: "Social",
    channelLabel: "Social",
    clicks: 2314,
    sales: 118,
    revenueIdr: 9_320_000,
    revenue: compactRupiah(9_320_000),
    campaign: "reels_prompt",
    color: "#ef5b7d",
  },
  {
    key: "youtube.com",
    source: "youtube.com",
    channel: "Video",
    channelLabel: "Video",
    clicks: 1426,
    sales: 94,
    revenueIdr: 7_430_000,
    revenue: compactRupiah(7_430_000),
    campaign: "tutorial_ai",
    color: "#f05245",
  },
  {
    key: "google.com",
    source: "google.com",
    channel: "Organic",
    channelLabel: "Organic",
    clicks: 1103,
    sales: 76,
    revenueIdr: 6_000_000,
    revenue: compactRupiah(6_000_000),
    campaign: "organic",
    color: "#4f7df3",
  },
  {
    key: "direct",
    source: "Direct / none",
    channel: "Direct",
    channelLabel: "Direct",
    clicks: 914,
    sales: 61,
    revenueIdr: 4_820_000,
    revenue: compactRupiah(4_820_000),
    campaign: "none",
    color: "#6d7a72",
  },
  {
    key: "newsletter.asep.ai",
    source: "newsletter.asep.ai",
    channel: "Email",
    channelLabel: "Email",
    clicks: 642,
    sales: 58,
    revenueIdr: 4_580_000,
    revenue: compactRupiah(4_580_000),
    campaign: "weekly_28",
    color: "#d79032",
  },
  {
    key: "tiktok.com",
    source: "tiktok.com",
    channel: "Social",
    channelLabel: "Social",
    clicks: 1880,
    sales: 72,
    revenueIdr: 5_680_000,
    revenue: compactRupiah(5_680_000),
    campaign: "tiktok_creator",
    color: "#111111",
  },
  {
    key: "linkedin.com",
    source: "linkedin.com",
    channel: "Social",
    channelLabel: "Social",
    clicks: 520,
    sales: 31,
    revenueIdr: 2_450_000,
    revenue: compactRupiah(2_450_000),
    campaign: "b2b_launch",
    color: "#0a66c2",
  },
  {
    key: "threads.net",
    source: "threads.net",
    channel: "Social",
    channelLabel: "Social",
    clicks: 410,
    sales: 22,
    revenueIdr: 1_740_000,
    revenue: compactRupiah(1_740_000),
    campaign: "threads_drop",
    color: "#2a2a2a",
  },
  {
    key: "facebook.com",
    source: "facebook.com",
    channel: "Social",
    channelLabel: "Social",
    clicks: 980,
    sales: 44,
    revenueIdr: 3_480_000,
    revenue: compactRupiah(3_480_000),
    campaign: "fb_ads_soft",
    color: "#1877f2",
  },
  {
    key: "producthunt.com",
    source: "producthunt.com",
    channel: "Organic",
    channelLabel: "Organic",
    clicks: 360,
    sales: 29,
    revenueIdr: 2_290_000,
    revenue: compactRupiah(2_290_000),
    campaign: "ph_launch",
    color: "#da552f",
  },
  {
    key: "discord.gg",
    source: "discord.gg",
    channel: "Community",
    channelLabel: "Community",
    clicks: 290,
    sales: 18,
    revenueIdr: 1_420_000,
    revenue: compactRupiah(1_420_000),
    campaign: "community_drop",
    color: "#5865f2",
  },
];

export function demoAnalyticsOverview(
  storeId = DEMO_STORE_ID,
  range?: AnalyticsDateRange,
): SellerAnalyticsOverview {
  return {
    storeId,
    timezone: range?.timezone ?? "Asia/Jakarta",
    from: range?.from ?? "2026-06-17",
    to: range?.to ?? "2026-07-16",
    sessions: 9762,
    pageViews: 18_420,
    checkouts: 812,
    orders: 312,
    grossIdr: 24_860_000,
    conversionRateBps: 840,
    channels: [
      { channel: "social", sessions: 5200, orders: 180, grossIdr: 14_200_000 },
      { channel: "organic", sessions: 1800, orders: 76, grossIdr: 6_000_000 },
      { channel: "direct", sessions: 914, orders: 61, grossIdr: 4_820_000 },
      { channel: "email", sessions: 642, orders: 58, grossIdr: 4_580_000 },
    ],
    asOf: "2026-07-16T17:00:00+07:00",
  };
}

/** Prototype card totals (kept exact for mock visual parity). */
const DEMO_TRAFFIC_METRICS_ALL = {
  attributedClicks: 9762,
  attributedSales: 576,
  attributedRevenueIdr: 45_490_000,
  blendedCvrPercent: 5.9,
  bestCampaign: "tutorial_ai",
  bestCampaignNote: "YouTube - 6,59% CVR",
} as const;

export function demoTrafficAnalytics(
  storeId = DEMO_STORE_ID,
  range?: AnalyticsDateRange,
  channel: AnalyticsChannel = "all",
): SellerTrafficAnalytics {
  const rows =
    channel === "all"
      ? demoTrafficSources
      : demoTrafficSources.filter(
          (row) => row.channelLabel.toLowerCase() === channel,
        );
  const metrics =
    channel === "all"
      ? { ...DEMO_TRAFFIC_METRICS_ALL }
      : buildTrafficMetrics(rows);
  return {
    storeId,
    timezone: range?.timezone ?? "Asia/Jakarta",
    from: range?.from ?? "2026-06-17",
    to: range?.to ?? "2026-07-16",
    channel,
    rows,
    metrics,
    hasMore: false,
    nextCursor: null,
    asOf: "2026-07-16T17:00:00+07:00",
  };
}
