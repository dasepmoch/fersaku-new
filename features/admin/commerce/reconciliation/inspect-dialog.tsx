"use client";

import { Scale } from "lucide-react";
import type { Discrepancy } from "./data";
import { DataFact, Field, OpsModal } from "./pieces";

export function ReconciliationInspectDialog({
  selected,
  onClose,
  resolve,
}: {
  selected: Discrepancy;
  onClose: () => void;
  resolve: () => void;
}) {
  return (
    <OpsModal
      icon={Scale}
      eyebrow="Reconciliation discrepancy"
      title={selected.id}
      onClose={onClose}
      danger
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Provider reference", selected.providerRef],
          ["Order / payout", selected.order],
          ["Provider status", selected.provider],
          ["Internal status", selected.internal],
          ["Amount", selected.amount],
          ["Difference", selected.difference],
        ].map(([label, value]) => (
          <DataFact key={label} label={label} value={value} />
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-[#f5f6f9] p-4">
        <p className="text-[8px] font-extrabold text-[#7c879d] uppercase">
          Suggested resolution
        </p>
        <p className="mt-2 text-[9px] leading-5">
          Verify signature and provider settlement export, then replay the
          idempotent payment/withdrawal state transition. Post any correction
          through an append-only adjustment entry.
        </p>
      </div>
      <Field label="Required reconciliation note">
        <textarea
          rows={3}
          defaultValue="Provider settlement and reference verified. Replay idempotent transition and post suspense correction."
          className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px]"
        />
      </Field>
      <div className="mt-5 flex gap-2">
        <button
          onClick={onClose}
          className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
        >
          Keep open
        </button>
        <button
          onClick={resolve}
          className="h-10 flex-1 rounded-xl bg-[#218a52] text-[8px] font-extrabold text-white"
        >
          Resolve & post audit
        </button>
      </div>
    </OpsModal>
  );
}
