export type OrderStatus = "Paid" | "Pending" | "Failed" | "Delivered";

/** UI status tab labels on the list screen (frozen geometry). */
export type SellerOrderStatusTab = "Semua" | "Paid" | "Pending" | "Failed";

export type SellerOrderListFilters = {
  q?: string;
  statusTab?: SellerOrderStatusTab;
  page?: number;
  pageSize?: number;
  source?: string;
  from?: string;
  to?: string;
};

export type SellerOrderTimelineItem = {
  label: string;
  atDisplay: string;
  timeDisplay: string;
};

export type SellerOrderPaymentView = {
  method: string;
  paymentIntent: string;
  provider: string;
  status: string;
};

export type SellerOrderDeliveryView = {
  fulfilled: boolean;
  status: string;
  accessCount: number;
  maxAccesses: number;
  summary: string;
};

/**
 * Existing list/detail view model. Optional detail fields only populate
 * when detail DTO is mapped; list rows keep the base shape.
 */
export type SellerOrder = {
  id: string;
  /** Internal ULID for mutations/API paths when different from display id. */
  internalOrderId?: string;
  storeId: string;
  customer: string;
  email: string;
  product: string;
  amount: number;
  status: OrderStatus;
  date: string;
  avatar: string;
  feeIdr?: number;
  merchantNetIdr?: number;
  payment?: SellerOrderPaymentView;
  delivery?: SellerOrderDeliveryView;
  timeline?: SellerOrderTimelineItem[];
};

/** NumberedPageList adapter shape consumed by hooks/screens. */
export type SellerOrderPage = {
  items: SellerOrder[];
  page: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
};
