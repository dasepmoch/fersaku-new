"use client";

import { adminPanel } from "@/features/admin/ui";
import { useState } from "react";
import { Network, Pause, Play, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { emergencySeed } from "./data";
import { Field, Modal } from "./pieces";
import { appendMockAuditEvent } from "@/features/admin/data/mock-audit";

const maintenanceBannerId = "global-maintenance-banner";

export function EmergencySwitchboard() {
  const [controls, setControls] = useState(emergencySeed);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [banner, setBanner] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const pending = controls.find((item) => item.id === pendingId);
  const isBannerPending = pendingId === maintenanceBannerId;
  const pendingEnabled = pending?.enabled ?? banner;
  const pendingLabel = pending?.label ?? "global maintenance banner";
  const pendingImpact =
    pending?.impact ?? "Global customer-facing maintenance communication";
  const closePending = () => {
    setPendingId(null);
    setReason("");
    setConfirmed(false);
  };
  const openPending = (id: string) => {
    setReason("");
    setConfirmed(false);
    setPendingId(id);
  };
  const apply = () => {
    const auditReason = reason.trim();
    if (auditReason.length < 12 || !confirmed) return;
    if (pending) {
      setControls((items) =>
        items.map((item) =>
          item.id === pending.id ? { ...item, enabled: !item.enabled } : item,
        ),
      );
      appendMockAuditEvent({
        actor: "admin@fersaku.id",
        action: `emergency.${pending.enabled ? "paused" : "enabled"}`,
        target: pending.id,
        ip: "mock-admin-session",
        result: "Success",
        context: auditReason,
      });
      closePending();
      return;
    }
    if (!isBannerPending) return;
    const next = !banner;
    setBanner(next);
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: `emergency.banner.${next ? "enabled" : "disabled"}`,
      target: maintenanceBannerId,
      ip: "mock-admin-session",
      result: "Success",
      context: auditReason,
    });
    closePending();
  };
  return (
    <>
      <section className={`${adminPanel} mb-5 overflow-hidden`}>
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
                Circuit breakers for incidents and provider maintenance. Every
                change requires a reason, confirmation, audit event, and
                affected-surface snapshot.
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
        <div className="grid gap-px bg-[#e5e8ef] sm:grid-cols-2 xl:grid-cols-3">
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
                  aria-label={`${control.enabled ? "Pause" : "Enable"} ${control.label}`}
                  onClick={() => openPending(control.id)}
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
                Xendit sedang maintenance singkat. Pembayaran tetap aman dan
                akan kembali segera.
              </span>
            </div>
          </div>
          <button
            aria-label={`${banner ? "Disable" : "Enable"} global maintenance banner`}
            onClick={() => openPending(maintenanceBannerId)}
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
      {(pending || isBannerPending) && (
        <Modal
          title={`${pending ? (pending.enabled ? "Pause" : "Enable") : banner ? "Disable" : "Enable"} ${pendingLabel}`}
          eyebrow="Emergency configuration"
          icon={Siren}
          onClose={closePending}
          danger={pending?.danger ?? banner}
        >
          <div className="rounded-2xl bg-[#f5f6f9] p-4">
            <p className="text-[8px] font-extrabold tracking-wider text-[#7c879d] uppercase">
              Affected surfaces
            </p>
            <p className="mt-2 text-[9px] font-bold">{pendingImpact}</p>
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
              onClick={closePending}
              className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
            >
              Cancel
            </button>
            <button
              disabled={reason.trim().length < 12 || !confirmed}
              onClick={apply}
              className={cn(
                "h-10 flex-1 rounded-xl text-[8px] font-extrabold text-white disabled:bg-[#b9bfca]",
                pendingEnabled ? "bg-[#d95750]" : "bg-[#218a52]",
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
