/** Existing list/detail view model (frozen geometry). */
export type SellerCustomer = {
  id: string;
  storeId?: string;
  customer: string;
  email: string;
  product: string;
  amount: number;
  status: string;
  date: string;
  avatar: string;
  orders: number;
  spent: number;
  /** Detail-only metrics */
  avgOrder?: number;
  productCount?: number;
  firstSeenDisplay?: string;
  marketingConsentLabel?: string;
  noteBody?: string;
  noteVersion?: number;
  history?: SellerCustomerHistoryItem[];
};

export type SellerCustomerHistoryItem = {
  id: string;
  date: string;
  avatar: string;
  customer: string;
  email: string;
  product: string;
  status: string;
  amount: number;
};

export type SellerCustomerListFilters = {
  q?: string;
  page?: number;
  pageSize?: number;
};

/** NumberedPageList adapter shape. */
export type SellerCustomerPage = {
  items: SellerCustomer[];
  page: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
};
