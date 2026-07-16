"use client";

import { useState } from "react";
import { Check, Upload, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WebhookRow } from "./data";
import { Field, Modal } from "./pieces";

export function ForceFulfillDialog({
  row,
  onClose,
  onComplete,
}: {
  row: WebhookRow;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [reference, setReference] = useState("DKT-QRP-99281");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const ready =
    reference.trim() && reason.trim().length >= 12 && evidence && confirmed;
  return (
    <Modal
      title="Manual Force-Fulfill"
      eyebrow="High-risk operation"
      icon={Zap}
      onClose={onClose}
      danger
    >
      <div className="rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
        This action marks <b>{row.order}</b> paid, queues digital fulfillment,
        notifies the buyer, and writes an immutable manual-override event.
      </div>
      <div className="mt-5 grid gap-4">
        <Field label="Verified provider reference">
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px] outline-none"
          />
        </Field>
        <Field label="Settlement / mutation evidence">
          <button
            onClick={() => setEvidence(true)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed text-[8px] font-extrabold",
              evidence
                ? "border-[#8cc8a5] bg-[#eff9f2] text-[#277a4b]"
                : "border-[#cfd5df]",
            )}
          >
            {evidence ? (
              <Check className="size-4" />
            ) : (
              <Upload className="size-4" />
            )}
            {evidence
              ? "mutation_DKT_99281.pdf attached"
              : "Attach evidence file (mock)"}
          </button>
        </Field>
        <Field label="Required operational reason">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Explain reconciliation checks and why manual fulfillment is safe..."
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
      </div>
      <div className="mt-6 flex gap-2">
        <button
          onClick={onClose}
          className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
        >
          Cancel
        </button>
        <button
          disabled={!ready}
          onClick={onComplete}
          className="h-10 flex-1 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white disabled:bg-[#b9bfca]"
        >
          Force paid & fulfill
        </button>
      </div>
    </Modal>
  );
}
