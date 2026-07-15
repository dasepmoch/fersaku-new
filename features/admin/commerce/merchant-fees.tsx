"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Percent, Save, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
export function MerchantFeeConfigurator({
  merchantName,
}: {
  merchantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(true);
  const [rate, setRate] = useState("1.5");
  const [appliedCustom, setAppliedCustom] = useState(true);
  const [appliedRate, setAppliedRate] = useState("1.5");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-11 place-items-center rounded-xl bg-[#edf1ff] text-[#536fdf]">
            <Percent className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black">Custom merchant fee</h3>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-[7px] font-extrabold",
                  appliedCustom
                    ? "bg-[#e7f6ec] text-[#238150]"
                    : "bg-[#eef1f6] text-[#7c879d]",
                )}
              >
                {appliedCustom ? "ACTIVE" : "GLOBAL"}
              </span>
            </div>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              {appliedCustom
                ? `${merchantName} pays ${appliedRate.replace(".", ",")}% instead of the default 3% platform fee.`
                : `${merchantName} currently follows the global 3% platform fee.`}
            </p>
          </div>
          <div className="sm:ml-auto sm:text-right">
            <b className="block text-xl text-[#536fdf]">
              {appliedCustom ? `${appliedRate.replace(".", ",")}%` : "3,0%"}
            </b>
            <span className="text-[7px] text-[#7c879d]">
              Effective for new orders
            </span>
          </div>
          <button
            onClick={() => {
              setOpen(true);
              setSaved(false);
              setCustom(appliedCustom);
              setRate(appliedRate);
            }}
            className="h-10 rounded-xl border border-[#dce1e9] px-4 text-[8px] font-extrabold"
          >
            Configure
          </button>
        </div>
        <div className="grid gap-px border-t border-[#e5e8ef] bg-[#e5e8ef] sm:grid-cols-3">
          {[
            ["Default fee", "3,0%"],
            ["Monthly GMV tier", "> Rp100jt"],
            ["Estimated monthly discount", appliedCustom ? "Rp1,84jt" : "Rp0"],
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-4">
              <span className="text-[7px] text-[#7c879d] uppercase">
                {label}
              </span>
              <b className="mt-1 block text-[9px]">{value}</b>
            </div>
          ))}
        </div>
      </section>
      {open && (
        <OpsModal
          icon={Percent}
          eyebrow="Merchant commercial override"
          title={`Configure fee - ${merchantName}`}
          onClose={() => setOpen(false)}
        >
          {saved ? (
            <div className="rounded-[24px] bg-[#e7f6ec] p-7 text-center text-[#238150]">
              <CheckCircle2 className="mx-auto size-8" />
              <h3 className="mt-4 text-lg font-black">Fee policy saved.</h3>
              <p className="mt-2 text-[9px]">
                New paid orders use{" "}
                {appliedCustom ? `${appliedRate}%` : "the global 3% fee"} while
                historical order snapshots remain unchanged.
              </p>
              <button
                onClick={() => setOpen(false)}
                className="mt-5 h-10 rounded-xl bg-[#218a52] px-5 text-[8px] font-extrabold text-white"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <label className="flex items-center rounded-xl bg-[#f5f6f9] p-4">
                <div>
                  <b className="block text-[9px]">
                    Enable merchant-specific fee
                  </b>
                  <span className="text-[7px] text-[#7c879d]">
                    Falls back to global policy when disabled.
                  </span>
                </div>
                <button
                  onClick={() => setCustom(!custom)}
                  className={cn(
                    "relative ml-auto h-6 w-11 rounded-full",
                    custom ? "bg-[#5b7cfa]" : "bg-[#cbd2de]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 size-4 rounded-full bg-white transition",
                      custom ? "left-6" : "left-1",
                    )}
                  />
                </button>
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Platform fee percentage">
                  <div className="flex h-11 overflow-hidden rounded-xl border border-[#dce1e9]">
                    <input
                      value={rate}
                      disabled={!custom}
                      onChange={(event) =>
                        setRate(event.target.value.replace(/[^0-9.]/g, ""))
                      }
                      className="min-w-0 flex-1 px-3 text-[10px] disabled:opacity-50"
                    />
                    <span className="grid place-items-center bg-[#f5f6f9] px-4 text-[9px]">
                      %
                    </span>
                  </div>
                </Field>
                <Field label="Effective date">
                  <input
                    type="date"
                    defaultValue="2026-07-13"
                    className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px]"
                  />
                </Field>
                <Field label="Expires">
                  <select className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px]">
                    <option>No expiry</option>
                    <option>90 days</option>
                    <option>180 days</option>
                    <option>Custom date</option>
                  </select>
                </Field>
                <Field label="Approval reference">
                  <input
                    defaultValue="DEAL-ENTERPRISE-ASEP-01"
                    className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px]"
                  />
                </Field>
              </div>
              <Field label="Required business reason">
                <textarea
                  rows={3}
                  defaultValue="Strategic high-volume merchant retention pricing approved by commercial lead."
                  className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px]"
                />
              </Field>
              <div className="mt-4 rounded-2xl bg-[#f5f6f9] p-4">
                <p className="text-[8px] font-extrabold text-[#7c879d] uppercase">
                  New order example - Rp100.000
                </p>
                <div className="mt-3 flex justify-between text-[9px]">
                  <span>Global fee 3%</span>
                  <b className={custom ? "line-through" : ""}>Rp3.000</b>
                </div>
                {custom && (
                  <div className="mt-2 flex justify-between text-[9px] text-[#238150]">
                    <span>Custom fee {rate || "0"}%</span>
                    <b>
                      Rp
                      {Math.round(
                        100000 * (Number(rate || 0) / 100),
                      ).toLocaleString("id-ID")}
                    </b>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setAppliedCustom(custom);
                  setAppliedRate(rate || "0");
                  setSaved(true);
                }}
                className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
              >
                <Save className="size-3.5" /> Save fee override & audit
              </button>
            </>
          )}
        </OpsModal>
      )}
    </>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-[8px] font-extrabold">
      {label}
      {children}
    </label>
  );
}
function OpsModal({
  icon: Icon,
  eyebrow,
  title,
  onClose,
  children,
  danger = false,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/75 p-4 backdrop-blur-sm">
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
