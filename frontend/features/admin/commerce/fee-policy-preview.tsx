"use client";

import { adminPanel } from "@/features/admin/ui";
import {
  ArrowDownToLine,
  Calculator,
  CheckCircle2,
  Percent,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn, rupiah } from "@/lib/utils";
import {
  calculateTransactionFee,
  calculateWithdrawalFee,
  FERSAKU_FEE_POLICY,
} from "@/shared/finance/fee-policy";
import { getDomainSource } from "@/shared/data/domain-source";
import {
  useAdminSystemFees,
  usePreviewAdminSystemFeesMutation,
} from "@/features/admin/operations/emergency/hooks";
import type { FeePreviewView } from "@/features/admin/operations/emergency/data";

type PreviewKind = "transaction" | "withdrawal";

const exampleAmount = 100_000;

/**
 * Read-only commercial policy card. Active fee fields stay read-only;
 * preview is pure (POST …/fees/preview on api) and never persists.
 */
export function FeePolicyPreview({
  merchantName,
  className,
}: {
  merchantName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isMock = getDomainSource("adminRead") === "mock";
  const feesQuery = useAdminSystemFees();
  const fees = feesQuery.data;
  const subject = merchantName ? `${merchantName} follows` : "Fersaku applies";

  const txLabel = fees
    ? `${fees.transactionPercent}% + ${rupiah(fees.transactionFixedIdr)}`
    : isMock
      ? "3% + Rp700"
      : "—";
  const wdLabel = fees
    ? `${fees.withdrawalPercent}% + processing`
    : isMock
      ? "3% + processing"
      : "—";
  const minLabel = fees
    ? rupiah(fees.minimumWithdrawalIdr)
    : isMock
      ? rupiah(FERSAKU_FEE_POLICY.withdrawalMinimumAmount)
      : "—";

  return (
    <>
      <section className={cn(adminPanel, "overflow-hidden", className)}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-11 place-items-center rounded-xl bg-[#edf1ff] text-[#536fdf]">
            <Percent className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-black">Fee policy & preview</h3>
              <span className="rounded-full bg-[#e7f6ec] px-2 py-1 text-[7px] font-extrabold text-[#238150]">
                GLOBAL
              </span>
              {fees?.policyVersion ? (
                <span className="rounded-full bg-[#edf1ff] px-2 py-1 text-[7px] font-extrabold text-[#536fdf]">
                  {fees.policyVersion}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              {subject} the same policy for storefront and QRIS API payments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] px-4 text-[8px] font-extrabold sm:ml-auto"
          >
            <Calculator className="size-3.5" /> Preview calculation
          </button>
        </div>
        <div className="grid gap-px border-t border-[#e5e8ef] bg-[#e5e8ef] sm:grid-cols-3">
          <PolicyCell
            label="Successful transaction"
            value={txLabel}
            note="Storefront & QRIS API"
          />
          <PolicyCell
            label="Withdrawal"
            value={wdLabel}
            note="Xendit provider fee"
          />
          <PolicyCell
            label="Minimum withdrawal"
            value={minLabel}
            note="Before provider charges"
          />
        </div>
      </section>
      {open && <FeePreviewModal onClose={() => setOpen(false)} />}
    </>
  );
}

function PolicyCell({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-white p-4">
      <span className="text-[7px] text-[#7c879d] uppercase">{label}</span>
      <b className="mt-1 block text-[10px]">{value}</b>
      <span className="mt-1 block text-[7px] text-[#9aa3b3]">{note}</span>
    </div>
  );
}

function FeePreviewModal({ onClose }: { onClose: () => void }) {
  const isMock = getDomainSource("adminRead") === "mock";
  const [kind, setKind] = useState<PreviewKind>("transaction");
  const [amount, setAmount] = useState(String(exampleAmount));
  const parsedAmount = Number(amount.replace(/[^0-9]/g, "")) || 0;
  const previewMutation = usePreviewAdminSystemFeesMutation();
  const [serverPreview, setServerPreview] = useState<FeePreviewView | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

  const localTransaction = useMemo(
    () => calculateTransactionFee(parsedAmount),
    [parsedAmount],
  );
  const localWithdrawal = useMemo(
    () => calculateWithdrawalFee(parsedAmount),
    [parsedAmount],
  );

  const runPreview = previewMutation.mutateAsync;

  useEffect(() => {
    if (isMock) {
      queueMicrotask(() => {
        setServerPreview(null);
        setPreviewError(null);
      });
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void runPreview({ kind, amount: parsedAmount })
        .then((view) => {
          if (!cancelled) {
            setServerPreview(view);
            setPreviewError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setServerPreview(null);
            setPreviewError(
              err instanceof Error ? err.message : "Fee preview unavailable",
            );
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isMock, kind, parsedAmount, runPreview]);

  const txRate =
    serverPreview?.kind === "transaction"
      ? undefined
      : FERSAKU_FEE_POLICY.transactionRatePercent;
  const wdRate = FERSAKU_FEE_POLICY.withdrawalRatePercent;

  const transactionRows = isMock
    ? [
        [`Platform fee (${txRate}%)`, rupiah(localTransaction.platformFee)],
        ["Payment processing", rupiah(localTransaction.processingFee)],
        ["Total fee", rupiah(localTransaction.totalFee)],
        ["Seller/API balance", rupiah(localTransaction.netAmount)],
      ]
    : serverPreview && serverPreview.kind === "transaction"
      ? [
          ["Platform fee", rupiah(serverPreview.platformFee)],
          [
            "Payment processing",
            serverPreview.processingFee == null
              ? "—"
              : rupiah(serverPreview.processingFee),
          ],
          [
            "Total fee",
            serverPreview.totalFee == null
              ? "—"
              : rupiah(serverPreview.totalFee),
          ],
          [
            "Seller/API balance",
            serverPreview.netAmount == null
              ? "—"
              : rupiah(serverPreview.netAmount),
          ],
        ]
      : [
          ["Platform fee", "…"],
          ["Payment processing", "…"],
          ["Total fee", "…"],
          ["Seller/API balance", "…"],
        ];

  const withdrawalRows = isMock
    ? [
        [`Platform fee (${wdRate}%)`, rupiah(localWithdrawal.platformFee)],
        ["Xendit processing", "Biaya proses"],
        ["Total fee", "3% + biaya proses"],
        ["Disbursed amount", "Nominal − biaya"],
      ]
    : serverPreview && serverPreview.kind === "withdrawal"
      ? [
          ["Platform fee", rupiah(serverPreview.platformFee)],
          [
            "Xendit processing",
            serverPreview.processingFee == null
              ? "Biaya proses"
              : rupiah(serverPreview.processingFee),
          ],
          [
            "Total fee",
            serverPreview.totalFee == null
              ? "3% + biaya proses"
              : rupiah(serverPreview.totalFee),
          ],
          [
            "Disbursed amount",
            serverPreview.netAmount == null
              ? "Nominal − biaya"
              : rupiah(serverPreview.netAmount),
          ],
        ]
      : [
          ["Platform fee", "…"],
          ["Xendit processing", "…"],
          ["Total fee", "…"],
          ["Disbursed amount", "…"],
        ];

  const rows = kind === "transaction" ? transactionRows : withdrawalRows;
  const belowMinimum =
    kind === "withdrawal" &&
    (isMock
      ? localWithdrawal.belowMinimum
      : Boolean(serverPreview?.belowMinimum));
  const minimumAmount = isMock
    ? localWithdrawal.minimumAmount
    : (serverPreview?.minimumAmount ??
      FERSAKU_FEE_POLICY.withdrawalMinimumAmount);
  const policyNote =
    serverPreview?.policyVersion ??
    (isMock ? "LAUNCH_FEE_POLICY_V1" : "server preview");

  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/75 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fee-preview-title"
        className="my-6 w-full max-w-xl rounded-[26px] bg-white p-6 text-[#131827] shadow-2xl"
      >
        <div className="flex items-start">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#edf1fb] text-[#536fdf]">
            <Calculator className="size-5" />
          </span>
          <div className="ml-4">
            <p className="text-[7px] font-extrabold tracking-[.18em] text-[#7c879d] uppercase">
              Versioned commercial policy · {policyNote}
            </p>
            <h2 id="fee-preview-title" className="mt-1 text-lg font-black">
              Preview fee calculation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fee preview"
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-[8px] font-extrabold">
            Calculation type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as PreviewKind)}
              className="h-11 rounded-xl border border-[#dce1e9] bg-white px-3 text-[10px]"
            >
              <option value="transaction">
                Successful payment — storefront / QRIS API
              </option>
              <option value="withdrawal">Withdrawal to bank</option>
            </select>
          </label>
          <label className="grid gap-2 text-[8px] font-extrabold">
            Gross amount
            <div className="flex h-11 overflow-hidden rounded-xl border border-[#dce1e9]">
              <span className="grid place-items-center bg-[#f5f6f9] px-4 text-[9px]">
                Rp
              </span>
              <input
                inputMode="numeric"
                value={Number(amount || 0).toLocaleString("id-ID")}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/[^0-9]/g, ""))
                }
                className="min-w-0 flex-1 px-3 text-[10px] outline-none"
                aria-label="Gross amount"
              />
            </div>
          </label>
          <div className="rounded-2xl bg-[#f5f6f9] p-4">
            <div className="flex items-center gap-2 text-[8px] font-extrabold text-[#536fdf]">
              {kind === "transaction" ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <ArrowDownToLine className="size-3.5" />
              )}
              {kind === "transaction"
                ? "Same fee for every successful payment source"
                : "Withdrawal eligibility and provider charge"}
            </div>
            <div className="mt-4 grid gap-3">
              {rows.map(([label, value], index) => (
                <div
                  key={label}
                  className={cn(
                    "flex justify-between gap-4 text-[9px]",
                    index === rows.length - 1 &&
                      "border-t border-[#e1e5ed] pt-3 font-extrabold",
                  )}
                >
                  <span className="text-[#7c879d]">{label}</span>
                  <b className="text-right">{value}</b>
                </div>
              ))}
            </div>
          </div>
          {belowMinimum && (
            <p className="rounded-xl border border-[#efc8c4] bg-[#fff4f2] p-3 text-[8px] leading-4 text-[#a34d46]">
              Minimum withdrawal is {rupiah(minimumAmount)}. This request would
              be rejected before Xendit processing.
            </p>
          )}
          {previewError ? (
            <p className="rounded-xl border border-[#efc9c5] bg-[#fff6f5] p-3 text-[8px] text-[#b94c46]">
              {previewError}
            </p>
          ) : null}
          <p className="text-[7px] leading-4 text-[#8a94a7]">
            Provider processing charges are resolved server-side at execution
            time. The browser never decides the ledger amount. Preview never
            publishes policy.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 h-10 w-full rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
        >
          Close preview
        </button>
      </section>
    </div>
  );
}
