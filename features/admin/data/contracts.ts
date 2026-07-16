export type AdminMerchant = {
  id: string;
  name: string;
  owner: string;
  email: string;
  volume: number;
  orders: number;
  risk: string;
  status: string;
  joined: string;
  /** Whether production QRIS API credentials are currently usable. */
  apiAccess: string;
};

/** The surface that created a successful payment. */
export type AdminPaymentSource = "STOREFRONT" | "QRIS_API";

/** A payout can consume funds earned from one or both payment surfaces. */
export type AdminWithdrawalSource = AdminPaymentSource | "MIXED";

export type AdminTransactionSource = AdminWithdrawalSource;

export type AdminOrder = {
  id: string;
  store: string;
  customer: string;
  product: string;
  gross: number;
  /** Fee posted only after a successful payment; zero while unpaid or failed. */
  totalFeeCharged: number;
  status: string;
  payment: string;
  created: string;
  source: "STOREFRONT";
};

export type AdminPaymentIntent = {
  id: string;
  provider: string;
  merchant: string;
  amount: number;
  providerRef: string;
  status: string;
  latency: string;
  created: string;
  source: AdminPaymentSource;
};

export type AdminWithdrawal = {
  id: string;
  merchant: string;
  owner: string;
  amount: number;
  bank: string;
  account: string;
  risk: string;
  status:
    "Pending" | "Processing" | "On hold" | "Completed" | "Failed" | "Rejected";
  requested: string;
  source: AdminWithdrawalSource;
  /** Xendit quote/actual fee snapshot; never guessed by the UI. */
  providerProcessingFee: number | null;
  providerFeeStatus: "VERIFIED" | "POSTED" | "UNAVAILABLE";
  providerFeeReference?: string;
};

export type AdminAuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  result: string;
  time: string;
  context?: string;
  previousHash?: string;
  integrityHash?: string;
};

export type AdminRole = {
  id: string;
  name: string;
  description: string;
  permissions?: string[];
  members: number;
  system: boolean;
  color: string;
};

export type AdminBuyer = {
  id: string;
  name: string;
  email: string;
  verified: string;
  purchases: number;
  spent: number;
  sessions: number;
  last: string;
};

export type AdminReview = {
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

export type AdminPermissionGroup = {
  group: string;
  permissions: Array<[permission: string, description: string]>;
};

export type AdminBuyerPurchase = {
  orderId: string;
  product: string;
  seller: string;
  status: string;
};

export type AdminBuyerSession = {
  id: string;
  device: string;
  location: string;
  ip: string;
  active: string;
  current: boolean;
};

export type AdminInventoryField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  buyerCopyable: boolean;
};

export type AdminStockProduct = {
  id: string;
  title: string;
  type: string;
  available: number;
  reserved: number;
  sold: number;
  invalid: number;
  lowAt: number;
  delivery: string;
};

export type AdminStockItem = {
  id: string;
  /** Field names only. Secret and personal values never travel in list APIs. */
  schemaPreview: string;
  status: "Available" | "Reserved" | "Sold" | "Invalid";
  orderId?: string;
  createdAt: string;
};

export type AdminStockItemSecret = {
  itemId: string;
  values: Record<string, string>;
  expiresAt: string;
};
