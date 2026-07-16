"use client";

import {
  CheckCircle2,
  FileText,
  Gavel,
  LockKeyhole,
  ReceiptText,
  Upload,
} from "lucide-react";
import type { Dispute } from "./data";
import { DataFact, Field, OpsModal } from "./pieces";

export function DisputeCaseDialog({
  selected,
  refunded,
  setRefunded,
  onClose,
  update,
}: {
  selected: Dispute;
  refunded: boolean;
  setRefunded: (value: boolean) => void;
  onClose: () => void;
  update: (status: string, funds?: string) => void;
}) {
  return (
    <OpsModal
      icon={Gavel}
      eyebrow="Buyer protection case"
      title={`${selected.id} - ${selected.order}`}
      onClose={onClose}
      danger
    >
      {refunded ? (
        <div className="rounded-[24px] bg-[#e7f6ec] p-7 text-center text-[#238150]">
          <CheckCircle2 className="mx-auto size-8" />
          <h3 className="mt-4 text-lg font-black">
            Refund issued and ledger reversed.
          </h3>
          <p className="mt-2 text-[9px] leading-5">
            Buyer notification, seller balance debit, provider refund job, and
            immutable dispute event were queued.
          </p>
          <button
            onClick={() => {
              update("Refunded", "Released");
            }}
            className="mt-5 h-10 rounded-xl bg-[#218a52] px-5 text-[8px] font-extrabold text-white"
          >
            Close resolved case
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Buyer", selected.buyer],
              ["Merchant", selected.merchant],
              ["Claim", selected.reason],
              ["Transaction amount", selected.amount],
              ["Seller funds", selected.funds],
              ["Evidence package", `${selected.evidence} files`],
            ].map(([label, value]) => (
              <DataFact key={label} label={label} value={value} />
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              [ReceiptText, "Transaction proof", "QRIS paid + invoice"],
              [Upload, "Buyer evidence", "screen-recording.mp4"],
              [FileText, "Seller response", "Replacement link sent"],
            ].map(([Icon, title, note]) => (
              <div
                key={title as string}
                className="rounded-2xl border border-[#dfe3ec] bg-[#f5f6f9] p-4"
              >
                <Icon className="size-4 text-[#536fdf]" />
                <b className="mt-4 block text-[8px]">{title as string}</b>
                <span className="mt-1 block text-[7px] text-[#7c879d]">
                  {note as string}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[#f0d69e] bg-[#fff8e8] p-4 text-[8px] leading-4 text-[#7c6a45]">
            <LockKeyhole className="mr-2 inline size-3.5" />
            Hold only the disputed amount from pending/available seller funds.
            Never mutate historical paid ledger entries.
          </div>
          <Field label="Resolution note">
            <textarea
              rows={3}
              defaultValue="Review buyer evidence, seller response, delivery logs, and product snapshot before deciding."
              className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px]"
            />
          </Field>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={() => update("Seller response", "Held")}
              className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
            >
              Request seller evidence
            </button>
            <button
              onClick={() => update("Rejected", "Released")}
              className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
            >
              Reject buyer claim
            </button>
            <button
              onClick={() => update("Resolved - replacement", "Released")}
              className="h-10 rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
            >
              Accept replacement
            </button>
            <button
              onClick={() => setRefunded(true)}
              className="h-10 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white"
            >
              Issue refund
            </button>
          </div>
        </>
      )}
    </OpsModal>
  );
}
