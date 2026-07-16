"use client";

import {
  adminPanel,
  AdminButton,
  SettingsGroup,
  AdminInput,
  Toggle,
} from "@/features/admin/ui";

import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

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
      <nav className={`${adminPanel} h-fit p-2`}>
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
      <section className={`${adminPanel} p-5 sm:p-7`}>
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

export { SystemSettings as AdminSystemScreen };
