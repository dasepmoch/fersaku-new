"use client";

import {
  AlertTriangle,
  Check,
  Code2,
  LockKeyhole,
  Store,
  X,
} from "lucide-react";
import { useState } from "react";

type AccessTarget = "merchant" | "api";

export function MerchantAccessDialog({
  merchant,
  target,
  currentStatus,
  nextStatus,
  onClose,
  onConfirm,
}: {
  merchant: string;
  target: AccessTarget;
  currentStatus: string;
  nextStatus: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const isSuspending = nextStatus === "Suspended";
  const api = target === "api";
  const canConfirm = reason.trim().length >= 12 && confirmed;
  const Icon = api ? Code2 : Store;
  const title = isSuspending
    ? `Suspend ${api ? "QRIS API access" : "merchant"}`
    : `Restore ${api ? "QRIS API access" : "merchant"}`;

  return (
    <div className="fixed inset-0 z-[180] grid place-items-center bg-[#080d1b]/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="merchant-access-dialog-title"
        className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start">
          <span
            className={`grid size-11 place-items-center rounded-xl ${isSuspending ? "bg-[#fff0ee] text-[#c9544d]" : "bg-[#edf1ff] text-[#5b7cfa]"}`}
          >
            {isSuspending ? (
              <AlertTriangle className="size-5" />
            ) : (
              <Icon className="size-5" />
            )}
          </span>
          <button
            onClick={onClose}
            aria-label="Close access dialog"
            className="ml-auto grid size-8 place-items-center rounded-lg hover:bg-[#f5f6f9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-5 text-[7px] font-extrabold tracking-[.16em] text-[#7c879d] uppercase">
          {api ? "Production QRIS API control" : "Merchant account control"}
        </p>
        <h3
          id="merchant-access-dialog-title"
          className="mt-1 text-lg font-black tracking-[-.03em]"
        >
          {title}
        </h3>
        <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
          {isSuspending
            ? `${merchant} will immediately lose ${api ? "production QRIS API credentials" : "access to the seller workspace"}. Existing storefront orders and settled balance remain intact.`
            : `${merchant} will regain ${api ? "production QRIS API" : "seller workspace"} access. Credentials are not rotated by this action.`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f5f6f9] p-3 text-[8px]">
          <div>
            <span className="text-[#7c879d]">Current status</span>
            <b className="mt-1 block">{currentStatus}</b>
          </div>
          <div>
            <span className="text-[#7c879d]">After confirmation</span>
            <b className="mt-1 block">{nextStatus}</b>
          </div>
        </div>
        <label className="mt-5 grid gap-2 text-[9px] font-extrabold">
          Required reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Ticket, KYC decision, or operational context..."
            className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none focus:border-[#5b7cfa]"
          />
          <span className="text-[7px] font-normal text-[#8993a6]">
            Use at least 12 characters so the action is auditable.
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-[8px] leading-4 text-[#737e93]">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          I reviewed the current account state and understand the impact of this
          access change.
        </label>
        <div className="mt-6 rounded-xl bg-[#fff8e9] p-3 text-[8px] leading-4 text-[#806f4f]">
          <LockKeyhole className="mr-1.5 inline size-3.5" /> This operation is
          recorded in the immutable admin audit trail.
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
            className={`h-10 flex-1 rounded-xl text-[9px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#9aa2b2] ${isSuspending ? "bg-[#ce544d]" : "bg-[#11182a]"}`}
          >
            <Check className="mr-1 inline size-3.5" /> Confirm
          </button>
        </div>
      </section>
    </div>
  );
}
