/**
 * SEL-200 — analytics transport DTO → existing overview/traffic view models.
 * Pure; no React. Financial truth stays on server aggregates.
 */

import { compactRupiah } from "@/shared/format/money";
import type {
  AnalyticsOverviewDto,
  AnalyticsTrafficPageDto,
  AnalyticsTrafficRowDto,
} from "@/shared/api/schemas";
import type {
  AnalyticsChannel,
  AnalyticsDateRange,
  AnalyticsTimezone,
  OverviewRangeLabel,
  SellerAnalyticsOverview,
  SellerTrafficAnalytics,
  SellerTrafficMetrics,
  SellerTrafficSourceRow,
  TrafficChannelLabel,
  TrafficRangeLabel,
} from "./contracts";

const CHANNEL_COLOR: Record<string, string> = {
  social: "#1d9bf0",
  organic: "#4f7df3",
  direct: "#6d7a72",
  email: "#d79032",
  referral: "#5865f2",
  utm: "#d79032",
  paid: "#1877f2",
  other: "#2a2a2a",
  video: "#f05245",
  community: "#5865f2",
};

const CHANNEL_LABEL: Record<string, string> = {
  social: "Social",
  organic: "Organic",
  direct: "Direct",
  email: "Email",
  referral: "Referral",
  utm: "UTM",
  paid: "Paid",
  other: "Other",
  video: "Video",
  community: "Community",
};

const UI_CHANNEL_TO_WIRE: Record<TrafficChannelLabel, AnalyticsChannel | null> =
  {
    "Semua channel": "all",
    Social: "social",
    Video: null, // no wire channel; filter client-side on mock rows only when mock
    Organic: "organic",
    Direct: "direct",
    Email: "email",
  };

export function rangeDaysFromOverviewLabel(label: OverviewRangeLabel): number {
  return label === "30 hari" ? 30 : 7;
}

export function rangeDaysFromTrafficLabel(label: TrafficRangeLabel): number {
  if (label === "90 hari") return 90;
  if (label === "30 hari") return 30;
  return 7;
}

export function wireChannelFromUiLabel(
  label: TrafficChannelLabel,
): AnalyticsChannel {
  const mapped = UI_CHANNEL_TO_WIRE[label];
  if (mapped) return mapped;
  // Video has no dedicated wire enum; request all and map presentation only.
  return "all";
}

/** Inclusive YYYY-MM-DD range ending today in timezone (Asia/Jakarta default). */
export function buildAnalyticsDateRange(
  days: number,
  timezone: AnalyticsTimezone = "Asia/Jakarta",
  now: Date = new Date(),
): AnalyticsDateRange {
  const safeDays = Math.min(90, Math.max(1, Math.trunc(days) || 7));
  const to = formatDayInTimezone(now, timezone);
  const fromDate = addCalendarDays(parseDay(to), -(safeDays - 1));
  const from = formatIsoDay(fromDate);
  return { from, to, timezone, days: safeDays };
}

function formatDayInTimezone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return formatIsoDay(date);
  }
}

function formatIsoDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
}

