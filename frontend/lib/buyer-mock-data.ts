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

export const buyerPurchases: BuyerPurchase[] = [
  {
    orderId: "FRS-240712-1842",
    productId: "prod_01",
    product: "AI Prompt Pack",
    seller: "Asep AI Tools",
    sellerSlug: "asep-ai-tools",
    price: 79000,
    purchasedAt: "12 Juli 2026, 14:33",
    status: "Paid",
    deliveryType: "download",
    palette: "#e9ff9b",
    glyph: "AI",
    version: "v3.0",
    updateAvailable: "v3.1",
    sellerUpdatesEnabled: true,
    downloads: {
      used: 1,
      max: 5,
      expiresAt: "19 Juli 2026",
      fileName: "ai-prompt-pack-v3.1.zip",
      fileSize: "48,2 MB",
    },
  },
  {
    orderId: "FRS-220628-1021",
    productId: "prod_04",
    product: "Figma Landing Kit",
    seller: "DesignKit Studio",
    sellerSlug: "designkit-studio",
    price: 189000,
    purchasedAt: "28 Juni 2026, 10:12",
    status: "Paid",
    deliveryType: "link",
    palette: "#d5c8ff",
    glyph: "F",
    sellerUpdatesEnabled: false,
    protectedLink: {
      label: "Buka Figma workspace",
      host: "figma.com",
      lastOpened: "10 Juli 2026",
    },
  },
  {
    orderId: "FRS-220611-0832",
    productId: "prod_account",
    product: "Canva Pro Team — 30 Hari",
    seller: "Digital Supply ID",
    sellerSlug: "digital-supply",
    price: 35000,
    purchasedAt: "11 Juni 2026, 08:44",
    status: "Paid",
    deliveryType: "credentials",
    palette: "#bdf8d0",
    glyph: "C",
    sellerUpdatesEnabled: false,
    credentialFields: [
      { label: "Username / Email", value: "buyer.workspace@inboxkit.id" },
      { label: "Password", value: "Fersaku#4821", secret: true },
      {
        label: "Team invite",
        value: "https://canva.com/brand/join/8K2...",
        secret: true,
      },
    ],
  },
  {
    orderId: "FRS-220529-2218",
    productId: "prod_code",
    product: "Steam Wallet IDR 90.000",
    seller: "KodeKita",
    sellerSlug: "kodekita",
    price: 92000,
    purchasedAt: "29 Mei 2026, 22:18",
    status: "Paid",
    deliveryType: "code",
    palette: "#c9defd",
    glyph: "#",
    sellerUpdatesEnabled: false,
    code: {
      value: "A8K2L-9QM4X-P7D2N",
      status: "Assigned",
      instructions:
        "Buka Steam > Games > Redeem a Steam Wallet Code, lalu masukkan kode di atas.",
    },
  },
];

export const buyerSessions = [
  {
    id: "ses_current",
    device: "Chrome di Linux",
    location: "Jakarta, Indonesia",
    ip: "180.252.81.42",
    active: "Sekarang",
    current: true,
  },
  {
    id: "ses_mobile",
    device: "Chrome di Android",
    location: "Jakarta, Indonesia",
    ip: "180.252.91.18",
    active: "2 jam lalu",
    current: false,
  },
  {
    id: "ses_safari",
    device: "Safari di iPhone",
    location: "Bandung, Indonesia",
    ip: "103.28.54.19",
    active: "5 hari lalu",
    current: false,
  },
];
