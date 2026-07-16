"use client";

import { adminPanel } from "@/features/admin/ui";

import {
  Check,
  LoaderCircle,
  Settings2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ProviderItem = {
  id: string;
  icon: LucideIcon;
  name: string;
  type: string;
  status: string;
  latency: string;
  uptime: string;
  routing: string;
  color: string;
};

export function GenericProvider({
  provider,
  test,
  testing,
  tested,
}: {
  provider: ProviderItem;
  test: () => void;
  testing: boolean;
  tested: boolean;
}) {
  const Icon = provider.icon;
  return (
    <section className={`${adminPanel} p-6`}>
      <div className="flex items-start">
        <span
          className="grid size-14 place-items-center rounded-[18px]"
          style={{
            backgroundColor: `${provider.color}18`,
            color: provider.color,
          }}
        >
          <Icon className="size-6" />
        </span>
        <div className="ml-4">
          <h2 className="text-lg font-black">{provider.name}</h2>
          <p className="mt-1 text-[9px] text-[#7c879d]">{provider.type}</p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-full px-2.5 py-1.5 text-[8px] font-extrabold",
            provider.status === "Live"
              ? "bg-[#e7f6ec] text-[#238150]"
              : "bg-[#fff0d9] text-[#9a6b20]",
          )}
        >
          {provider.status}
        </span>
      </div>
      <div className="mt-7 grid grid-cols-3 gap-3">
        {[
          ["Latency", provider.latency],
          ["30D uptime", provider.uptime],
          ["Routing", provider.routing],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#f4f6f9] p-4">
            <span className="text-[7px] font-bold text-[#8b95a8] uppercase">
              {label}
            </span>
            <b className="mt-2 block text-[10px]">{value}</b>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        <button className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] text-[8px] font-bold">
          <Settings2 className="size-3.5" /> Configure
        </button>
        <button
          onClick={test}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
        >
          {testing ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : tested ? (
            <Check className="size-3.5" />
          ) : (
            <Zap className="size-3.5" />
          )}
          {testing ? "Testing..." : tested ? "Healthy" : "Test connection"}
        </button>
      </div>
    </section>
  );
}
