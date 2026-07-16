import { ratingSummary, reviews } from "@/lib/reviews-mock-data";
import type { SellerRatingSummary, SellerReview } from "./contracts";

export function demoReviews(seller = "Asep AI Tools"): SellerReview[] {
  return (reviews as SellerReview[]).filter(
    (review) => review.seller === seller,
  );
}

export function demoRatingSummary(): SellerRatingSummary {
  return ratingSummary as SellerRatingSummary;
}

export function demoPublicReviews(productId: string): SellerReview[] {
  return (reviews as SellerReview[]).filter(
    (review) => review.productId === productId && review.status === "Published",
  );
}
