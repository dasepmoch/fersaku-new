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
};

export type SellerRatingSummary = {
  average: number;
  total: number;
  distribution: Record<number, number>;
};
