"use client";

import { adminPanel } from "@/features/admin/ui";
import { AlertOctagon, ArrowUpRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { rupiah } from "@/lib/utils";

export type PaymentMismatch = {
  id: string;
  paymentIntentId: string;
  orderId: string;
  merchant: string;
  amount: number;
  provider: "Xendit";
  providerStatus: "PAID";
  localStatus: "Pending";
  age: string;
  attempts: number;
  observedAt: string;
};

/** Mock-first mismatch feed; production will be backed by the callback read model. */
export const demoPaymentMismatches: PaymentMismatch[] = [
  {
    id: "mismatch_01",
    paymentIntentId: "qris_2Yc91p",
    orderId: "FRS-240712-1902",
    merchant: "Asep AI Tools",
    amount: 129_000,
    provider: "Xendit",
    providerStatus: "PAID",
    localStatus: "Pending",
    age: "3m",
    attempts: 4,
    observedAt: "12 Jul 2026, 14:39 WIB",
  },
];

export function PaymentMismatchAlert({
  mismatches = demoPaymentMismatches,
}: {
  mismatches?: PaymentMismatch[];
}) {
  if (!mismatches.length) {
    return (
      <section className={`${adminPanel} mt-4 p-4`}>
        <div className="flex items-center gap-3 text-[#277c4c]">
          <span className="grid size-9 place-items-center rounded-xl bg-[#eaf8ef]">
            <Clock3 className="size-4" />
          </span>
          <div>
            <b className="block text-[9px]">No provider/local mismatches</b>
            <span className="text-[8px] text-[#6d8b78]">
              Xendit callback state is aligned with Fersaku payment state.
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${adminPanel} mt-4 overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-[#f1d0cc] bg-[#fff8f6] p-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ffe7e2] text-[#c9544d]">
          <AlertOctagon className="size-5" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[10px] font-black">
              Provider-paid / local-pending mismatch
            </h3>
            <span className="rounded-full bg-[#ffe7e2] px-2 py-1 text-[7px] font-extrabold text-[#b24f48]">
              {mismatches.length} NEEDS REVIEW
            </span>
          </div>
          <p className="mt-1 text-[8px] leading-4 text-[#8e625d]">
            Xendit confirms payment, but the local order has not advanced. Check
            the signed callback and retry delivery before any manual action.
          </p>
        </div>
        <Link
          href="/admin/webhooks"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#c9544d] px-3 text-[8px] font-extrabold text-white sm:ml-auto"
        >
          Review callbacks <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-[#edf0f4]">
        {mismatches.map((mismatch) => (
          <div
            key={mismatch.id}
            className="grid gap-3 p-4 text-[8px] sm:grid-cols-[1.1fr_.8fr_.8fr_.7fr] sm:items-center"
          >
            <div>
              <b className="block font-mono text-[#536fdf]">
                {mismatch.paymentIntentId}
              </b>
              <span className="mt-1 block text-[#7c879d]">
                {mismatch.merchant} • {mismatch.orderId}
              </span>
            </div>
            <div>
              <span className="block text-[#7c879d]">Amount</span>
              <b>{rupiah(mismatch.amount)}</b>
            </div>
            <div>
              <span className="block text-[#7c879d]">States</span>
              <b className="text-[#b24f48]">
                {mismatch.providerStatus} → {mismatch.localStatus}
              </b>
            </div>
            <div className="sm:text-right">
              <span className="block text-[#7c879d]">Observed</span>
              <b>{mismatch.age} ago</b>
              <span className="mt-1 block text-[#9aa3b3]">
                {mismatch.attempts} attempts
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
