"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  Eye,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  useSellerFinanceSummary,
  useSellerLedger,
  useSellerWithdrawalLock,
  useSellerWithdrawals,
} from "@/features/finance/hooks";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { formatLedgerDate } from "@/shared/format/date";
import { formatSignedRupiah, rupiah } from "@/shared/format/money";
import { FieldInput, FormGroup } from "@/shared/ui/form-controls";
import { MiniStat } from "@/shared/ui/mini-stat";
import { SectionHead } from "@/shared/ui/section-head";
import { StatusBadge } from "@/shared/ui/status-badge";
import { surfaceCard } from "@/shared/ui/styles";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const ledgerIcon: Record<string, LucideIcon> = {
  SALE: ArrowDownLeft,
  WITHDRAWAL: Banknote,
  PLATFORM_FEE: ArrowDownLeft,
  PROVIDER_FEE: ArrowDownLeft,
  REFUND: ArrowDownLeft,
  ADJUSTMENT: ArrowDownLeft,
};

function Balance() {
  const { data: summary } = useSellerFinanceSummary(DEMO_STORE_ID);
  const { data: ledger } = useSellerLedger(DEMO_STORE_ID);
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
    {
      label: "Refund",
      value: `- ${rupiah(summary.monthRefundAmount)}`,
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
            <button className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#d7ff64] px-4 py-3 text-xs font-extrabold text-[#173f2c]">
              Tarik saldo <ArrowUpRight className="size-4" />
            </button>
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
                    <p className="text-xs font-extrabold">{item.description}</p>
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

function Withdrawals() {
  const { data: summary } = useSellerFinanceSummary(DEMO_STORE_ID);
  const { data: rows = [] } = useSellerWithdrawals(DEMO_STORE_ID);
  const { data: lock } = useSellerWithdrawalLock(DEMO_STORE_ID);
  const { pageRows, pagination } = useClientPagination(rows);
  if (!summary || !lock) return null;

  return (
    <>
      <section className="mb-4 overflow-hidden rounded-[22px] border border-[#e5c66d] bg-[#fff7dc] shadow-[0_12px_35px_rgba(121,91,24,.08)]">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f4d77f] text-[#6a4e0f]">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <p className="text-xs font-extrabold text-[#58420e]">
              Penarikan terkunci sementara
            </p>
            <p className="mt-1.5 max-w-3xl text-[10px] leading-5 text-[#7c662c]">
              Penarikan terkunci hingga <b>13 Jul 2026, 14:42 WIB</b> demi
              alasan keamanan karena rekening bank tujuan diubah pada 12 Jul
              2026, 14:42 WIB.
            </p>
          </div>
          <div className="rounded-xl border border-[#dfbf61] bg-white/55 px-4 py-3 text-center sm:ml-auto">
            <p className="text-[8px] font-extrabold tracking-[.12em] text-[#8b7130] uppercase">
              Sisa waktu
            </p>
            <b className="mt-1 block text-sm text-[#58420e]">
              {lock.remainingLabel}
            </b>
          </div>
        </div>
        <div className="border-t border-[#e8ce80] bg-[#fff2c8] px-5 py-3 text-[8px] text-[#7c662c] sm:px-6">
          Security event <code className="font-bold">{lock.reasonCode}</code>{" "}
          - Semua percobaan penarikan selama lock dicatat dan diberitahukan ke
          email seller.
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat
          label="Siap ditarik"
          value="Rp18,24jt"
          note="Saldo tersedia"
        />
        <MiniStat
          label="Sedang diproses"
          value="Rp7jt"
          note="Estimasi hari ini"
        />
        <MiniStat
          label="Total ditarik"
          value="Rp42,5jt"
          note="Sepanjang waktu"
        />
      </div>
      <section className={`${surfaceCard} mt-4 overflow-hidden`}>
        <SectionHead
          title="Riwayat penarikan"
          desc="Dana dikirim melalui Xendit Disbursement (mock)"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="bg-[#f3f4ef] text-[9px] tracking-wider text-[#7f8a83] uppercase">
                <th className="px-5 py-3">ID</th>
                <th>Jumlah</th>
                <th>Rekening</th>
                <th>Status</th>
                <th>Tanggal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="hairline border-t text-xs">
                  <td className="px-5 py-4 font-bold">{r.id}</td>
                  <td className="font-extrabold">{rupiah(r.amount)}</td>
                  <td>{r.bankLabel}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="text-[#76827a]">{r.requestedAt}</td>
                  <td>
                    <Eye className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
    </>
  );
}

function WithdrawalForm() {
  const [submitted, setSubmitted] = useState(false);
  const { data: summary } = useSellerFinanceSummary(DEMO_STORE_ID);
  const available = summary?.availableAmount ?? 18_240_500;
  const requestAmount = 5_000_000;

  if (submitted)
    return (
      <div className={`${surfaceCard} mx-auto max-w-xl p-8 text-center`}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#d7ff64]">
          <Check className="size-7" />
        </span>
        <h2 className="font-display mt-5 text-4xl">Penarikan diajukan.</h2>
        <p className="mt-3 text-xs leading-5 text-[#6d7972]">
          {rupiah(requestAmount)} sedang menunggu review. Kamu akan menerima
          update melalui email.
        </p>
        <Link
          href="/dashboard/withdrawals"
          className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#173f2c] px-5 text-[10px] font-extrabold text-white"
        >
          Kembali ke riwayat
        </Link>
      </div>
    );
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className={`${surfaceCard} p-5 sm:p-7`}>
        <div className="mb-6 flex gap-3 rounded-2xl border border-[#e5c66d] bg-[#fff7dc] p-4 text-[#684f13]">
          <LockKeyhole className="mt-0.5 size-5 shrink-0" />
          <div>
            <b className="text-xs">Pengajuan belum dapat diproses</b>
            <p className="mt-1 text-[9px] leading-4">
              Rekening tujuan baru saja diubah. Demi keamanan saldo, form tetap
              dapat ditinjau tetapi tombol pengajuan aktif kembali pada 13 Jul
              2026, 14:42 WIB.
            </p>
          </div>
        </div>
        <FormGroup
          label="Jumlah penarikan"
          desc="Dana akan dikunci selama proses review."
        >
          <FieldInput label="Nominal" value="5000000" prefix="Rp" />
          <div className="mt-3 flex justify-between text-[9px] text-[#748078]">
            <span>Minimum Rp50.000</span>
            <button className="font-extrabold text-[#315d47]">
              Tarik semua {rupiah(available)}
            </button>
          </div>
        </FormGroup>
        <FormGroup
          label="Rekening tujuan"
          desc="Pastikan nama pemilik rekening sama dengan identitas akun."
        >
          <div className="rounded-2xl border-2 border-[#173f2c] bg-[#eff3e9] p-4">
            <div className="flex items-center">
              <span className="grid size-10 place-items-center rounded-xl bg-white font-black text-[#2855a5]">
                BCA
              </span>
              <div className="ml-3">
                <b className="block text-xs">Bank Central Asia • 4821</b>
                <span className="text-[9px] text-[#748078]">ASEP KURNIA</span>
              </div>
              <span className="ml-auto grid size-5 place-items-center rounded-full border-[5px] border-[#173f2c] bg-white" />
            </div>
          </div>
          <button className="mt-3 text-[9px] font-bold text-[#315d47]">
            + Tambah rekening lain
          </button>
        </FormGroup>
        <FormGroup
          label="Konfirmasi keamanan"
          desc="Penarikan memerlukan verifikasi akun."
        >
          <label className="grid gap-2 text-xs font-bold">
            Password akun
            <input
              type="password"
              placeholder="Masukkan password"
              className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none"
            />
          </label>
        </FormGroup>
        <button
          disabled
          onClick={() => setSubmitted(true)}
          className="h-12 w-full cursor-not-allowed rounded-xl bg-[#d9c98f] text-xs font-extrabold text-[#6f5c25]"
        >
          <LockKeyhole className="mr-2 inline size-4" /> Terkunci hingga 13 Jul,
          14:42 WIB
        </button>
      </section>
      <aside>
        <div className={`${surfaceCard} sticky top-28 p-5`}>
          <h3 className="text-xs font-extrabold">Ringkasan</h3>
          <div className="mt-5 grid gap-3 text-[10px]">
            {[
              ["Saldo tersedia", rupiah(available)],
              ["Jumlah ditarik", rupiah(requestAmount)],
              ["Biaya penarikan", "Rp0"],
              ["Sisa saldo", rupiah(available - requestAmount)],
            ].map((x, i) => (
              <div
                key={x[0]}
                className={`flex justify-between ${i === 3 ? "hairline border-t pt-3 font-extrabold" : ""}`}
              >
                <span className="text-[#748078]">{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-[#fff5d8] p-4 text-[9px] leading-4 text-[#75643c]">
            Estimasi dana masuk 1 hari kerja setelah disetujui.
          </div>
        </div>
      </aside>
    </div>
  );
}

export {
  Balance as SellerBalanceScreen,
  Withdrawals as SellerWithdrawalsScreen,
  WithdrawalForm as SellerWithdrawalFormScreen,
};
