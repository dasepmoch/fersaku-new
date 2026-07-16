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
import { FeePolicyPreview } from "@/features/admin/commerce/fee-policy-preview";

function SystemSettings() {
  const [active, setActive] = useState("Commercial rules");
  const flags: Record<string, boolean> = {
    customDomains: true,
    sandboxApi: true,
    liveQrisApi: true,
    sellerWebhooks: true,
  };
  const security: Record<string, boolean> = {
    mfa: true,
    reasons: true,
    rotate: true,
    supportImpersonation: true,
  };
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
              <AdminInput label="Platform fee" value="3" suffix="%" readOnly />
              <AdminInput
                label="Payment processing fee"
                value="700"
                prefix="Rp"
                readOnly
              />
              <AdminInput
                label="Transaction sources"
                value="Storefront + QRIS API"
                readOnly
              />
            </div>
            <div className="mt-4 rounded-xl border border-[#ead7ad] bg-[#fff9eb] p-4 text-[9px] leading-4 text-[#7a673c]">
              <AlertTriangle className="mr-2 inline size-3.5" /> Launch fee is
              fixed at 3% + Rp700 for both sources. A future change requires a
              product-approved versioned release, not an operator override.
            </div>
            <FeePolicyPreview className="mt-4" />
          </SettingsGroup>
        </div>
        <div className={active === "Settlement" ? "" : "hidden"}>
          <SettingsGroup
            title="Settlement policy"
            desc="Controls when seller funds become withdrawable."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminInput
                label="Withdrawal platform fee"
                value="3"
                suffix="%"
                readOnly
              />
              <AdminInput
                label="Settlement delay"
                value="1"
                suffix="day"
                readOnly
              />
              <AdminInput
                label="Minimum withdrawal"
                value="50000"
                prefix="Rp"
                readOnly
              />
            </div>
            <div className="mt-4 rounded-xl border border-[#dfe3eb] bg-[#f8f9fb] p-4 text-[9px] leading-4 text-[#6f7a90]">
              <b className="text-[#22283a]">Withdrawal processing</b> is charged
              by Xendit at disbursement time. The final provider fee is fetched
              server-side and added to the 3% platform fee; the browser never
              writes the ledger amount.
            </div>
          </SettingsGroup>
        </div>
        <div className={active === "Feature flags" ? "" : "hidden"}>
          <SettingsGroup
            title="Feature flags"
            desc="Release-managed capability snapshot; runtime override is disabled."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "customDomains",
                  "Custom domains",
                  "Enable domain verification and SSL provisioning",
                ],
                [
                  "sandboxApi",
                  "QRIS API sandbox",
                  "Allow isolated payment testing without production funds",
                ],
                [
                  "liveQrisApi",
                  "Live QRIS API",
                  "Allow KYC-approved live QRIS payment credentials",
                ],
                [
                  "sellerWebhooks",
                  "Seller webhooks",
                  "Deliver signed payment events to merchant endpoints",
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
                    onChange={() => undefined}
                    disabled
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
                readOnly
              />
              <AdminInput
                label="Maximum upload size"
                value="2048"
                suffix="MB"
                readOnly
              />
              <AdminInput
                label="API requests per minute"
                value="120"
                readOnly
              />
              <AdminInput label="Webhook retry attempts" value="8" readOnly />
              <AdminInput
                label="Inventory import rows"
                value="10000"
                readOnly
              />
              <AdminInput
                label="Active API keys per account"
                value="1"
                readOnly
              />
            </div>
          </SettingsGroup>
        )}
        {active === "Security policy" && (
          <SettingsGroup
            title="Administrator security"
            desc="Release-managed access and session policy snapshot."
          >
            <div className="grid gap-3">
              {[
                ["mfa", "Require MFA for every administrator"],
                ["reasons", "Require reason for privileged actions"],
                ["rotate", "Rotate sessions after permission escalation"],
                ["supportImpersonation", "Allow support-write impersonation"],
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
                    onChange={() => undefined}
                    disabled
                  />
                </div>
              ))}
            </div>
          </SettingsGroup>
        )}
        <div className={active === "Maintenance" ? "" : "hidden"}>
          <SettingsGroup
            title="Emergency controls"
            desc="Use the guarded provider switchboard for runtime controls."
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
                value={false}
                onChange={() => undefined}
                danger
                disabled
              />
            </div>
          </SettingsGroup>
        </div>
        <div className="flex justify-end gap-2">
          <AdminButton
            secondary
            disabled
            title="Configuration is managed through a versioned release"
          >
            Discard changes
          </AdminButton>
          <AdminButton
            aria-label="Publish current configuration"
            disabled
            title="Configuration is managed through a versioned release"
          >
            <Check className="size-4" /> Publish configuration
          </AdminButton>
        </div>
      </section>
    </div>
  );
}

export { SystemSettings as AdminSystemScreen };
