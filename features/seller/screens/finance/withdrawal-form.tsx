"use client";

import Link from "next/link";
import { Check, LockKeyhole } from "lucide-react";
import { useState } from "react";
import {
  useCreateSellerWithdrawalMutation,
  useSellerFinanceSummary,
  useSellerWithdrawalLock,
  useSellerWithdrawalQuoteMutation,
} from "@/features/finance/hooks";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { rupiah } from "@/shared/format/money";
import { FieldInput, FormGroup } from "@/shared/ui/form-controls";
import { surfaceCard } from "@/shared/ui/styles";
import { calculateWithdrawalFee } from "@/shared/finance/fee-policy";
import { allocateWithdrawalSources } from "@/shared/finance/source-allocation";
import {
  canRequestSellerWithdrawal,
  isSellerWithdrawalLockActive,
} from "@/features/finance/withdrawal-policy";
import type { SellerWithdrawal } from "@/features/finance/contracts";

export function WithdrawalForm() {
  const [submitted, setSubmitted] = useState<SellerWithdrawal | null>(null);
  const [amountInput, setAmountInput] = useState("5000000");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { data: summary } = useSellerFinanceSummary(DEMO_STORE_ID);
  const { data: lock } = useSellerWithdrawalLock(DEMO_STORE_ID);
  const quoteMutation = useSellerWithdrawalQuoteMutation();
  const createMutation = useCreateSellerWithdrawalMutation();
  if (!summary || !lock) return null;
  const available = summary.availableAmount;
  const requestAmount = Number(amountInput) || 0;
  const withdrawalFee = calculateWithdrawalFee(requestAmount);
  const sourceAllocation = allocateWithdrawalSources(requestAmount, {
    storefrontAmount: summary.sources.STOREFRONT.availableAmount,
    qrisApiAmount: summary.sources.QRIS_API.availableAmount,
  });
  const quote =
    quoteMutation.data?.amount === requestAmount ? quoteMutation.data : null;
  const canRequest = canRequestSellerWithdrawal({
    amount: requestAmount,
    availableAmount: available,
    lock,
  });
  const lockActive = isSellerWithdrawalLockActive(lock);
  const submitDisabled =
    !canRequest ||
    quoteMutation.isPending ||
    createMutation.isPending ||
    Boolean(quote && password.trim().length < 8);
  const sourceLabel =
    sourceAllocation.source === "MIXED"
      ? `Storefront ${rupiah(sourceAllocation.storefrontAmount)} + QRIS API ${rupiah(sourceAllocation.qrisApiAmount)}`
      : sourceAllocation.source === "QRIS_API"
        ? `QRIS API • ${rupiah(sourceAllocation.qrisApiAmount)}`
        : `Storefront • ${rupiah(sourceAllocation.storefrontAmount)}`;

  const handlePrimaryAction = async () => {
    if (!canRequest) return;
    setError("");
    try {
      if (!quote) {
        await quoteMutation.mutateAsync({
          storeId: DEMO_STORE_ID,
          bankAccountId: "bank_bca_4821",
          amount: requestAmount,
        });
        return;
      }
      if (password.trim().length < 8) return;
      const withdrawal = await createMutation.mutateAsync({
        storeId: DEMO_STORE_ID,
        quoteId: quote.id,
        reauthProof: "mock-password-reauth",
        idempotencyKey: `seller-withdrawal:${DEMO_STORE_ID}:${quote.id}:${Date.now()}`,
      });
      setSubmitted(withdrawal);
    } catch {
      setError(
        quote
          ? "Pengajuan gagal. Quote tidak dipakai dan saldo tidak berubah."
          : "Biaya proses Xendit belum dapat diverifikasi. Coba lagi.",
      );
    }
  };

  if (submitted)
    return (
      <div className={`${surfaceCard} mx-auto max-w-xl p-8 text-center`}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#d7ff64]">
          <Check className="size-7" />
        </span>
        <h2 className="font-display mt-5 text-4xl">Penarikan diajukan.</h2>
        <p className="mt-3 text-xs leading-5 text-[#6d7972]">
          {rupiah(submitted.amount)} sedang menunggu review. Kamu akan menerima
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
        {lockActive && (
          <div className="mb-6 flex gap-3 rounded-2xl border border-[#e5c66d] bg-[#fff7dc] p-4 text-[#684f13]">
            <LockKeyhole className="mt-0.5 size-5 shrink-0" />
            <div>
              <b className="text-xs">Pengajuan belum dapat diproses</b>
              <p className="mt-1 text-[9px] leading-4">
                Rekening tujuan baru saja diubah. Demi keamanan saldo, penarikan
                dibuka kembali setelah periode lock dari server berakhir.
              </p>
            </div>
          </div>
        )}
        <FormGroup
          label="Jumlah penarikan"
          desc="Dana akan dikunci selama proses review."
        >
          <FieldInput
            label="Nominal"
            value={amountInput}
            prefix="Rp"
            inputMode="numeric"
            onChange={(value) => {
              setAmountInput(value.replace(/\D/g, ""));
              quoteMutation.reset();
              setError("");
            }}
          />
          <div className="mt-3 flex justify-between text-[9px] text-[#748078]">
            <span>Minimum Rp50.000</span>
            <button
              type="button"
              onClick={() => {
                setAmountInput(String(available));
                quoteMutation.reset();
                setError("");
              }}
              className="font-extrabold text-[#315d47]"
            >
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
          <Link
            href="/dashboard/settings"
            className="mt-3 inline-flex text-[9px] font-bold text-[#315d47]"
          >
            + Tambah rekening lain
          </Link>
        </FormGroup>
        <FormGroup
          label="Konfirmasi keamanan"
          desc="Penarikan memerlukan verifikasi akun."
        >
          <label className="grid gap-2 text-xs font-bold">
            Password akun
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password"
              className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none"
            />
          </label>
        </FormGroup>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-[#efc8c4] bg-[#fff4f2] p-3 text-[9px] text-[#a34d46]"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={submitDisabled}
          onClick={() => void handlePrimaryAction()}
          className="h-12 w-full rounded-xl bg-[#173f2c] text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#d9c98f] disabled:text-[#6f5c25]"
        >
          {lockActive
            ? "Penarikan terkunci sementara"
            : quoteMutation.isPending
              ? "Memverifikasi biaya Xendit..."
              : createMutation.isPending
                ? "Mengajukan penarikan..."
                : quote
                  ? "Ajukan penarikan"
                  : "Verifikasi biaya Xendit"}
        </button>
      </section>
      <aside>
        <div className={`${surfaceCard} sticky top-28 p-5`}>
          <h3 className="text-xs font-extrabold">Ringkasan</h3>
          <div className="mt-5 grid gap-3 text-[10px]">
            {[
              ["Saldo tersedia", rupiah(available)],
              ["Jumlah ditarik", rupiah(requestAmount)],
              ["Platform fee (3%)", rupiah(withdrawalFee.platformFee)],
              [
                "Biaya proses Xendit",
                quote
                  ? `${rupiah(quote.providerProcessingFee)} • verified`
                  : "Belum dikonfirmasi",
              ],
              [
                "Dana diterima",
                quote ? rupiah(quote.netAmount) : "Menunggu quote",
              ],
              ["Sumber saldo", sourceLabel],
              ["Sisa saldo", rupiah(available - requestAmount)],
            ].map((x, i) => (
              <div
                key={x[0]}
                className={`flex justify-between gap-4 ${i === 6 ? "hairline border-t pt-3 font-extrabold" : ""}`}
              >
                <span className="text-[#748078]">{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-[#fff5d8] p-4 text-[9px] leading-4 text-[#75643c]">
            Estimasi dana masuk 1 hari kerja setelah disetujui. Biaya proses
            Xendit dikonfirmasi server sebelum penarikan dijalankan.
          </div>
        </div>
      </aside>
    </div>
  );
}
