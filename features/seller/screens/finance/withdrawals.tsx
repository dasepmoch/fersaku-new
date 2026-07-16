"use client";

import { Eye, LockKeyhole } from "lucide-react";
import {
  useSellerFinanceSummary,
  useSellerWithdrawalLock,
  useSellerWithdrawals,
} from "@/features/finance/hooks";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { rupiah } from "@/shared/format/money";
import { MiniStat } from "@/shared/ui/mini-stat";
import { SectionHead } from "@/shared/ui/section-head";
import { StatusBadge } from "@/shared/ui/status-badge";
import { surfaceCard } from "@/shared/ui/styles";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

export function Withdrawals() {
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
          Security event <code className="font-bold">{lock.reasonCode}</code> -
          Semua percobaan penarikan selama lock dicatat dan diberitahukan ke
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
