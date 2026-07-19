export type Product = {
  id: string;
  slug: string;
  title: string;
  short: string;
  description: string;
  price: number;
  type: "download" | "link" | "code";
  badge?: string;
  sales: number;
  palette: string;
  glyph: string;
  includes: string[];
  allowPayWhatYouWant?: boolean;
  minimumPrice?: number;
  updatesEnabled?: boolean;
  currentVersion?: string;
};

export const products: Product[] = [
  {
    id: "prod_01",
    slug: "ai-prompt-pack",
    title: "AI Prompt Pack",
    short: "125+ prompt teruji untuk kerja kreatif yang lebih cepat.",
    description:
      "Koleksi prompt siap pakai untuk riset, menulis, strategi konten, dan membangun produk. Dibuat dalam Bahasa Indonesia dengan formula yang mudah dimodifikasi.",
    price: 79000,
    type: "download",
    badge: "Paling laris",
    sales: 428,
    palette: "#e9ff9b",
    glyph: "AI",
    includes: [
      "125+ prompt siap pakai",
      "Panduan prompt engineering",
      "Update gratis selamanya",
      "PDF + Notion workspace",
    ],
    allowPayWhatYouWant: true,
    minimumPrice: 79000,
    updatesEnabled: true,
    currentVersion: "v3.0",
  },
  {
    id: "prod_02",
    slug: "cursor-rules-kit",
    title: "Cursor Rules Kit",
    short: "Aturan proyek siap tempel untuk coding dengan AI.",
    description:
      "Kumpulan rule yang membuat Cursor memahami stack, pola kode, dan standar kualitas proyekmu sejak prompt pertama.",
    price: 59000,
    type: "download",
    sales: 217,
    palette: "#c9defd",
    glyph: "//",
    includes: [
      "18 rules lintas stack",
      "Next.js & TypeScript presets",
      "Setup guide",
      "Lifetime updates",
    ],
  },
  {
    id: "prod_03",
    slug: "n8n-automation-pack",
    title: "n8n Automation Pack",
    short: "30 workflow otomatisasi untuk bisnis digital.",
    description:
      "Hemat puluhan jam dengan workflow n8n yang mencakup lead capture, reporting, content ops, dan customer support.",
    price: 149000,
    type: "download",
    badge: "Baru",
    sales: 96,
    palette: "#ffb69d",
    glyph: "↗",
    includes: [
      "30 JSON workflows",
      "Video instalasi",
      "Dokumentasi node",
      "Bonus prompt library",
    ],
  },
  {
    id: "prod_04",
    slug: "figma-landing-kit",
    title: "Figma Landing Kit",
    short: "Blok landing page modern untuk launch lebih cepat.",
    description:
      "UI kit modular dengan lebih dari 180 section yang rapi, responsif, dan siap dipakai untuk beragam produk digital.",
    price: 189000,
    type: "link",
    sales: 183,
    palette: "#d5c8ff",
    glyph: "F",
    includes: [
      "180+ responsive sections",
      "Design tokens",
      "Auto-layout 5.0",
      "Commercial license",
    ],
  },
  {
    id: "prod_05",
    slug: "notion-finance",
    title: "Notion Finance Tracker",
    short: "Sistem keuangan personal yang benar-benar enak dipakai.",
    description:
      "Kelola cashflow, tujuan tabungan, cicilan, dan review bulanan dalam satu workspace Notion yang tenang dan intuitif.",
    price: 49000,
    type: "link",
    sales: 624,
    palette: "#ffe69a",
    glyph: "N",
    includes: [
      "Dashboard keuangan",
      "Monthly review",
      "Goal tracker",
      "Video walkthrough",
    ],
  },
  {
    id: "prod_06",
    slug: "saas-starter",
    title: "Source Code SaaS Starter",
    short: "Fondasi SaaS production-ready untuk ide berikutnya.",
    description:
      "Next.js starter lengkap dengan auth, billing placeholder, dashboard, email, dan struktur database yang bersih.",
    price: 399000,
    type: "code",
    sales: 74,
    palette: "#b8f2d3",
    glyph: "{ }",
    includes: [
      "Next.js 15 source code",
      "Auth & dashboard",
      "Email templates",
      "1 project license",
    ],
  },
];

