/**
 * Public review transport DTO → existing SellerReview / SellerRatingSummary view models (PUB-100).
 * Pure; no React.
 */

import type {
  PublicReviewDto,
  PublicReviewSummaryDto,
} from "@/shared/api/schemas";
import type { SellerRatingSummary, SellerReview } from "./contracts";

const STATUS_VIEW: Record<string, string> = {
  PUBLISHED: "Published",
  published: "Published",
  Published: "Published",
  PENDING: "Pending moderation",
  pending: "Pending moderation",
  "Pending moderation": "Pending moderation",
  HIDDEN: "Hidden",
  hidden: "Hidden",
  REJECTED: "Rejected",
  rejected: "Rejected",
};

function mapReviewStatus(status: string): string {
  return STATUS_VIEW[status] ?? status;
}

function formatReviewDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initialsFromBuyer(buyer: string): string {
  const parts = buyer.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Map wire public review to frozen SellerReview card model. */
export function mapPublicReviewDto(dto: PublicReviewDto): SellerReview {
  const buyer = dto.buyer?.trim() || "Pembeli";
  const view: SellerReview = {
    id: dto.id,
    productId: dto.productId,
    product: dto.product ?? "",
    seller: dto.seller ?? "",
    buyer,
    initials: dto.initials?.trim() || initialsFromBuyer(buyer),
    rating: dto.rating,
    title: dto.title,
    body: dto.body,
    verified: dto.verified ?? dto.verifiedPurchase ?? false,
    status: mapReviewStatus(dto.status),
    createdAt: formatReviewDate(dto.createdAt),
  };
  if (dto.sellerReply) view.sellerReply = dto.sellerReply;
  return view;
}

export function mapPublicReviewListDto(items: PublicReviewDto[]): SellerReview[] {
  return items.map(mapPublicReviewDto);
}

/**
 * Map BE summary (count/averageRating/rating1..5) → view (total/average/distribution).
 * Zero-review: total=0, widths use 0% (never NaN).
 */
export function mapPublicReviewSummaryDto(
  dto: PublicReviewSummaryDto,
): SellerRatingSummary {
  const total = Number.isFinite(dto.count) ? Math.max(0, Math.trunc(dto.count)) : 0;
  const average =
    total === 0
      ? 0
      : Number.isFinite(dto.averageRating)
        ? dto.averageRating
        : 0;
  const distribution: Record<number, number> = {
    1: Math.max(0, Math.trunc(dto.rating1 || 0)),
    2: Math.max(0, Math.trunc(dto.rating2 || 0)),
    3: Math.max(0, Math.trunc(dto.rating3 || 0)),
    4: Math.max(0, Math.trunc(dto.rating4 || 0)),
    5: Math.max(0, Math.trunc(dto.rating5 || 0)),
  };
  return { average, total, distribution };
}

/** Distribution bar width percent for score 1..5; zero total → 0 (no NaN). */
export function reviewDistributionWidthPercent(
  summary: SellerRatingSummary,
  score: number,
): number {
  if (!summary.total || summary.total <= 0) return 0;
  const count = summary.distribution[score] ?? 0;
  if (!Number.isFinite(count) || count <= 0) return 0;
  const pct = (count / summary.total) * 100;
  return Number.isFinite(pct) ? pct : 0;
}

export function emptyRatingSummary(): SellerRatingSummary {
  return {
    average: 0,
    total: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
}
