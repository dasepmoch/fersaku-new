"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  type LucideIcon,
} from "lucide-react";
import {
  useSellerFinanceSummary,
  useSellerLedger,
} from "@/features/finance/hooks";
import { useSellerStoreId } from "@/shared/seller/current-store";
import { formatLedgerDate } from "@/shared/format/date";
import { formatSignedRupiah, rupiah } from "@/shared/format/money";
import { SectionHead } from "@/shared/ui/section-head";
import { surfaceCard } from "@/shared/ui/styles";
import { FinanceSourceBadge } from "@/shared/finance/source-badge";

const ledgerIcon: Record<string, LucideIcon> = {
  SALE: ArrowDownLeft,
  WITHDRAWAL: Banknote,
  PLATFORM_FEE: ArrowDownLeft,
  PROVIDER_FEE: ArrowDownLeft,
  ADJUSTMENT: ArrowDownLeft,
};

export function Balance() {
  const storeId = useSellerStoreId();
  const { data: summary } = useSellerFinanceSummary(storeId);
  const { data: ledger } = useSellerLedger(storeId);
  if (!summary || !ledger) return null;

  const monthRows = [
    { label: "Penjualan kotor", value: rupiah(summary.monthGrossAmount) },
    {
      label: "Platform fee",
      value: `- ${rupiah(summary.monthPlatformFeeAmount)}`,
      muted: true,
    },
    {
      label: "Payment fee",
      value: `- ${rupiah(summary.monthProviderFeeAmount)}`,
      muted: true,
    },
  ];

  return (
    <>
      <section className="noise shadow-float relative overflow-hidden rounded-[28px] bg-[#173f2c] p-6 text-white sm:p-8">
        <div className="absolute -top-32 -right-24 size-80 rounded-full border border-white/10" />
        <div className="relative grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.14em] text-white/45 uppercase">
              Saldo tersedia
            </p>
            <p className="mt-3 text-4xl font-extrabold tracking-[-.05em] sm:text-5xl">
              {rupiah(summary.availableAmount)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[8px]">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5">
                <FinanceSourceBadge source="STOREFRONT" />
                {rupiah(summary.sources.STOREFRONT.availableAmount)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5">
                <FinanceSourceBadge source="QRIS_API" />
                {rupiah(summary.sources.QRIS_API.availableAmount)}
              </span>
            </div>
            <Link
              href="/dashboard/withdrawals/new"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#d7ff64] px-4 py-3 text-xs font-extrabold text-[#173f2c]"
            >
              Tarik saldo <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="border-white/10 sm:border-l sm:pl-7">
            <p className="text-[10px] text-white/45">Saldo tertunda</p>
            <p className="mt-2 text-xl font-extrabold">
              {rupiah(summary.pendingAmount)}
            </p>
            <p className="mt-2 text-[9px] text-white/35">
              Tersedia dalam 1-2 hari
            </p>
          </div>
          <div className="border-white/10 sm:border-l sm:pl-7">
            <p className="text-[10px] text-white/45">Lifetime revenue</p>
            <p className="mt-2 text-xl font-extrabold">
              {rupiah(summary.lifetimeGrossAmount)}
            </p>
            <p className="mt-2 text-[9px] text-[#d7ff64]">+18,2% bulan ini</p>
          </div>
        </div>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <section className={`${surfaceCard} overflow-hidden`}>
          <SectionHead title="Riwayat saldo" desc="Semua pergerakan dana" />
          <div>
            {ledger.items.map((item) => {
              const Icon = ledgerIcon[item.type] || ArrowDownLeft;
              return (
                <div
                  key={item.id}
                  className="hairline flex items-center gap-3 border-t px-5 py-4"
                >
                  <span
                    className={`grid size-9 place-items-center rounded-xl ${item.direction === "CREDIT" ? "bg-[#e5f5e6] text-[#2d714e]" : "bg-[#ffebe3] text-[#a4563d]"}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-extrabold">
                        {item.description}
                      </p>
                      <FinanceSourceBadge source={item.source} />
                    </div>
                    <p className="mt-1 text-[9px] text-[#87918b]">
                      {formatLedgerDate(item.occurredAt)}
                    </p>
                  </div>
                  <b
                    className={`ml-auto text-xs ${item.direction === "CREDIT" ? "text-[#2d714e]" : ""}`}
                  >
                    {formatSignedRupiah(item.amount, item.direction)}
                  </b>
                </div>
              );
            })}
          </div>
        </section>
        <section className={`${surfaceCard} p-5`}>
          <h3 className="text-sm font-extrabold">Rincian bulan ini</h3>
          <div className="mt-5 grid gap-4">
            {monthRows.map((row) => (
              <div key={row.label} className="flex justify-between text-xs">
                <span className="text-[#6f7b74]">{row.label}</span>
                <b className={row.muted ? "text-[#985841]" : ""}>{row.value}</b>
              </div>
            ))}
          </div>
          <div className="hairline mt-5 flex justify-between border-t pt-5 text-sm font-extrabold">
            <span>Pendapatan bersih</span>
            <span>{rupiah(summary.monthNetAmount)}</span>
          </div>
        </section>
      </div>
    </>
  );
}
