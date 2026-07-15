"use client";

import { useState } from "react";
import { Network, Pause, Play, Siren, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
type EmergencyControl = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  danger: boolean;
  impact: string;
};
const emergencySeed: EmergencyControl[] = [
  {
    id: "registration",
    label: "Seller registration",
    description: "Allow new seller account and store onboarding",
    enabled: true,
    danger: true,
    impact: "New seller registration and first-store onboarding",
  },
  {
    id: "qris",
    label: "QRIS checkout",
    description: "Accept new Duitku QRIS payment intents",
    enabled: true,
    danger: true,
    impact: "All hosted checkout and API payment creation",
  },
  {
    id: "withdrawals",
    label: "Seller withdrawals",
    description: "Create and approve Xendit disbursements",
    enabled: true,
    danger: true,
    impact: "Seller payout creation and admin approvals",
  },
  {
    id: "ai",
    label: "Admin AI tools",
    description: "Internal analysis and operations assistance",
    enabled: true,
    danger: false,
    impact: "Administrator playground and internal AI workflows",
  },
  {
    id: "backup",
    label: "Backup payment route",
    description: "Route eligible traffic to standby provider",
    enabled: false,
    danger: true,
    impact: "New payment intents after health-check approval",
  },
];
export function EmergencySwitchboard() {
  const [controls, setControls] = useState(emergencySeed);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [banner, setBanner] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const pending = controls.find((item) => item.id === pendingId);
  const apply = () => {
    if (!pending) return;
    setControls((items) =>
      items.map((item) =>
        item.id === pending.id ? { ...item, enabled: !item.enabled } : item,
      ),
    );
    setPendingId(null);
    setReason("");
    setConfirmed(false);
  };
  return (
    <>
      <section className={`${panel} mb-5 overflow-hidden`}>
        <div className="relative overflow-hidden bg-[#151827] p-6 text-white">
          <div className="absolute -top-28 -right-20 size-72 rounded-full bg-[#f1b84b]/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
            <span className="grid size-14 place-items-center rounded-[18px] bg-[#f1b84b] text-[#3e2c08]">
              <Siren className="size-7" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black">
                  Emergency Provider Switchboard
                </h2>
                <span className="rounded-full bg-[#293047] px-2 py-1 text-[7px] font-extrabold text-[#aab6d4]">
                  SUPERADMIN ONLY
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-[9px] leading-5 text-white/50">
                Circuit breakers for incidents, provider maintenance, and
                controlled failover. Every change requires a reason,
                confirmation, audit event, and affected-surface snapshot.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 lg:ml-auto">
              <p className="text-[7px] font-extrabold tracking-wider text-white/40 uppercase">
                Incident mode
              </p>
              <b className="mt-1 block text-[9px] text-[#74e0a4]">
                Normal operations
              </b>
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-[#e5e8ef] sm:grid-cols-2 xl:grid-cols-6">
          {controls.map((control) => (
            <div key={control.id} className="bg-white p-4">
              <div className="flex items-start">
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-xl",
                    control.enabled
                      ? "bg-[#e7f6ec] text-[#238150]"
                      : "bg-[#fff0ee] text-[#c9544d]",
                  )}
                >
                  {control.enabled ? (
                    <Play className="size-4" />
                  ) : (
                    <Pause className="size-4" />
                  )}
                </span>
                <button
                  onClick={() => setPendingId(control.id)}
                  className={cn(
                    "relative ml-auto h-6 w-11 rounded-full",
                    control.enabled ? "bg-[#28a566]" : "bg-[#d85b53]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 size-4 rounded-full bg-white transition",
                      control.enabled ? "left-6" : "left-1",
                    )}
                  />
                </button>
              </div>
              <b className="mt-4 block text-[9px]">{control.label}</b>
              <p className="mt-1 min-h-8 text-[7px] leading-4 text-[#7c879d]">
                {control.description}
              </p>
              <span
                className={cn(
                  "mt-3 inline-flex rounded-lg px-2 py-1 text-[7px] font-extrabold",
                  control.enabled
                    ? "bg-[#e7f6ec] text-[#238150]"
                    : "bg-[#fff0ee] text-[#c9544d]",
                )}
              >
                {control.enabled ? "ENABLED" : "PAUSED"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-[#e5e8ef] bg-[#f8f9fb] p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Network className="size-4 text-[#5b7cfa]" />
            <div>
              <b className="block text-[8px]">Global maintenance banner</b>
              <span className="text-[7px] text-[#7c879d]">
                Duitku sedang maintenance singkat. Pembayaran tetap aman dan
                akan kembali segera.
              </span>
            </div>
          </div>
          <button
            onClick={() => setBanner(!banner)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full sm:ml-auto",
              banner ? "bg-[#5b7cfa]" : "bg-[#cbd2de]",
            )}
          >
            <span
              className={cn(
                "absolute top-1 size-4 rounded-full bg-white transition",
                banner ? "left-6" : "left-1",
              )}
            />
          </button>
        </div>
      </section>
      {pending && (
        <Modal
          title={`${pending.enabled ? "Pause" : "Enable"} ${pending.label}`}
          eyebrow="Emergency configuration"
          icon={Siren}
          onClose={() => setPendingId(null)}
          danger={pending.danger}
        >
          <div className="rounded-2xl bg-[#f5f6f9] p-4">
            <p className="text-[8px] font-extrabold tracking-wider text-[#7c879d] uppercase">
              Affected surfaces
            </p>
            <p className="mt-2 text-[9px] font-bold">{pending.impact}</p>
          </div>
          <Field label="Required incident or maintenance reason">
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Incident ID, provider notice, impact, and rollback condition..."
              className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] outline-none"
            />
          </Field>
          <label className="mt-4 flex gap-3 rounded-xl border border-[#f0d69e] bg-[#fff8e8] p-4 text-[8px] leading-4 text-[#7c6a45]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            I reviewed customer impact, fallback behavior, communication banner,
            and rollback owner.
          </label>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setPendingId(null)}
              className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
            >
              Cancel
            </button>
            <button
              disabled={reason.trim().length < 12 || !confirmed}
              onClick={apply}
              className={cn(
                "h-10 flex-1 rounded-xl text-[8px] font-extrabold text-white disabled:bg-[#b9bfca]",
                pending.enabled ? "bg-[#d95750]" : "bg-[#218a52]",
              )}
            >
              Confirm & audit change
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 grid gap-2 text-[8px] font-extrabold">
      {label}
      {children}
    </label>
  );
}
function Modal({
  title,
  eyebrow,
  icon: Icon,
  onClose,
  children,
  danger = false,
}: {
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/72 p-4 backdrop-blur-sm">
      <section className="my-6 w-full max-w-2xl rounded-[26px] bg-white p-6 text-[#131827] shadow-2xl">
        <div className="flex items-start">
          <span
            className={cn(
              "grid size-12 place-items-center rounded-2xl",
              danger
                ? "bg-[#fff0ee] text-[#c9544d]"
                : "bg-[#edf1fb] text-[#536fdf]",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="ml-4">
            <p className="text-[7px] font-extrabold tracking-[.18em] text-[#7c879d] uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-black">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
