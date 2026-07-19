"use client";

import { useRef, useState } from "react";
import { Check, ShieldCheck, Zap } from "lucide-react";
import { rupiah } from "@/lib/utils";
import type { ProviderCallbackRow } from "./data";
import { Field, Modal } from "./pieces";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";
import { forceFulfillAdminOrder } from "@/features/admin/data/fulfillment-commands";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { isAdminWebhooksWriteApi } from "./api";

export function ForceFulfillDialog({
  row,
  onClose,
  onComplete,
}: {
  row: ProviderCallbackRow;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [recentMfaVerified, setRecentMfaVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const idemRef = useRef<string | null>(null);
  const isApi = isAdminWebhooksWriteApi();
  const evidence = row.fulfillmentEvidence;
  const evidenceBound = Boolean(
    evidence &&
    evidence.status === "VERIFIED" &&
    evidence.providerReference === row.providerReference &&
    evidence.merchantOrderId === row.order &&
    evidence.amount === row.amount,
  );
  const ready =
    reason.trim().length >= 12 &&
    evidenceBound &&
    confirmed &&
    recentMfaVerified &&
    !submitting;
  return (
    <Modal
      title="Manual Force-Fulfill"
      eyebrow="High-risk operation"
      icon={Zap}
      onClose={onClose}
      danger
    >
      <div className="rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
        This action replays digital fulfillment for provider-verified paid order{" "}
        <b>{row.order}</b>, notifies the buyer, and writes an immutable
        manual-override event. It never changes payment or ledger state.
      </div>
      <div className="mt-5 grid gap-4">
        <Field label="Verified provider reference">
          <input
            value={row.providerReference}
            readOnly
            className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px] outline-none"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Verified callback amount">
            <input
              value={rupiah(row.amount)}
              readOnly
              className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px] outline-none"
            />
          </Field>
          <Field label="Bound settlement evidence">
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#8cc8a5] bg-[#eff9f2] px-3 text-[8px] font-extrabold text-[#277a4b]">
              {evidenceBound ? (
                <Check className="size-4" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {evidenceBound && evidence
                ? evidence.fileName
                : "No verified bound evidence"}
            </div>
          </Field>
        </div>
        <Field label="Required operational reason">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Explain callback checks and why manual fulfillment is safe..."
            className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] outline-none"
          />
        </Field>
        <label className="flex gap-3 rounded-xl bg-[#f5f6f9] p-4 text-[8px] leading-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            I compared amount, merchant order ID, provider reference, signature,
            and settlement evidence. I understand this cannot be silently
            undone.
          </span>
        </label>
        <label className="flex gap-3 rounded-xl bg-[#eef2ff] p-4 text-[8px] leading-4 text-[#53678d]">
          <input
            type="checkbox"
            checked={recentMfaVerified}
            onChange={(event) => setRecentMfaVerified(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Recent MFA re-authentication is verified for this manual fulfillment
            override{isApi ? "" : " (mock)"}.
          </span>
        </label>
      </div>
      {error ? <p className="mt-3 text-[8px] text-[#c9544d]">{error}</p> : null}
      <div className="mt-6 flex gap-2">
        <button
          onClick={onClose}
          className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
        >
          Cancel
        </button>
        <button
          disabled={!ready}
          onClick={async () => {
            if (!ready || !evidence) return;
            const trimmed = reason.trim();
            setSubmitting(true);
            setError("");
            try {
              if (isApi) {
                if (!idemRef.current) {
                  idemRef.current = createIdempotencyKey();
                }
                await forceFulfillAdminOrder({
                  orderId: row.order,
                  reason: trimmed,
                  idempotencyKey: idemRef.current,
                });
                idemRef.current = null;
              } else {
                appendClientAuditEvent({
                  actor: "admin@fersaku.id",
                  action: "fulfillment.force_replay",
                  target: row.order,
                  ip: "mock-admin-session",
                  result: "Success",
                  context: JSON.stringify({
                    callbackId: row.id,
                    providerReference: row.providerReference,
                    amount: row.amount,
                    evidenceId: evidence.id,
                    evidenceSha256: evidence.sha256,
                    reason: trimmed,
                  }),
                });
              }
              onComplete();
            } catch {
              setError("Force-fulfill failed. No local state was changed.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="h-10 flex-1 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white disabled:bg-[#b9bfca]"
        >
          Queue verified fulfillment
        </button>
      </div>
    </Modal>
  );
}
