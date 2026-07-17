"use client";

import { Check, Eye, LockKeyhole, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";
import {
  createImpersonationSession,
  IMPERSONATION_TTLS,
  persistImpersonationSession,
  type ImpersonationScope,
} from "@/features/admin/impersonation/session";

type ImpersonationDialogProps = {
  merchant: string;
  merchantId: string;
  targetEmail?: string;
  targetType?: "merchant" | "user";
  onClose: () => void;
};

export function ImpersonationDialog({
  merchant,
  merchantId,
  targetEmail,
  targetType = "merchant",
  onClose,
}: ImpersonationDialogProps) {
  const router = useRouter();
  const [scope, setScope] = useState<ImpersonationScope>("read-only");
  const [reason, setReason] = useState("");
  const [duration, setDuration] =
    useState<(typeof IMPERSONATION_TTLS)[number]>(15);
  const [starting, setStarting] = useState(false);
  const [recentMfaVerified, setRecentMfaVerified] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const scopePolicy = useMemo(
    () =>
      ({
        "read-only": {
          allowed: [
            "View dashboard and settings",
            "Inspect product and order state",
            "Reproduce navigation issues",
          ],
          blocked: [
            "All seller data mutations",
            "Credential reveal, copy, and export",
            "Finance, KYC, keys, staff, and destructive actions",
          ],
        },
        "support-write": {
          allowed: [
            "Profile: display name, locale, and timezone only",
            "Store presentation: name and description only",
          ],
          blocked: [
            "Every unlisted seller mutation (default deny)",
            "Credential reveal, copy, export, or delivery retry",
            "Products, payments, balance, bank, withdrawal, KYC, keys, and staff",
          ],
        },
      }) satisfies Record<
        ImpersonationScope,
        { allowed: string[]; blocked: string[] }
      >,
    [],
  )[scope];
  const canStart = reason.trim().length >= 12 && recentMfaVerified && !starting;

  const startSession = () => {
    if (!canStart) return;
    setStarting(true);
    setStorageError(false);
    const session = createImpersonationSession({
      targetId: merchantId,
      targetName: merchant,
      targetEmail,
      targetType,
      scope,
      reason,
      ttlMinutes: duration,
    });
    if (!session || !persistImpersonationSession(session)) {
      setStarting(false);
      setStorageError(true);
      return;
    }
    appendClientAuditEvent({
      actor: session.actor,
      action: "impersonation.started",
      target: merchantId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason.trim(),
    });
    window.dispatchEvent(new Event("fersaku-impersonation-updated"));
    router.push(
      `/dashboard?impersonate=${encodeURIComponent(merchantId)}&scope=${encodeURIComponent(scope)}&session=${encodeURIComponent(session.sessionId)}`,
    );
  };

  return (
    <div className="fixed inset-0 z-[170] grid place-items-center overflow-y-auto bg-[#080d1b]/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="impersonation-title"
        className="my-6 w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start">
          <span className="grid size-11 place-items-center rounded-xl bg-[#fff5df] text-[#c47d1f]">
            <Eye className="size-5" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close impersonation dialog"
            className="ml-auto"
          >
            <X className="size-4" />
          </button>
        </div>
        <h3 id="impersonation-title" className="mt-5 text-lg font-black">
          Open as {merchant}
        </h3>
        <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
          Creates a time-limited administrator session inside the {targetType}{" "}
          workspace. The user identity is never replaced and every action
          remains attributed to you.
          {targetEmail ? ` Target: ${targetEmail}.` : ""}
        </p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-[9px] font-extrabold">
            Session scope
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as ImpersonationScope)
              }
              className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px]"
            >
              <option value="read-only">Read-only investigation</option>
              <option value="support-write">Support write access</option>
            </select>
          </label>
          <label className="flex gap-3 rounded-xl border border-[#dce1e9] bg-[#f7f8fa] p-4 text-[8px] leading-4 text-[#65718b]">
            <input
              type="checkbox"
              checked={recentMfaVerified}
              onChange={(event) => setRecentMfaVerified(event.target.checked)}
              className="mt-0.5"
            />
            Recent administrator MFA re-authentication is verified for this
            impersonation session (mock).
          </label>
          <div className="grid gap-3 rounded-2xl border border-[#e2e6ed] bg-[#f7f8fa] p-4 sm:grid-cols-2">
            <div>
              <p className="text-[7px] font-extrabold tracking-wider text-[#277a4b] uppercase">
                Allowed in this scope
              </p>
              <div className="mt-3 grid gap-2">
                {scopePolicy.allowed.map((item) => (
                  <span key={item} className="flex gap-2 text-[8px] leading-4">
                    <Check className="mt-0.5 size-3 shrink-0 text-[#277a4b]" />{" "}
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[7px] font-extrabold tracking-wider text-[#c9544d] uppercase">
                Always blocked / guarded
              </p>
              <div className="mt-3 grid gap-2">
                {scopePolicy.blocked.map((item) => (
                  <span key={item} className="flex gap-2 text-[8px] leading-4">
                    <LockKeyhole className="mt-0.5 size-3 shrink-0 text-[#c9544d]" />{" "}
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <label className="grid gap-2 text-[9px] font-extrabold">
            Session duration
            <select
              value={duration}
              onChange={(event) =>
                setDuration(
                  Number(
                    event.target.value,
                  ) as (typeof IMPERSONATION_TTLS)[number],
                )
              }
              className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px]"
            >
              {IMPERSONATION_TTLS.map((ttl) => (
                <option key={ttl} value={ttl}>
                  {ttl} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-[9px] font-extrabold">
            Required reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              minLength={12}
              maxLength={500}
              placeholder="Ticket, incident, or investigation context..."
              className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none"
            />
            <span className="text-[7px] font-normal text-[#8993a6]">
              Minimum 12 characters. Stored only in the mock session and audit
              context; never placed in the URL.
            </span>
          </label>
        </div>
        <div className="mt-5 rounded-xl bg-[#fff8e9] p-4 text-[8px] leading-4 text-[#806f4f]">
          A persistent impersonation banner will appear. Read-only is the
          default. Support-write permits only the fields listed above; every
          other command is blocked. Production must enforce the same allowlist
          server-side.
        </div>
        {storageError && (
          <p className="mt-3 rounded-xl border border-[#efc8c4] bg-[#fff4f2] p-3 text-[8px] text-[#a34d46]">
            Could not create a secure mock session in this browser. Enable
            session storage and try again.
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={startSession}
            disabled={!canStart}
            className="h-10 flex-1 rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#9aa2b2]"
          >
            {starting ? "Starting session..." : "Start audited session"}
          </button>
        </div>
      </div>
    </div>
  );
}
