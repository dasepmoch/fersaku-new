"use client";

import { BadgeCheck, Plus, Trash2 } from "lucide-react";
import type { BuilderConfig } from "../types";
import { ControlArea } from "../controls/control-area";
import { ControlInput } from "../controls/control-input";
import { PanelTitle } from "../controls/panel-title";
import {
  isSellerStoreDomainsApiDomain,
  pickPrimaryDomain,
  useStoreDomains,
  type StoreDomain,
} from "@/features/seller/store-domains";
import { useSellerStoreId } from "@/shared/seller";
import { getDomainSource } from "@/shared/data/domain-source";

function domainCardCopy(
  domain: StoreDomain | undefined,
  apiMode: boolean,
): {
  hostnameLine: string;
  badge: string;
  connected: boolean;
} {
  if (domain) {
    return {
      hostnameLine: `${domain.hostname} • ${domain.detailLabel}`,
      badge: domain.statusLabel,
      connected: domain.connected,
    };
  }
  if (apiMode) {
    // Real DNS/edge still fake on BE (INT-180) — do not claim Connected.
    return {
      hostnameLine: "No custom domain · platform host only",
      badge: "Not connected",
      connected: false,
    };
  }
  // Mock snapshot parity
  return {
    hostnameLine: "shop.asep.ai • DNS verified",
    badge: "Connected",
    connected: true,
  };
}

function CustomDomainCard() {
  const storeId = useSellerStoreId() ?? "";
  let apiMode = false;
  try {
    apiMode =
      isSellerStoreDomainsApiDomain() ||
      getDomainSource("sellerOperations") === "api";
  } catch {
    apiMode = false;
  }
  const domainsQuery = useStoreDomains(apiMode ? storeId : "");
  const primary = pickPrimaryDomain(domainsQuery.data ?? []);
  const copy = domainCardCopy(apiMode ? primary : undefined, apiMode);

  return (
    <div className="hairline rounded-2xl border bg-white p-4">
      <div className="flex items-center">
        <div>
          <b className="text-[9px]">Custom domain</b>
          <p className="mt-1 text-[8px] text-[#718078]">{copy.hostnameLine}</p>
        </div>
        <span
          className={
            copy.connected
              ? "ml-auto flex items-center gap-1 rounded-full bg-[#e5f5e6] px-2 py-1 text-[7px] font-extrabold text-[#2e714f]"
              : "ml-auto flex items-center gap-1 rounded-full bg-[#f0f0ee] px-2 py-1 text-[7px] font-extrabold text-[#6e7b73]"
          }
        >
          {copy.connected ? <BadgeCheck className="size-3" /> : null}
          {copy.badge}
        </span>
      </div>
    </div>
  );
}

export function LinksPanel({
  config,
  update,
}: {
  config: BuilderConfig;
  update: (patch: Partial<BuilderConfig>) => void;
}) {
  return (
    <div>
      <PanelTitle
        title="Links, domain & SEO"
        description="Finish the storefront metadata buyers and search engines will see."
      />
      <div className="mt-6 grid gap-4">
        <ControlInput
          label="Instagram"
          value={config.instagram}
          onChange={(instagram) => update({ instagram })}
        />
        <ControlInput
          label="Website"
          value={config.website}
          onChange={(website) => update({ website })}
        />
        <CustomDomainCard />
        <div>
          <div className="flex items-center">
            <h3 className="text-[9px] font-extrabold">Custom links</h3>
            <button
              onClick={() =>
                update({
                  customLinks: [
                    ...config.customLinks,
                    { label: "New link", url: "https://" },
                  ],
                })
              }
              className="ml-auto flex items-center gap-1 text-[8px] font-bold text-[#315d47]"
            >
              <Plus className="size-3" /> Add link
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {config.customLinks.map((link, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1.4fr_auto] gap-2"
              >
                <input
                  value={link.label}
                  onChange={(e) =>
                    update({
                      customLinks: config.customLinks.map((item, i) =>
                        i === index ? { ...item, label: e.target.value } : item,
                      ),
                    })
                  }
                  className="hairline h-10 min-w-0 rounded-xl border bg-white px-3 text-[8px]"
                />
                <input
                  value={link.url}
                  onChange={(e) =>
                    update({
                      customLinks: config.customLinks.map((item, i) =>
                        i === index ? { ...item, url: e.target.value } : item,
                      ),
                    })
                  }
                  className="hairline h-10 min-w-0 rounded-xl border bg-white px-3 text-[8px]"
                />
                <button
                  onClick={() =>
                    update({
                      customLinks: config.customLinks.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                  className="hairline grid size-10 place-items-center rounded-xl border bg-white text-[#a44f3b]"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="hairline border-t pt-6">
          <h3 className="text-xs font-extrabold">Search preview</h3>
          <div className="hairline mt-3 rounded-2xl border bg-white p-4">
            <p className="text-[10px] text-[#315d47]">shop.asep.ai</p>
            <p className="mt-1 text-base font-bold text-[#3657a7]">
              {config.seoTitle}
            </p>
            <p className="mt-1 text-[9px] leading-4 text-[#718078]">
              {config.seoDescription}
            </p>
          </div>
          <div className="mt-4 grid gap-4">
            <ControlInput
              label="SEO title"
              value={config.seoTitle}
              onChange={(seoTitle) => update({ seoTitle })}
            />
            <ControlArea
              label="Meta description"
              value={config.seoDescription}
              onChange={(seoDescription) => update({ seoDescription })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
