export type SellerPageMeta = {
  title: string;
  description: string;
};

const sellerPageMeta: Record<string, SellerPageMeta> = {
  overview: {
    title: "Overview",
    description: "Ringkasan performa Asep AI Tools hari ini.",
  },
  products: {
    title: "Produk",
    description: "Kelola semua karya digital yang kamu jual.",
  },
  inventory: {
    title: "Inventory",
    description:
      "Kelola stok kode, akun, credential, reservasi, dan format delivery.",
  },
  orders: {
    title: "Pesanan",
    description: "Pantau pembayaran dan pengiriman pesanan.",
  },
  customers: {
    title: "Pelanggan",
    description: "Orang-orang yang telah membeli produkmu.",
  },
  reviews: {
    title: "Ulasan",
    description:
      "Pantau rating terverifikasi, balas pembeli, dan kelola ulasan produk.",
  },
  coupons: {
    title: "Kupon",
    description: "Buat promo untuk mendorong lebih banyak penjualan.",
  },
  balance: {
    title: "Saldo",
    description: "Lihat pendapatan, biaya, dan saldo tokomu.",
  },
  withdrawals: {
    title: "Penarikan",
    description: "Tarik saldo tersedia ke rekening bankmu.",
  },
  storefront: {
    title: "Storefront",
    description: "Atur tampilan dan identitas toko publikmu.",
  },
  "api-keys": {
    title: "API Keys",
    description: "Hubungkan aplikasi dengan Fersaku API.",
  },
  webhooks: {
    title: "Webhooks",
    description: "Terima event real-time di aplikasi kamu.",
  },
  settings: {
    title: "Settings",
    description: "Kelola profil, bisnis, dan keamanan akun.",
  },
};

export function getSellerSegments(pathname: string) {
  return pathname
    .replace(/^\/dashboard\/?/, "")
    .split("/")
    .filter(Boolean);
}

export function getSellerPageMeta(segments: string[]): SellerPageMeta {
  const section = segments[0] || "overview";
  const child = segments[1];

  if (section === "products" && child === "new")
    return {
      title: "Produk baru",
      description: "Tambahkan karya digital baru ke tokomu.",
    };
  if (section === "products" && child)
    return {
      title: "Edit produk",
      description: `Kelola detail, delivery, harga, dan analitik ${child}.`,
    };
  if (section === "inventory" && child)
    return {
      title: "Detail inventory",
      description:
        "Atur schema credential, import stok, validasi, reservasi, dan delivery.",
    };
  if (section === "orders" && child)
    return {
      title: `Pesanan ${child}`,
      description:
        "Detail pembayaran, customer, delivery, dan timeline pesanan.",
    };
  if (section === "customers" && child)
    return {
      title: "Detail pelanggan",
      description: "Riwayat pembelian, lifetime value, dan catatan pelanggan.",
    };
  if (section === "coupons" && child === "new")
    return {
      title: "Kupon baru",
      description: "Buat kode promo dan atur batas penggunaannya.",
    };
  if (section === "withdrawals" && child === "new")
    return {
      title: "Tarik saldo",
      description: "Ajukan penarikan saldo ke rekening bank terverifikasi.",
    };
  return sellerPageMeta[section] || sellerPageMeta.overview;
}
