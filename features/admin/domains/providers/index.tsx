"use client";

import {
  Banknote,
  BrainCircuit,
  ChevronRight,
  CreditCard,
  Database,
  Network,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmergencySwitchboard } from "@/features/admin/operations/emergency";
import { AiProvider } from "./ai-provider";
import { GenericProvider, type ProviderItem } from "./generic-provider";

const baseProviders: ProviderItem[] = [
  {
    id: "duitku",
    icon: CreditCard,
    name: "Duitku QRIS",
    type: "Payment acceptance",
    status: "Live",
    latency: "142ms",
    uptime: "99.99%",
    routing: "Primary",
    color: "#5b7cfa",
  },
  {
    id: "xendit",
    icon: Banknote,
    name: "Xendit Disbursement",
    type: "Seller payouts",
    status: "Live",
    latency: "218ms",
    uptime: "99.96%",
    routing: "Primary",
    color: "#28a566",
  },
  {
    id: "ai",
    icon: BrainCircuit,
    name: "Fersaku Admin AI",
    type: "Internal operations intelligence",
    status: "Live",
    latency: "692ms",
    uptime: "99.91%",
    routing: "Multi-model",
    color: "#f05a7e",
  },
  {
    id: "r2",
    icon: Database,
    name: "Cloudflare R2",
    type: "Digital asset storage",
    status: "Live",
    latency: "86ms",
    uptime: "100%",
    routing: "Primary",
    color: "#e59633",
  },
  {
    id: "redis",
    icon: Network,
    name: "Redis / BullMQ",
    type: "Queues & background jobs",
    status: "Degraded",
    latency: "386ms",
    uptime: "99.82%",
    routing: "Primary",
    color: "#ef6351",
  },
  {
    id: "resend",
    icon: Terminal,
    name: "Resend",
    type: "Transactional email",
    status: "Live",
    latency: "121ms",
    uptime: "99.97%",
    routing: "Primary",
    color: "#8b6ee8",
  },
];

export function ProviderInfrastructure() {
  const [selected, setSelected] = useState("duitku");
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const provider =
    baseProviders.find((item) => item.id === selected) || baseProviders[0];
  const test = (id: string) => {
    setTesting(id);
    setTested(null);
    setTimeout(() => {
      setTesting(null);
      setTested(id);
      setTimeout(() => setTested(null), 1800);
    }, 900);
  };
  return (
    <>
      <EmergencySwitchboard />
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div>
          <div className="rounded-[20px] border border-[#cfe8da] bg-[#f0faf4] p-5">
            <div className="flex items-center">
              <span className="grid size-10 place-items-center rounded-xl bg-[#d9f3e3] text-[#27804d]">
                <ShieldCheck className="size-4" />
              </span>
              <div className="ml-3">
                <h3 className="text-[10px] font-black">
                  Provider vault healthy
                </h3>
                <p className="mt-1 text-[8px] text-[#688374]">
                  6 providers • secrets encrypted • rotation monitored
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {baseProviders.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    "rounded-[18px] border p-4 text-left transition",
                    selected === item.id
                      ? "shadow-card border-[#5b7cfa] bg-[#eef2ff]"
                      : "border-[#dfe3ec] bg-white",
                  )}
                >
                  <div className="flex items-center">
                    <span
                      className="grid size-10 place-items-center rounded-xl"
                      style={{
                        backgroundColor: `${item.color}18`,
                        color: item.color,
                      }}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="ml-3 min-w-0">
                      <b className="block truncate text-[10px]">{item.name}</b>
                      <span className="text-[8px] text-[#7c879d]">
                        {item.type}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "ml-auto rounded-full px-2 py-1 text-[7px] font-extrabold",
                        item.status === "Live"
                          ? "bg-[#e7f6ec] text-[#238150]"
                          : "bg-[#fff0d9] text-[#9a6b20]",
                      )}
                    >
                      {item.status}
                    </span>
                    <ChevronRight className="ml-2 size-3.5 text-[#8b95a8]" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-w-0">
          {provider.id === "ai" ? (
            <AiProvider
              test={() => test("ai")}
              testing={testing === "ai"}
              tested={tested === "ai"}
            />
          ) : (
            <GenericProvider
              provider={provider}
              test={() => test(provider.id)}
              testing={testing === provider.id}
              tested={tested === provider.id}
            />
          )}
        </div>
      </div>
    </>
  );
}
