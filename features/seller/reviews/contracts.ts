export type SellerReview = {
  id: string;
  productId: string;
  product: string;
  seller: string;
  buyer: string;
  initials: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  status: string;
  createdAt: string;
  sellerReply?: string;
  /** Server reply version for optimistic concurrency on edit. */
  replyContentVersion?: number;
  contentVersion?: number;
};

export type SellerRatingSummary = {
  average: number;
  total: number;
  distribution: Record<number, number>;
};

export type UpsertSellerReplyInput = {
  body: string;
  expectedVersion?: number;
};

export type ReportSellerReviewInput = {
  reasonCode?: "SPAM" | "ABUSE" | "OFF_TOPIC" | "OTHER" | "INACCURATE";
  context?: string;
};
