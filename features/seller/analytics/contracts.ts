/**
 * SEL-200 — seller overview/analytics view models (existing card/chart geometry).
 */

export type AnalyticsTimezone =
  | "Asia/Jakarta"
  | "Asia/Makassar"
  | "Asia/Jayapura"
  | "UTC";

/** Wire channel enum used by traffic query. */
export type AnalyticsChannel =
  | "all"
  | "direct"
  | "organic"
  | "referral"
  | "utm"
  | "social"
  | "email"
  | "paid"
  | "other";

/** UI channel filter labels (exact existing select options). */
export type TrafficChannelLabel =
  | "Semua channel"
  | "Social"
  | "Video"
  | "Organic"
  | "Direct"
  | "Email";

export type OverviewRangeLabel = "7 hari" | "30 hari";
export type TrafficRangeLabel = "7 hari" | "30 hari" | "90 hari";

export type AnalyticsChannelBreakdown = {
  channel: string;
  sessions: number;
  orders: number;
  grossIdr: number;
};

export type SellerAnalyticsOverview = {
  storeId: string;
  timezone: string;
  from: string;
  to: string;
  sessions: number;
  pageViews: number;
  checkouts: number;
  orders: number;
  grossIdr: number;
  conversionRateBps: number;
  channels: AnalyticsChannelBreakdown[];
  policyVersionId?: string;
  aggregationVersion?: string;
  /** Consistent snapshot time from envelope meta (never client-fabricated). */
  asOf: string;
};

export type SellerTrafficSourceRow = {
  /** Stable row key (channel + optional product). */
  key: string;
  source: string;
  channel: string;
  channelLabel: string;
  clicks: number;
  sales: number;
  revenueIdr: number;
  revenue: string;
  campaign: string;
  color: string;
};

export type SellerTrafficMetrics = {
  attributedClicks: number;
  attributedSales: number;
  attributedRevenueIdr: number;
  blendedCvrPercent: number;
  bestCampaign: string;
  bestCampaignNote: string;
};

export type SellerTrafficAnalytics = {
  storeId: string;
  timezone: string;
  from: string;
  to: string;
  channel: AnalyticsChannel;
  rows: SellerTrafficSourceRow[];
  metrics: SellerTrafficMetrics;
  hasMore: boolean;
  nextCursor: string | null;
  asOf: string;
};

export type AnalyticsDateRange = {
  from: string;
  to: string;
  timezone: AnalyticsTimezone;
  days: number;
};
