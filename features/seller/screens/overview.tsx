"use client";

import {
  CircleDollarSign,
  MoreHorizontal,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { ProductArt } from "@/components/product-art";
import { RevenueChart } from "@/components/revenue-chart";
import { RotatingQuote } from "@/components/rotating-quote";
import { TrafficAnalytics } from "@/features/seller/components/traffic-analytics";
import { useSellerProducts } from "@/features/catalog/hooks";
import { useSellerOrders } from "@/features/orders/hooks";
import { useSellerRevenue } from "@/features/finance/hooks";
import { compactRupiah, rupiah } from "@/lib/utils";
import { useSellerStoreId } from "@/shared/seller/current-store";
import { SectionHead } from "@/shared/ui/section-head";
import { StatusBadge } from "@/shared/ui/status-badge";
import { surfaceCard } from "@/shared/ui/styles";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

type Metric = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  color: string;
};

const metrics: Metric[] = [
  {
    label: "Total pendapatan",
    value: "Rp24,86jt",
    note: "+18,2%",
    icon: CircleDollarSign,
    color: "#d7ff64",
  },
  {
    label: "Pesanan dibayar",
    value: "312",
    note: "+12,4%",
    icon: ShoppingBag,
    color: "#bdf8d0",
  },
  {
    label: "Conversion rate",
    value: "8,4%",
    note: "+1,6%",
    icon: TrendingUp,
    color: "#c9defd",
  },
  {
    label: "Saldo tersedia",
    value: "Rp18,24jt",
    note: "Siap ditarik",
    icon: WalletCards,
    color: "#ffdfd1",
  },
];

function Overview() {
  const storeId = useSellerStoreId();
  const { data: products = [] } = useSellerProducts(storeId);
  const { data: orderPage } = useSellerOrders(storeId);
  const { data: revenue = [] } = useSellerRevenue(storeId);
  const orders = orderPage?.items ?? [];

  return (
    <>
      <RotatingQuote surface="seller" compact className="mb-4" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon, color }) => (
          <div key={label} className={`${surfaceCard} p-5`}>
            <div className="flex items-start justify-between">
              <span
                className="grid size-10 place-items-center rounded-xl"
                style={{ backgroundColor: color }}
              >
                <Icon className="size-4.5" />
              </span>
              <MoreHorizontal className="size-4 text-[#909a94]" />
            </div>
            <p className="mt-5 text-[10px] font-extrabold tracking-[.12em] text-[#7b8780] uppercase">
              {label}
            </p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-2xl font-extrabold tracking-[-.04em]">
                {value}
              </p>
              <span className="rounded-full bg-[#e8f4e7] px-2 py-1 text-[9px] font-extrabold text-[#2e714f]">
                {note}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.8fr]">
        <section className={`${surfaceCard} p-5 sm:p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold">Pendapatan</h2>
              <p className="mt-1 text-[10px] text-[#7b8780]">7 hari terakhir</p>
            </div>
            <select
              aria-label="Rentang pendapatan"
              className="hairline rounded-lg border bg-white px-3 py-2 text-[10px] font-bold"
            >
              <option>7 hari</option>
              <option>30 hari</option>
            </select>
          </div>
          <div className="mt-3">
            <RevenueChart data={revenue} />
          </div>
        </section>
        <section className={`${surfaceCard} overflow-hidden`}>
          <div className="bg-[#173f2c] p-5 text-white">
            <div className="flex justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-white/45 uppercase">
                  Target Juli
                </p>
                <p className="mt-2 text-2xl font-extrabold">
                  Rp32jt <span className="text-xs text-white/35">/ Rp40jt</span>
                </p>
              </div>
              <Sparkles className="size-5 text-[#d7ff64]" />
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-4/5 rounded-full bg-[#d7ff64]" />
            </div>
            <p className="mt-2 text-[9px] text-white/40">
              80% tercapai • 19 hari tersisa
            </p>
          </div>
          <div className="p-5">
            <h3 className="text-xs font-extrabold">Produk terlaris</h3>
            {products.slice(0, 3).map((p) => (
              <div key={p.id} className="mt-4 flex items-center gap-3">
                <ProductArt
                  palette={p.palette}
                  glyph={p.glyph}
                  className="size-10 shrink-0 !rounded-xl"
                />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-extrabold">
                    {p.title}
                  </p>
                  <p className="text-[9px] text-[#7b8780]">{p.sales} terjual</p>
                </div>
                <b className="ml-auto text-[10px]">
                  {compactRupiah(p.price * p.sales)}
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <TrafficAnalytics />
      <section className={`${surfaceCard} mt-4 overflow-hidden`}>
        <SectionHead
          title="Pesanan terbaru"
          desc="5 transaksi terakhir dari tokomu"
          link="Lihat semua"
        />
        <OrderTable orders={orders} compact />
      </section>
    </>
  );
}

function OrderTable({
  orders,
  compact = false,
}: {
  orders: Array<{
    id: string;
    customer: string;
    email: string;
    product: string;
    amount: number;
    status: string;
    date: string;
    avatar: string;
  }>;
  compact?: boolean;
}) {
  const source = compact ? orders.slice(0, 4) : orders;
  const { pageRows, pagination } = useClientPagination(source);
  return (
    <>
      <div
        className="overflow-x-auto"
        role="region"
        tabIndex={0}
        aria-label="Daftar pesanan"
      >
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="bg-[#f3f4ef] text-[9px] font-extrabold tracking-wider text-[#7f8a83] uppercase">
              <th className="px-5 py-3">Pesanan</th>
              <th className="px-5 py-3">Pelanggan</th>
              <th className="px-5 py-3">Produk</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((o) => (
              <tr
                key={o.id}
                className="hairline border-t text-[11px] hover:bg-[#f8f8f4]"
              >
                <td className="px-5 py-4">
                  <b>{o.id}</b>
                  <span className="mt-1 block text-[9px] text-[#8a948e]">
                    {o.date}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-[#e3e8df] text-[9px] font-extrabold">
                      {o.avatar}
                    </span>
                    <div>
                      <b>{o.customer}</b>
                      <span className="block text-[9px] text-[#849087]">
                        {o.email}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 font-semibold">{o.product}</td>
                <td className="px-5 py-4">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-5 py-4 text-right font-extrabold">
                  {rupiah(o.amount)}
                </td>
                <td>
                  <MoreHorizontal className="size-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination {...pagination} />
    </>
  );
}

export { Overview as SellerOverviewScreen };
