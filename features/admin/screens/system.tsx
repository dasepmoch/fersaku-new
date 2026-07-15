"use client";

import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
function AdminButton({
  children,
  secondary = false,
  onClick,
}: {
  children: React.ReactNode;
  secondary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-extrabold transition ${secondary ? "border border-[#d8dde8] bg-white text-[#3c465d] hover:bg-[#f8f9fb]" : "bg-[#11182a] text-white hover:-translate-y-0.5 hover:bg-[#202b48]"}`}
    >
      {children}
    </button>
  );
}
function SystemSettings() {
  const [active, setActive] = useState("Commercial rules");
  const [published, setPublished] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({
    customDomains: true,
    proPlan: false,
    publicApi: true,
    autoPayout: false,
  });
  const [security, setSecurity] = useState<Record<string, boolean>>({
    mfa: true,
    reasons: true,
    rotate: true,
    supportImpersonation: true,
    fullImpersonation: false,
  });
  return (
    <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
      <nav className={`${panel} h-fit p-2`}>
        {[
          "Commercial rules",
          "Settlement",
          "Feature flags",
          "Platform limits",
          "Security policy",
          "Maintenance",
        ].map((x) => (
          <button
            key={x}
            onClick={() => setActive(x)}
            className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-[9px] font-extrabold ${active === x ? "bg-[#edf1ff] text-[#4e6fe3]" : "text-[#68748a] hover:bg-[#f5f6f9]"}`}
          >
            {x}
          </button>
        ))}
      </nav>
      <section className={`${panel} p-5 sm:p-7`}>
        <div className={active === "Commercial rules" ? "" : "hidden"}>
          <SettingsGroup
            title="Platform fees"
            desc="Applied to newly created paid orders."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <AdminInput label="Platform fee" value="3" suffix="%" />
              <AdminInput label="Fixed platform fee" value="0" prefix="Rp" />
              <AdminInput label="Payment fee" value="700" prefix="Rp" />
            </div>
            <div className="mt-4 rounded-xl border border-[#ead7ad] bg-[#fff9eb] p-4 text-[9px] leading-4 text-[#7a673c]">
              <AlertTriangle className="mr-2 inline size-3.5" /> Fee changes
              affect new orders only and create a permanent configuration audit
              event.
            </div>
          </SettingsGroup>
        </div>
        <div className={active === "Settlement" ? "" : "hidden"}>
          <SettingsGroup
            title="Settlement policy"
            desc="Controls when seller funds become withdrawable."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminInput label="Settlement delay" value="1" suffix="day" />
              <AdminInput
                label="Minimum withdrawal"
                value="50000"
                prefix="Rp"
              />
            </div>
          </SettingsGroup>
        </div>
        <div className={active === "Feature flags" ? "" : "hidden"}>
          <SettingsGroup
            title="Feature flags"
            desc="Progressively release platform capabilities."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "customDomains",
                  "Custom domains",
                  "Enable domain verification and SSL provisioning",
                ],
                [
                  "proPlan",
                  "Pro subscription",
                  "Expose paid plan upgrade to sellers",
                ],
                [
                  "publicApi",
                  "Developer API",
                  "Allow live API keys and QRIS endpoints",
                ],
                [
                  "autoPayout",
                  "Automatic payouts",
                  "Skip manual review for eligible merchants",
                ],
              ].map(([key, title, desc]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-[#e1e5ed] p-4"
                >
                  <div>
                    <p className="text-[9px] font-extrabold">{title}</p>
                    <p className="mt-1 max-w-[230px] text-[8px] leading-4 text-[#8791a5]">
                      {desc}
                    </p>
                  </div>
                  <Toggle
                    value={flags[key]}
                    onChange={() => setFlags({ ...flags, [key]: !flags[key] })}
                  />
                </div>
              ))}
            </div>
          </SettingsGroup>
        </div>
        {active === "Platform limits" && (
          <SettingsGroup
            title="Platform limits"
            desc="Hard limits protecting providers and platform resources."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminInput
                label="Maximum product price"
                value="50000000"
                prefix="Rp"
              />
              <AdminInput
                label="Maximum upload size"
                value="2048"
                suffix="MB"
              />
              <AdminInput label="API requests per minute" value="120" />
              <AdminInput label="Webhook retry attempts" value="8" />
              <AdminInput label="Inventory import rows" value="10000" />
              <AdminInput label="Active API keys per store" value="10" />
            </div>
          </SettingsGroup>
        )}
        {active === "Security policy" && (
          <SettingsGroup
            title="Administrator security"
            desc="Organization-wide access and session requirements."
          >
            <div className="grid gap-3">
              {[
                ["mfa", "Require MFA for every administrator"],
                ["reasons", "Require reason for privileged actions"],
                ["rotate", "Rotate sessions after permission escalation"],
                ["supportImpersonation", "Allow support-write impersonation"],
                ["fullImpersonation", "Allow full impersonation"],
              ].map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-[#e1e5ed] p-4"
                >
                  <div>
                    <b className="block text-[9px]">{label}</b>
                    <span className="text-[7px] text-[#8791a5]">
                      Changes are applied to new and active staff sessions.
                    </span>
                  </div>
                  <Toggle
                    value={security[key]}
                    onChange={() =>
                      setSecurity({ ...security, [key]: !security[key] })
                    }
                  />
                </div>
              ))}
            </div>
          </SettingsGroup>
        )}
        <div className={active === "Maintenance" ? "" : "hidden"}>
          <SettingsGroup
            title="Emergency controls"
            desc="Global controls require super administrator permission."
          >
            <div className="flex items-center justify-between rounded-xl border border-[#efc9c5] bg-[#fff6f5] p-4">
              <div>
                <p className="text-[9px] font-extrabold text-[#b94c46]">
                  Maintenance mode
                </p>
                <p className="mt-1 text-[8px] text-[#976b68]">
                  Disable seller and checkout mutations while keeping status
                  pages online.
                </p>
              </div>
              <Toggle
                value={maintenance}
                onChange={() => setMaintenance(!maintenance)}
                danger
              />
            </div>
          </SettingsGroup>
        </div>
        <div className="flex justify-end gap-2">
          <AdminButton secondary onClick={() => setPublished(false)}>
            Discard changes
          </AdminButton>
          <AdminButton onClick={() => setPublished(true)}>
            <Check className="size-4" />{" "}
            {published
              ? "Configuration published & audited"
              : "Publish configuration"}
          </AdminButton>
        </div>
      </section>
    </div>
  );
}
function SettingsGroup({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7 border-b border-[#e5e8ef] pb-7 last:border-0">
      <h3 className="text-[11px] font-black">{title}</h3>
      <p className="mt-1 mb-5 text-[8px] text-[#8490a5]">{desc}</p>
      {children}
    </div>
  );
}
function AdminInput({
  label,
  value,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <div className="flex h-11 overflow-hidden rounded-xl border border-[#dce1e9] bg-white">
        {prefix && (
          <span className="grid place-items-center border-r border-[#e2e5ec] bg-[#f5f6f9] px-3 text-[9px] text-[#798499]">
            {prefix}
          </span>
        )}
        <input
          defaultValue={value}
          className="min-w-0 flex-1 px-3 text-[10px] outline-none"
        />
        {suffix && (
          <span className="grid place-items-center border-l border-[#e2e5ec] bg-[#f5f6f9] px-3 text-[9px] text-[#798499]">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
function Toggle({
  value,
  onChange,
  danger = false,
}: {
  value: boolean;
  onChange: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? (danger ? "bg-[#d95850]" : "bg-[#5b7cfa]") : "bg-[#cfd4df]"}`}
    >
      <span
        className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${value ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

export { SystemSettings as AdminSystemScreen };
