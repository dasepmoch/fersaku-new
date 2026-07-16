"use client";

import { Code2, FileCheck2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  canTransitionKyc,
  kycTransitionRequiresVendor,
  type ApiKycApplicant,
  type KycStatus,
} from "./data";
import { Field, Modal } from "./pieces";
import { ControlDialog } from "@/features/admin/ui";

type KycTransition = {
  status: KycStatus;
  title: string;
  danger?: boolean;
};

export function ApiKycDialog({
  applicant,
  vendor,
  onClose,
  onMove,
}: {
  applicant: ApiKycApplicant;
  vendor: string;
  onClose: () => void;
  onMove: (status: KycStatus, rejectionReason?: string) => void;
}) {
  const [reviewerNote, setReviewerNote] = useState(
    applicant.rejectionReason ?? "",
  );
  const [recentMfaVerified, setRecentMfaVerified] = useState(false);
  const [transition, setTransition] = useState<KycTransition | null>(null);
  const needsReason = reviewerNote.trim().length < 12;
  const adapterConfigured = vendor !== "Provider belum dipilih";
  const canMove = (status: KycStatus) =>
    canTransitionKyc(applicant.status, status) &&
    (!kycTransitionRequiresVendor(status) || adapterConfigured);

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
          ["Submitted", applicant.submitted],
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
          value={reviewerNote}
          onChange={(event) => setReviewerNote(event.target.value)}
          className="w-full resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] outline-none"
        />
        <span className="text-[7px] font-normal text-[#7c879d]">
          A reason of at least 12 characters is required for every transition.
          Live API approval also requires recent MFA in production.
        </span>
      </Field>
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-[#dce1e9] p-3 text-[8px] text-[#65718b]">
        <input
          type="checkbox"
          checked={recentMfaVerified}
          onChange={(event) => setRecentMfaVerified(event.target.checked)}
        />
        Recent MFA re-authentication verified for Live API approval (mock).
      </label>
      {!adapterConfigured && (
        <p role="status" className="mt-3 text-[8px] text-[#9b6a1f]">
          Save a verification adapter before vendor review or approval.
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          disabled={needsReason || !canMove("Vendor check")}
          onClick={() =>
            setTransition({
              status: "Vendor check",
              title: "Send KYC application to vendor check",
            })
          }
          className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send to vendor
        </button>
        <button
          disabled={needsReason || !canMove("Needs clarification")}
          onClick={() =>
            setTransition({
              status: "Needs clarification",
              title: "Request KYC clarification",
            })
          }
          className="h-10 rounded-xl border border-[#e7c86d] bg-[#fff8e8] text-[8px] font-bold text-[#82651f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Request changes
        </button>
        <button
          disabled={needsReason || !canMove("Rejected")}
          onClick={() =>
            setTransition({
              status: "Rejected",
              title: "Reject Live QRIS API application",
              danger: true,
            })
          }
          className="h-10 rounded-xl border border-[#efc0bc] text-[8px] font-bold text-[#bd4e47] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject API
        </button>
        <button
          disabled={needsReason || !canMove("Approved") || !recentMfaVerified}
          onClick={() =>
            setTransition({
              status: "Approved",
              title: "Enable Live QRIS API access",
            })
          }
          className="h-10 rounded-xl bg-[#218a52] text-[8px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enable live API
        </button>
      </div>
      {transition && (
        <ControlDialog
          title={transition.title}
          target={applicant.id}
          initialReason={reviewerNote.trim()}
          danger={transition.danger}
          onConfirm={(reason) => onMove(transition.status, reason)}
          onClose={() => setTransition(null)}
        />
      )}
    </Modal>
  );
}
