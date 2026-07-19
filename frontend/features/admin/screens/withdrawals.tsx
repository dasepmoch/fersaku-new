"use client";

import {
  adminPanel,
  PanelHead,
  Metric,
  TableToolbar,
  TableHeader,
  AdminStatus,
  ControlDialog,
  RiskBadge,
  Info,
  TransactionSourceBadge,
  TransactionSourceFilter,
  type AdminTransactionSourceFilter,
} from "@/features/admin/ui";

import Link from "next/link";
import {
  AlertOctagon,
  Check,
  CheckCircle2,
  ChevronRight,
  Pause,
  ShieldCheck,
  X,
} from "lucide-react";

import { useRef, useState } from "react";

import { rupiah } from "@/lib/utils";

import {
  canReviewWithdrawal,
  isAdminWithdrawalsReadApi,
  mapAdminWithdrawalFeeDisplay,
  useAdminWithdrawal,
  useAdminWithdrawals,
  useReviewAdminWithdrawalMutation,
  type AdminWithdrawal,
  type WithdrawalReviewTarget,
} from "@/features/admin/data";
import { createIdempotencyKey } from "@/shared/api/idempotency";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { calculateWithdrawalFee } from "@/shared/finance/fee-policy";

type WithdrawalDecision = {
  title: string;
  status: WithdrawalReviewTarget;
  danger?: boolean;
};

