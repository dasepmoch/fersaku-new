"use client";

import Link from "next/link";
import { Check, Eye, LockKeyhole, X } from "lucide-react";
import { useState } from "react";

export function ImpersonationDialog({
  merchant,
  merchantId,
  onClose,
}: {
  merchant: string;
  merchantId: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState("read-only");
  const [reason, setReason] = useState("");
  const [fullConfirmed, setFullConfirmed] = useState(false);
  const scopePolicy = (
    {
      "read-only": {
        allowed: [
          "View dashboard and settings",
          "Inspect product and order state",
          "Reproduce navigation issues",
        ],
        blocked: [
          "Edit data",
          "Reveal credentials",
          "Change bank or withdraw funds",
        ],
      },
      "support-write": {
        allowed: [
          "Edit non-sensitive store content",
          "Retry safe delivery jobs",
          "Upload replacement product files",
        ],
        blocked: [
          "Reveal secrets",
          "Change bank or balance",
          "Manage API keys or staff",
        ],
      },
      full: {
        allowed: [
          "All seller workspace actions",
          "Sensitive configuration with step-up checks",
          "Incident remediation",
        ],
        blocked: [
          "Silent secret export",
          "Bypass immutable audit",
          "Disable impersonation banner",
        ],
      },
    } as Record<string, { allowed: string[]; blocked: string[] }>
  )[scope];
  const canStart =
    reason.trim().length >= 12 && (scope !== "full" || fullConfirmed);
  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-[#080d1b]/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
        <div className="flex items-start">
          <span className="grid size-11 place-items-center rounded-xl bg-[#fff5df] text-[#c47d1f]">
            <Eye className="size-5" />
          </span>
          <button onClick={onClose} className="ml-auto">
            <X className="size-4" />
          </button>
        </div>
        <h3 className="mt-5 text-lg font-black">Impersonate {merchant}</h3>
        <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
          Creates a time-limited administrator session inside the seller
          workspace. The seller identity is never replaced and every action
          remains attributed to you.
        </p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-[9px] font-extrabold">
            Session scope
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setFullConfirmed(false);
              }}
              className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px]"
            >
              <option value="read-only">Read-only investigation</option>
              <option value="support-write">Support write access</option>
              <option value="full">Full privileged access</option>
            </select>
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
            <select className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px]">
              <option>15 minutes</option>
              <option>30 minutes</option>
              <option>60 minutes</option>
            </select>
          </label>
          {scope === "full" && (
            <label className="flex gap-3 rounded-xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
              <input
                type="checkbox"
                checked={fullConfirmed}
                onChange={(event) => setFullConfirmed(event.target.checked)}
                className="mt-0.5"
              />
              I have an approved incident or escalation requiring full access
              and understand that sensitive actions still trigger step-up
              confirmation.
            </label>
          )}
          <label className="grid gap-2 text-[9px] font-extrabold">
            Required reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ticket, incident, or investigation context..."
              className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none"
            />
          </label>
        </div>
        <div className="mt-5 rounded-xl bg-[#fff8e9] p-4 text-[8px] leading-4 text-[#806f4f]">
          A persistent impersonation banner will appear. Credential reveals,
          exports, balance changes, and destructive actions still require
          separate confirmation.
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
          >
            Cancel
          </button>
          <Link
            href={`/dashboard?impersonate=${merchantId}&scope=${scope}`}
            className={`flex h-10 flex-1 items-center justify-center rounded-xl text-[9px] font-extrabold text-white ${canStart ? "bg-[#11182a]" : "pointer-events-none bg-[#9aa2b2]"}`}
          >
            Start audited session
          </Link>
        </div>
      </div>
    </div>
  );
}
