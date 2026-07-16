"use client";

import { AlertTriangle, Check, LockKeyhole, X } from "lucide-react";
import { useState } from "react";
import { appendMockAuditEvent } from "@/features/admin/data/mock-audit";

export function ControlDialog({
  title,
  onClose,
  danger = false,
  target = "admin-console",
  onConfirm,
  auditHandledExternally = false,
  initialReason = "",
  requiresRecentMfa = false,
}: {
  title: string;
  onClose: () => void;
  danger?: boolean;
  target?: string;
  onConfirm: (reason: string) => void | Promise<void>;
  auditHandledExternally?: boolean;
  initialReason?: string;
  requiresRecentMfa?: boolean;
}) {
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState(initialReason);
  const [confirmed, setConfirmed] = useState(false);
  const [recentMfaConfirmed, setRecentMfaConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canConfirm =
    reason.trim().length >= 12 &&
    confirmed &&
    (!requiresRecentMfa || recentMfaConfirmed) &&
    !submitting;
  const recordAction = async () => {
    if (!canConfirm) return;
    const auditReason = reason.trim();
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(auditReason);
      if (!auditHandledExternally) {
        appendMockAuditEvent({
          actor: "admin@fersaku.id",
          action: `admin.${title
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ".")
            .replace(/^\.|\.$/g, "")}`,
          target,
          ip: "mock-admin-session",
          result: "Success",
          context: auditReason,
        });
      }
      setDone(true);
    } catch {
      setError("Action failed. No success audit event was recorded.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#080d1b]/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-control-dialog-title"
        className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-6 shadow-2xl"
      >
        {done ? (
          <div className="py-8 text-center">
            <span
              className={`mx-auto grid size-14 place-items-center rounded-full ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#e9f7ef] text-[#287d4c]"}`}
            >
              <Check className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-black">Action recorded</h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              Mock operation completed and an immutable audit event was created.
            </p>
            <button
              onClick={onClose}
              className="mt-6 h-10 w-full rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start">
              <span
                className={`grid size-11 place-items-center rounded-xl ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#edf1ff] text-[#5b7cfa]"}`}
              >
                {danger ? (
                  <AlertTriangle className="size-5" />
                ) : (
                  <LockKeyhole className="size-5" />
                )}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close action dialog"
                className="ml-auto"
              >
                <X className="size-4" />
              </button>
            </div>
            <h3
              id="admin-control-dialog-title"
              className="mt-5 text-lg font-black tracking-[-.03em]"
            >
              {title}
            </h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              This privileged operation will be attributed to your administrator
              account and stored in the audit trail.
            </p>
            <label className="mt-5 grid gap-2 text-[9px] font-extrabold">
              Reason for action
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Provide an operational reason..."
                aria-describedby="admin-action-reason-hint"
                className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none focus:border-[#5b7cfa]"
              />
              <span
                id="admin-action-reason-hint"
                className="text-[7px] font-normal text-[#7d879b]"
              >
                Minimum 12 characters; included in the audit event.
              </span>
            </label>
            <label className="mt-3 flex items-center gap-2 text-[8px] text-[#737e93]">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />{" "}
              I have reviewed the available evidence and understand the impact.
            </label>
            {requiresRecentMfa && (
              <label className="mt-3 flex items-center gap-2 text-[8px] text-[#737e93]">
                <input
                  type="checkbox"
                  checked={recentMfaConfirmed}
                  onChange={(event) =>
                    setRecentMfaConfirmed(event.target.checked)
                  }
                />{" "}
                Recent MFA re-authentication is verified for this privileged
                action (mock).
              </label>
            )}
            {error && (
              <p role="alert" className="mt-3 text-[8px] text-[#c6534c]">
                {error}
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <button
                onClick={onClose}
                className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={recordAction}
                className={`h-10 flex-1 rounded-xl text-[9px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45 ${danger ? "bg-[#ce544d]" : "bg-[#11182a]"}`}
              >
                {submitting ? "Recording..." : "Confirm action"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
