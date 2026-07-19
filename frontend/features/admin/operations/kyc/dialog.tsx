"use client";

import { Code2, FileCheck2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  canTransitionKyc,
  kycTransitionRequiresVendor,
  type ApiKycApplicant,
  type KycStatus,
} from "./data";
import { Field, Modal } from "./pieces";
import { ControlDialog } from "@/features/admin/ui";
import {
  useAdminKycDocumentViewMemory,
  useAdminKycReviewEnabled,
  useViewAdminKycDocumentMutation,
} from "./hooks";
import { revokeAdminKycDocumentView } from "./api";

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
  busy = false,
}: {
  applicant: ApiKycApplicant;
  vendor: string;
  onClose: () => void;
  onMove: (status: KycStatus, rejectionReason?: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const canReview = useAdminKycReviewEnabled();
  const [reviewerNote, setReviewerNote] = useState(
    applicant.rejectionReason ?? "",
  );
  const [recentMfaVerified, setRecentMfaVerified] = useState(false);
  const [transition, setTransition] = useState<KycTransition | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const { view, hold, clear: clearDocView } = useAdminKycDocumentViewMemory();
  const viewMutation = useViewAdminKycDocumentMutation();

  const needsReason = reviewerNote.trim().length < 12;
  const adapterConfigured = vendor !== "Provider belum dipilih";
  const canMove = (status: KycStatus) =>
    canReview &&
    !busy &&
    canTransitionKyc(applicant.status, status) &&
    (!kycTransitionRequiresVendor(status) || adapterConfigured);

  const docTiles =
    applicant.documentMeta && applicant.documentMeta.length > 0
      ? applicant.documentMeta.map((d) => ({
          id: d.id,
          name: d.label,
          note: d.status === "READY" ? "Ready for review" : d.status,
          ready: d.status === "READY",
        }))
      : applicant.docs.map((name, i) => ({
          id: `label_${i}`,
          name,
          note: "Metadata only",
          ready: false,
        }));

  useEffect(() => {
    return () => {
      clearDocView();
    };
  }, [applicant.id, clearDocView]);

  const openDocument = async (documentId: string) => {
    if (!canReview || documentId.startsWith("label_")) return;
    const reason = reviewerNote.trim();
    if (reason.length < 12) {
      setDocError("Enter a reviewer note (≥12 chars) before viewing a document.");
      return;
    }
    setDocError(null);
    setViewingDocId(documentId);
    try {
      const result = await viewMutation.mutateAsync({
        caseId: applicant.id,
        documentId,
        reason,
      });
      hold(result);
    } catch {
      setDocError("Document view failed. MFA step-up or permission may be required.");
      clearDocView();
    } finally {
      setViewingDocId(null);
    }
  };

  return (
    <Modal
      title={applicant.store}
      eyebrow={`Live QRIS API application ${applicant.application}`}
      icon={Code2}
      onClose={() => {
        clearDocView();
        onClose();
      }}
    >
      <div className="rounded-2xl border border-[#b9c9f5] bg-[#eef2ff] p-4 text-[8px] leading-4 text-[#53678d]">
        <ShieldCheck className="mr-2 inline size-3.5" /> KYC decision controls
        only production QRIS API access. Storefront, hosted checkout, product
        delivery, balance, and seller payout remain unaffected.
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {docTiles.slice(0, 3).map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={!tile.ready || !canReview || viewMutation.isPending}
            onClick={() => void openDocument(tile.id)}
            className="aspect-[1.2] rounded-2xl border border-[#dfe3ec] bg-[#f5f6f9] p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileCheck2 className="size-5 text-[#53637a]" />
            <b className="mt-8 block text-[8px]">{tile.name}</b>
            <span className="mt-1 block text-[7px] text-[#6f7a8d]">
              {viewingDocId === tile.id ? "Opening…" : tile.note}
            </span>
          </button>
        ))}
      </div>
      {view?.objectUrl && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#dfe3ec] bg-[#0b1020] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived blob URL, no-store */}
          <img
            src={view.objectUrl}
            alt="KYC document (session-only)"
            className="mx-auto max-h-48 object-contain"
            onError={() => {
              // PDF or non-image: revoke and show note
              revokeAdminKycDocumentView(view);
            }}
          />
          <p className="mt-2 text-center text-[7px] text-[#9aa3b5]">
            Server-decrypted view · no-store · auto-clears
          </p>
          <button
            type="button"
            onClick={clearDocView}
            className="mx-auto mt-1 block text-[7px] font-bold text-[#b9c9f5]"
          >
            Close document
          </button>
        </div>
      )}
      {docError && (
        <p role="status" className="mt-2 text-[8px] text-[#bd4e47]">
          {docError}
        </p>
      )}
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
          Live API approval and document view also require recent MFA in
          production.
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
      {!canReview && (
        <p role="status" className="mt-3 text-[8px] text-[#bd4e47]">
          Missing kyc.review permission for transitions and document access.
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
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
          type="button"
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
          type="button"
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
          type="button"
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
          onConfirm={async (reason) => {
            await onMove(transition.status, reason);
            setTransition(null);
          }}
          onClose={() => setTransition(null)}
        />
      )}
    </Modal>
  );
}
