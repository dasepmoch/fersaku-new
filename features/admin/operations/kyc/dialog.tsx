"use client";

import { Code2, FileCheck2, ShieldCheck } from "lucide-react";
import type { ApiKycApplicant } from "./data";
import { Field, Modal } from "./pieces";

export function ApiKycDialog({
  applicant,
  vendor,
  onClose,
  onMove,
}: {
  applicant: ApiKycApplicant;
  vendor: string;
  onClose: () => void;
  onMove: (status: string) => void;
}) {
  return (
    <Modal
      title={applicant.store}
      eyebrow={`Live QRIS API application ${applicant.application}`}
      icon={Code2}
      onClose={onClose}
    >
      <div className="rounded-2xl border border-[#b9c9f5] bg-[#eef2ff] p-4 text-[8px] leading-4 text-[#53678d]">
        <ShieldCheck className="mr-2 inline size-3.5" /> KYC decision controls
        only production QRIS API access. Storefront, hosted checkout, product
        delivery, balance, and seller payout remain unaffected.
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["KTP front", "OCR pending"],
          ["Selfie / liveness", "Vendor check"],
          ["NPWP", "Format valid"],
        ].map(([name, note]) => (
          <div
            key={name}
            className="aspect-[1.2] rounded-2xl border border-[#dfe3ec] bg-[#f5f6f9] p-4"
          >
            <FileCheck2 className="size-5 text-[#53637a]" />
            <b className="mt-8 block text-[8px]">{name}</b>
            <span className="mt-1 block text-[7px] text-[#6f7a8d]">{note}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["Applicant", applicant.owner],
          ["Requested access", "Live QRIS payment API"],
          ["Use case", applicant.usage],
          ["Verification adapter", vendor],
          ["Risk tier", applicant.risk],
          ["Sandbox access", "Active - no KYC required"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#f5f6f9] p-3">
            <span className="text-[7px] text-[#7c879d]">{label}</span>
            <b className="mt-1 block text-[8px]">{value}</b>
          </div>
        ))}
      </div>
      <Field label="Reviewer note">
        <textarea
          rows={3}
          defaultValue="Review identity package and intended API use before enabling production credentials."
          className="w-full resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] outline-none"
        />
      </Field>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          onClick={() => onMove("Vendor check")}
          className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
        >
          Send to vendor
        </button>
        <button
          onClick={() => onMove("Needs clarification")}
          className="h-10 rounded-xl border border-[#e7c86d] bg-[#fff8e8] text-[8px] font-bold text-[#82651f]"
        >
          Request changes
        </button>
        <button
          onClick={() => onMove("Rejected")}
          className="h-10 rounded-xl border border-[#efc0bc] text-[8px] font-bold text-[#bd4e47]"
        >
          Reject API
        </button>
        <button
          onClick={() => onMove("Approved")}
          className="h-10 rounded-xl bg-[#218a52] text-[8px] font-extrabold text-white"
        >
          Enable live API
        </button>
      </div>
    </Modal>
  );
}
