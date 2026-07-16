export type BuyerPurchase = {
  orderId: string;
  productId: string;
  product: string;
  seller: string;
  sellerSlug: string;
  price: number;
  purchasedAt: string;
  status: "Paid" | "Pending";
  deliveryType: "download" | "link" | "credentials" | "code";
  palette: string;
  glyph: string;
  version?: string;
  updateAvailable?: string;
  sellerUpdatesEnabled: boolean;
  downloads?: {
    used: number;
    max: number;
    expiresAt: string;
    fileName: string;
    fileSize: string;
  };
  protectedLink?: { label: string; host: string; lastOpened?: string };
  credentialFields?: Array<{ label: string; value: string; secret?: boolean }>;
  code?: {
    value: string;
    status: "Assigned" | "Revealed" | "Activated";
    instructions: string;
  };
};

export type BuyerSession = {
  id: string;
  device: string;
  location: string;
  ip: string;
  active: string;
  current: boolean;
};

export type BuyerProfile = {
  name: string;
  email: string;
  phone: string;
  locale: string;
  timezone: string;
};
