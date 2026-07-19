import {
  Bell,
  Check,
  CreditCard,
  KeyRound,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  WalletCards,
} from "lucide-react";

export type Surface = "seller" | "admin" | "buyer";

export const notificationData: Record<
  Surface,
  Array<{
    id: string;
    title: string;
    body: string;
    time: string;
    href: string;
    icon: typeof Bell;
  }>
> = {
  seller: [
    {
      id: "n1",
      title: "Pembayaran baru",
      body: "Nadia membeli AI Prompt Pack • Rp79.000",
      time: "2 menit",
      href: "/dashboard/orders/FRS-240712-1842",
      icon: ShoppingBag,
    },
    {
      id: "n2",
      title: "Stok hampir habis",
      body: "VPN Premium tersisa 7 item",
      time: "18 menit",
      href: "/dashboard/inventory/prod_vpn",
      icon: Sparkles,
    },
    {
      id: "n3",
      title: "Saldo tersedia",
      body: "Rp3.420.000 selesai settlement",
      time: "1 jam",
      href: "/dashboard/balance",
      icon: WalletCards,
    },
  ],
  admin: [
    {
      id: "a1",
      title: "Withdrawal review",
      body: "Rp25.000.000 membutuhkan keputusan",
      time: "4 menit",
      href: "/admin/withdrawals/WD-120724-0088",
      icon: CreditCard,
    },
    {
      id: "a2",
      title: "QRIS API KYC review",
      body: "Merchant baru menunggu verifikasi",
      time: "12 menit",
      href: "/admin/kyc",
      icon: ShieldCheck,
    },
    {
      id: "a3",
      title: "Inventory invalid",
      body: "3 stock items diblokir dari allocation",
      time: "28 menit",
      href: "/admin/inventory",
      icon: KeyRound,
    },
  ],
  buyer: [
    {
      id: "b1",
      title: "Update produk tersedia",
      body: "AI Prompt Pack v3.1 siap diunduh",
      time: "Hari ini",
      href: "/account/purchases/FRS-240712-1842",
      icon: Sparkles,
    },
    {
      id: "b2",
      title: "Pembelian berhasil",
      body: "Canva Pro Team tersedia di koleksimu",
      time: "11 Jun",
      href: "/account/purchases/FRS-220611-0832",
      icon: Check,
    },
  ],
};