function Withdrawals() {
  const isApi = isAdminWithdrawalsReadApi();
  const { data } = useAdminWithdrawals();
  const withdrawalReviews = data ?? [];
  const [sourceFilter, setSourceFilter] =
    useState<AdminTransactionSourceFilter>("ALL");
  const filteredWithdrawals =
    sourceFilter === "ALL"
      ? withdrawalReviews
      : withdrawalReviews.filter(
          (withdrawal) => withdrawal.source === sourceFilter,
        );
  const { pageRows, pagination } = useClientPagination(filteredWithdrawals);

  const awaiting = filteredWithdrawals.filter(
    (w) => w.status === "Pending" || w.status === "On hold",
  );
  const processing = filteredWithdrawals.filter(
    (w) => w.status === "Processing",
  );
  const completed = filteredWithdrawals.filter(
    (w) => w.status === "Completed",
  );
  const failed = filteredWithdrawals.filter(
    (w) => w.status === "Failed" || w.status === "Rejected",
  );
  const sumAmount = (rows: AdminWithdrawal[]) =>
    rows.reduce((acc, w) => acc + w.amount, 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        {isApi ? (
          <>
            <Metric
              label="Awaiting review"
              value={String(awaiting.length)}
              note={
                awaiting.length
                  ? `${rupiah(sumAmount(awaiting))} total`
                  : "Queue empty"
              }
              tone="warning"
            />
            <Metric
              label="Processing"
              value={
                processing.length ? rupiah(sumAmount(processing)) : "Rp0"
              }
              note={
                processing.length
                  ? `${processing.length} payouts`
                  : "Via Xendit"
              }
            />
            <Metric
              label="Completed today"
              value={completed.length ? rupiah(sumAmount(completed)) : "Rp0"}
              note={
                completed.length
                  ? `${completed.length} payouts`
                  : "No completions in page"
              }
            />
            <Metric
              label="Failed"
              value={String(failed.length)}
              note={
                failed.length
                  ? `${rupiah(sumAmount(failed))} released`
                  : "None on page"
              }
              tone="danger"
            />
          </>
        ) : (
          <>
            <Metric
              label="Awaiting review"
              value="9"
              note="Rp44,2jt total"
              tone="warning"
            />
            <Metric label="Processing" value="Rp18,5jt" note="Via Xendit" />
            <Metric
              label="Completed today"
              value="Rp92,4jt"
              note="32 payouts"
            />
            <Metric
              label="Failed"
              value="2"
              note="Rp4,8jt released"
              tone="danger"
            />
          </>
        )}
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <TableToolbar placeholder="Search withdrawal, merchant, bank account...">
          <TransactionSourceFilter
            value={sourceFilter}
            onChange={setSourceFilter}
            includeMixed
          />
        </TableToolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <TableHeader
              labels={[
                "Withdrawal",
                "Merchant",
                "Source",
                "Amount",
                "Destination",
                "Risk",
                "Status",
                "Requested",
                "",
              ]}
            />
            <tbody>
              {pageRows.map((w) => (
                <tr key={w.id} className="border-t border-[#e8eaf0] text-[9px]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/withdrawals/${w.id}`}
                      className="font-mono font-bold text-[#4c6fe5]"
                    >
                      {w.id}
                    </Link>
                  </td>
                  <td>
                    <b className="block">{w.merchant}</b>
                    <span className="text-[8px] text-[#8993a6]">{w.owner}</span>
                  </td>
                  <td>
                    <TransactionSourceBadge source={w.source} />
                  </td>
                  <td className="font-extrabold">{rupiah(w.amount)}</td>
                  <td>
                    <b className="block">{w.bank}</b>
                    <span className="text-[8px] text-[#8993a6]">
                      {w.account}
                    </span>
                  </td>
                  <td>
                    <RiskBadge risk={w.risk} />
                  </td>
                  <td>
                    <AdminStatus status={w.status} />
                  </td>
                  <td>{w.requested}</td>
                  <td>
                    <ChevronRight className="size-4" />
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
function WithdrawalDetail({ id }: { id: string }) {
  const isReadApi = isAdminWithdrawalsReadApi();
  const { data: w } = useAdminWithdrawal(id);
  const reviewMutation = useReviewAdminWithdrawalMutation();
  const [action, setAction] = useState<WithdrawalDecision | null>(null);
  const [reviewStatus, setReviewStatus] = useState<
    AdminWithdrawal["status"] | null
  >(null);
  const idemRef = useRef<string | null>(null);
  if (!w) return null;
  const currentStatus = reviewStatus ?? w.status;
  // API: never recompute fees. Mock: fixture chrome keeps policy estimate for visual parity.
  const fee = isReadApi
    ? mapAdminWithdrawalFeeDisplay(w)
    : (() => {
        const c = calculateWithdrawalFee(w.amount, w.providerProcessingFee);
        return {
          platformFee: c.platformFee,
          processingFee: c.processingFee,
          netAmount: c.netAmount,
        };
      })();
  const canApprove =
    canReviewWithdrawal(currentStatus, "Processing") &&
    w.providerFeeStatus === "VERIFIED" &&
    w.providerProcessingFee !== null;
  const canHold = canReviewWithdrawal(currentStatus, "On hold");
  const canReject = canReviewWithdrawal(currentStatus, "Rejected");
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className={`${adminPanel} p-6`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold text-[#5b7cfa]">
                {w.id}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-.04em]">
                {rupiah(w.amount)}
              </h2>
              <p className="mt-1 text-[10px] text-[#7d879b]">
                Requested by {w.merchant} • {w.requested}
              </p>
              <div className="mt-3">
                <TransactionSourceBadge source={w.source} />
              </div>
            </div>
            <AdminStatus status={currentStatus} />
          </div>
          <div className="mt-7 rounded-2xl border border-[#e1e5ed] bg-[#f8f9fb] p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Info
                title="Destination bank"
                rows={[
                  ["Bank", w.bank],
                  ["Account holder", w.account],
                  ["Verification", "Name matched"],
                  ["Saved since", isReadApi ? "—" : "21 Apr 2026"],
                ]}
              />
              <Info
                title="Balance snapshot"
                rows={[
                  [
                    "Available before",
                    isReadApi ? "—" : rupiah(w.amount + 6240500),
                  ],
                  ["Amount debited", rupiah(w.amount)],
                  [
                    "Platform fee (3%)",
                    fee.platformFee === null
                      ? "Server fee snapshot"
                      : rupiah(fee.platformFee),
                  ],
                  [
                    "Xendit processing",
                    fee.processingFee === null
                      ? "Awaiting verified quote"
                      : rupiah(fee.processingFee),
                  ],
                  [
                    "Provider fee evidence",
                    w.providerFeeReference ?? "Unavailable",
                  ],
                  [
                    "Net to bank",
                    fee.netAmount === null
                      ? "Pending provider quote"
                      : rupiah(fee.netAmount),
                  ],
                  ["Locked amount", rupiah(w.amount)],
                  ["Available after", isReadApi ? "—" : rupiah(6240500)],
                ]}
              />
            </div>
          </div>
          <div className="mt-6">
            <h3 className="text-[10px] font-black">Automated checks</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ["Bank name matched", true],
                ["Balance sufficient", true],
                ["Recent MFA verified", true],
                [
                  "Provider fee snapshot verified",
                  w.providerFeeStatus === "VERIFIED" ||
                    w.providerFeeStatus === "POSTED",
                ],
                ["No duplicate payout request", w.risk === "Low"],
                ["Account age > 30 days", true],
                ["No sanctions match", true],
              ].map(([label, ok]) => (
                <div
                  key={label as string}
                  className={`flex items-center gap-2 rounded-xl p-3 text-[9px] font-bold ${ok ? "bg-[#eef8f2] text-[#2a7d4e]" : "bg-[#fff2ef] text-[#c4554d]"}`}
                >
                  {ok ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <AlertOctagon className="size-3.5" />
                  )}
                  {label as string}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-7 flex flex-col gap-2 border-t border-[#e3e6ed] pt-6 sm:flex-row">
            <button
              disabled={!canApprove}
              onClick={() => {
                if (!canApprove) return;
                setAction({
                  title: "Approve withdrawal",
                  status: "Processing",
                });
              }}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1d8b50] text-[10px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Check className="size-4" /> Approve & disburse
            </button>
            <button
              disabled={!canHold}
              onClick={() => {
                if (!canHold) return;
                setAction({
                  title: "Place withdrawal on hold",
                  status: "On hold",
                });
              }}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#eccd8b] bg-[#fff8e9] text-[10px] font-extrabold text-[#9a6b1d] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Pause className="size-4" /> Place on hold
            </button>
            <button
              disabled={!canReject}
              onClick={() => {
                if (!canReject) return;
                setAction({
                  title: "Reject withdrawal",
                  status: "Rejected",
                  danger: true,
                });
              }}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#efc5c1] bg-[#fff5f4] text-[10px] font-extrabold text-[#c6534c] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <X className="size-4" /> Reject
            </button>
          </div>
        </section>
        <section className={`${adminPanel} overflow-hidden`}>
          <PanelHead
            title="Review context"
            desc="Signals supporting this decision"
          />
          <div className="p-5">
            <div className="rounded-2xl bg-[#edf8f2] p-4">
              <div className="flex items-center gap-2 text-[#287e4d]">
                <ShieldCheck className="size-4" />
                <b className="text-[10px]">Operational checks passed</b>
              </div>
              <p className="mt-2 text-[8px] leading-4 text-[#5f7969]">
                Merchant has stable payment volume, verified bank ownership, and
                no recent account changes.
              </p>
            </div>
            <div className="mt-5 grid gap-4">
              {[
                ["Merchant lifetime", "116 days"],
                ["Paid volume", "Rp82.640.000"],
                ["Previous payouts", "8 completed"],
                ["Duplicate payout attempts", "None"],
                ["Last bank change", "Never"],
                ["Admin notes", "No notes"],
              ].map((x) => (
                <div
                  key={x[0]}
                  className="flex justify-between border-b border-[#edf0f4] pb-3 text-[9px]"
                >
                  <span className="text-[#7d879b]">{x[0]}</span>
                  <b>{x[1]}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      {action && (
        <ControlDialog
          title={action.title}
          target={w.id}
          onClose={() => {
            setAction(null);
            idemRef.current = null;
          }}
          danger={action.danger}
          requiresRecentMfa
          auditHandledExternally
          onConfirm={async (reason) => {
            if (!canReviewWithdrawal(currentStatus, action.status)) {
              throw new Error("Withdrawal transition is no longer allowed.");
            }
            if (
              action.status === "Processing" &&
              (w.providerFeeStatus !== "VERIFIED" ||
                w.providerProcessingFee === null)
            ) {
              throw new Error("A verified provider fee quote is required.");
            }
            if (!idemRef.current) {
              idemRef.current = createIdempotencyKey();
            }
            const result = await reviewMutation.mutateAsync({
              withdrawalId: w.id,
              target: action.status,
              reason,
              currentStatus,
              providerFeeStatus: w.providerFeeStatus,
              providerProcessingFee: w.providerProcessingFee,
              idempotencyKey: idemRef.current,
            });
            // Display status only from server mapping — never invent money.
            setReviewStatus(
              result.displayStatus as AdminWithdrawal["status"],
            );
          }}
        />
      )}
    </>
  );
}

export {
  Withdrawals as AdminWithdrawalsScreen,
  WithdrawalDetail as AdminWithdrawalDetailScreen,
};