export const orders = [
  {
    id: "FRS-240712-1842",
    customer: "Nadia Putri",
    email: "nadia@studio.id",
    product: "AI Prompt Pack",
    amount: 79000,
    status: "Paid",
    date: "Baru saja",
    avatar: "NP",
  },
  {
    id: "FRS-240712-1839",
    customer: "Rizky Hidayat",
    email: "rizky@gmail.com",
    product: "n8n Automation Pack",
    amount: 149000,
    status: "Paid",
    date: "8 menit lalu",
    avatar: "RH",
  },
  {
    id: "FRS-240712-1834",
    customer: "Dimas Ardi",
    email: "dimas@hey.com",
    product: "Cursor Rules Kit",
    amount: 59000,
    status: "Pending",
    date: "21 menit lalu",
    avatar: "DA",
  },
  {
    id: "FRS-240712-1821",
    customer: "Citra Ayu",
    email: "citra@gmail.com",
    product: "Figma Landing Kit",
    amount: 189000,
    status: "Paid",
    date: "1 jam lalu",
    avatar: "CA",
  },
  {
    id: "FRS-240712-1816",
    customer: "Reza Akbar",
    email: "reza@icloud.com",
    product: "SaaS Starter",
    amount: 399000,
    status: "Failed",
    date: "2 jam lalu",
    avatar: "RA",
  },
  {
    id: "FRS-240712-1808",
    customer: "Salsa Nabila",
    email: "salsa@mail.id",
    product: "AI Prompt Pack",
    amount: 79000,
    status: "Paid",
    date: "3 jam lalu",
    avatar: "SN",
  },
  {
    id: "FRS-240712-1801",
    customer: "Fajar Nugroho",
    email: "fajar@hey.com",
    product: "Cursor Rules Kit",
    amount: 59000,
    status: "Paid",
    date: "4 jam lalu",
    avatar: "FN",
  },
  {
    id: "FRS-240712-1755",
    customer: "Intan Maharani",
    email: "intan@studio.id",
    product: "Figma Landing Kit",
    amount: 189000,
    status: "Pending",
    date: "5 jam lalu",
    avatar: "IM",
  },
  {
    id: "FRS-240712-1742",
    customer: "Yoga Pratama",
    email: "yoga@gmail.com",
    product: "n8n Automation Pack",
    amount: 149000,
    status: "Paid",
    date: "6 jam lalu",
    avatar: "YP",
  },
  {
    id: "FRS-240712-1730",
    customer: "Laras Wulandari",
    email: "laras@icloud.com",
    product: "Notion Finance Tracker",
    amount: 49000,
    status: "Paid",
    date: "7 jam lalu",
    avatar: "LW",
  },
  {
    id: "FRS-240712-1718",
    customer: "Hendra Wijaya",
    email: "hendra@mail.id",
    product: "SaaS Starter",
    amount: 399000,
    status: "Failed",
    date: "8 jam lalu",
    avatar: "HW",
  },
  {
    id: "FRS-240712-1704",
    customer: "Putri Andini",
    email: "putri@hey.com",
    product: "AI Prompt Pack",
    amount: 99000,
    status: "Paid",
    date: "9 jam lalu",
    avatar: "PA",
  },
  {
    id: "FRS-240712-1651",
    customer: "Bayu Santoso",
    email: "bayu@gmail.com",
    product: "Cursor Rules Kit",
    amount: 59000,
    status: "Pending",
    date: "10 jam lalu",
    avatar: "BS",
  },
];

export const revenueData = [
  { day: "Sen", revenue: 2100000, orders: 24 },
  { day: "Sel", revenue: 2800000, orders: 31 },
  { day: "Rab", revenue: 2400000, orders: 28 },
  { day: "Kam", revenue: 4100000, orders: 43 },
  { day: "Jum", revenue: 3600000, orders: 39 },
  { day: "Sab", revenue: 5200000, orders: 57 },
  { day: "Min", revenue: 4700000, orders: 51 },
];

export const mockApi = {
  async createCheckout(
    customer: { name: string; email: string },
    productId: string,
  ) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return {
      id: `cs_${Date.now()}`,
      productId,
      customer,
      status: "pending" as const,
      expiresIn: 15 * 60,
    };
  },
  async simulatePayment() {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { status: "paid" as const, orderId: "FRS-240712-1848" };
  },
};