function addCalendarDays(date: Date, delta: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

export function mapAnalyticsOverviewDto(
  dto: AnalyticsOverviewDto,
  asOf: string,
): SellerAnalyticsOverview {
  return {
    storeId: dto.storeId,
    timezone: dto.timezone,
    from: dto.from,
    to: dto.to,
    sessions: Math.max(0, Math.trunc(dto.sessions)),
    pageViews: Math.max(0, Math.trunc(dto.pageViews)),
    checkouts: Math.max(0, Math.trunc(dto.checkouts)),
    orders: Math.max(0, Math.trunc(dto.orders)),
    grossIdr: Math.max(0, Math.trunc(dto.grossIdr)),
    conversionRateBps: Math.max(0, Math.trunc(dto.conversionRateBps)),
    channels: (dto.channels ?? []).map((c) => ({
      channel: c.channel ?? "other",
      sessions: Math.max(0, Math.trunc(c.sessions ?? 0)),
      orders: Math.max(0, Math.trunc(c.orders ?? 0)),
      grossIdr: Math.max(0, Math.trunc(c.grossIdr ?? 0)),
    })),
    ...(dto.policyVersionId ? { policyVersionId: dto.policyVersionId } : {}),
    ...(dto.aggregationVersion
      ? { aggregationVersion: dto.aggregationVersion }
      : {}),
    asOf,
  };
}

export function emptyAnalyticsOverview(
  storeId: string,
  range: AnalyticsDateRange,
  asOf: string,
): SellerAnalyticsOverview {
  return {
    storeId,
    timezone: range.timezone,
    from: range.from,
    to: range.to,
    sessions: 0,
    pageViews: 0,
    checkouts: 0,
    orders: 0,
    grossIdr: 0,
    conversionRateBps: 0,
    channels: [],
    asOf,
  };
}

export function formatConversionBps(bps: number): string {
  const pct = Math.max(0, bps) / 100;
  return `${pct.toLocaleString("id-ID", {
    minimumFractionDigits: pct % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatCountId(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString("id-ID");
}

/** Aggregate traffic rows by channel for the existing referrer table geometry. */
export function mapTrafficPageToAnalytics(
  storeId: string,
  page: AnalyticsTrafficPageDto,
  channel: AnalyticsChannel,
  asOf: string,
): SellerTrafficAnalytics {
  const byChannel = new Map<
    string,
    { sessions: number; orders: number; grossIdr: number }
  >();

  for (const row of page.items) {
    const key = normalizeChannel(row.channel);
    const prev = byChannel.get(key) ?? {
      sessions: 0,
      orders: 0,
      grossIdr: 0,
    };
    prev.sessions += Math.max(0, Math.trunc(row.sessions));
    prev.orders += Math.max(0, Math.trunc(row.orders));
    prev.grossIdr += Math.max(0, Math.trunc(row.grossIdr));
    byChannel.set(key, prev);
  }

  const rows: SellerTrafficSourceRow[] = [...byChannel.entries()]
    .map(([ch, agg]) => toSourceRow(ch, agg))
    .sort((a, b) => b.clicks - a.clicks || b.sales - a.sales);

  return {
    storeId,
    timezone: page.timezone,
    from: page.from,
    to: page.to,
    channel,
    rows,
    metrics: buildTrafficMetrics(rows),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor ?? null,
    asOf,
  };
}

function normalizeChannel(channel: string): string {
  return channel.trim().toLowerCase() || "other";
}

function toSourceRow(
  channel: string,
  agg: { sessions: number; orders: number; grossIdr: number },
): SellerTrafficSourceRow {
  const label = CHANNEL_LABEL[channel] ?? channel;
  const color = CHANNEL_COLOR[channel] ?? "#6d7a72";
  return {
    key: channel,
    source: channelSourceLabel(channel),
    channel: label,
    channelLabel: label,
    clicks: agg.sessions,
    sales: agg.orders,
    revenueIdr: agg.grossIdr,
    revenue: compactRupiah(agg.grossIdr),
    campaign: channel === "direct" ? "none" : channel,
    color,
  };
}

function channelSourceLabel(channel: string): string {
  switch (channel) {
    case "direct":
      return "Direct / none";
    case "organic":
      return "organic";
    case "social":
      return "social";
    case "email":
      return "email";
    case "referral":
      return "referral";
    case "utm":
      return "utm";
    case "paid":
      return "paid";
    default:
      return channel;
  }
}

export function buildTrafficMetrics(
  rows: SellerTrafficSourceRow[],
): SellerTrafficMetrics {
  const attributedClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const attributedSales = rows.reduce((s, r) => s + r.sales, 0);
  const attributedRevenueIdr = rows.reduce((s, r) => s + r.revenueIdr, 0);
  const blendedCvrPercent =
    attributedClicks > 0 ? (attributedSales / attributedClicks) * 100 : 0;

  let best: SellerTrafficSourceRow | null = null;
  let bestCvr = -1;
  for (const row of rows) {
    if (row.clicks <= 0) continue;
    const cvr = (row.sales / row.clicks) * 100;
    if (cvr > bestCvr || (cvr === bestCvr && (best?.sales ?? 0) < row.sales)) {
      best = row;
      bestCvr = cvr;
    }
  }

  return {
    attributedClicks,
    attributedSales,
    attributedRevenueIdr,
    blendedCvrPercent,
    bestCampaign: best?.campaign ?? "—",
    bestCampaignNote: best
      ? `${best.channelLabel} - ${bestCvr.toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}% CVR`
      : "Belum ada data",
  };
}

export function emptyTrafficAnalytics(
  storeId: string,
  range: AnalyticsDateRange,
  channel: AnalyticsChannel,
  asOf: string,
): SellerTrafficAnalytics {
  return {
    storeId,
    timezone: range.timezone,
    from: range.from,
    to: range.to,
    channel,
    rows: [],
    metrics: {
      attributedClicks: 0,
      attributedSales: 0,
      attributedRevenueIdr: 0,
      blendedCvrPercent: 0,
      bestCampaign: "—",
      bestCampaignNote: "Belum ada data",
    },
    hasMore: false,
    nextCursor: null,
    asOf,
  };
}

/** Map daily traffic rows for optional chart consumers (identity passthrough). */
export function mapTrafficRowsDto(
  items: AnalyticsTrafficRowDto[],
): AnalyticsTrafficRowDto[] {
  return items.map((row) => ({
    day: row.day,
    channel: row.channel,
    ...(row.productId ? { productId: row.productId } : {}),
    sessions: Math.max(0, Math.trunc(row.sessions)),
    pageViews: Math.max(0, Math.trunc(row.pageViews)),
    checkouts: Math.max(0, Math.trunc(row.checkouts)),
    orders: Math.max(0, Math.trunc(row.orders)),
    grossIdr: Math.max(0, Math.trunc(row.grossIdr)),
  }));
}

export function formatBlendedCvrNote(cvr: number): string {
  return `${cvr.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}% blended CVR`;
}

export function formatAttributedClicksNote(
  rangeLabel: string,
  deltaLabel?: string,
): string {
  if (deltaLabel) return `${deltaLabel} - ${rangeLabel}`;
  return rangeLabel;
}
