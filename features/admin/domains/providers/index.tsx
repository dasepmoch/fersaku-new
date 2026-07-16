"use client";

import {
  ChevronRight,
  CreditCard,
  Database,
  Network,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmergencySwitchboard } from "@/features/admin/operations/emergency";
import { GenericProvider, type ProviderItem } from "./generic-provider";

const baseProviders: ProviderItem[] = [
  {
    id: "xendit",
    icon: CreditCard,
    name: "Xendit Payments",
    type: "QRIS acceptance & disbursement",
    status: "Live",
    latency: "142ms",
    uptime: "99.99%",
    role: "Payment rail",
    color: "#5b7cfa",
  },
  {
    id: "r2",
    icon: Database,
    name: "Cloudflare R2",
    type: "Digital asset storage",
    status: "Live",
    latency: "86ms",
    uptime: "100%",
    role: "Object storage",
    color: "#e59633",
  },
  {
    id: "redis",
    icon: Network,
    name: "Redis / Asynq",
    type: "Queues & background jobs",
    status: "Degraded",
    latency: "386ms",
    uptime: "99.82%",
    role: "Queue runtime",
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
    role: "Email delivery",
    color: "#8b6ee8",
  },
];

export function ProviderInfrastructure() {
  const [selected, setSelected] = useState("xendit");
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState("just now");
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
  const refreshStatus = () => {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setLastChecked("just now");
    }, 700);
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
                  4 providers • Xendit primary • health checked {lastChecked}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshStatus}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#cfe8da] bg-white px-3 text-[8px] font-extrabold text-[#277a4b]"
              >
                <RefreshCw
                  className={cn("size-3.5", refreshing && "animate-spin")}
                />
                {refreshing ? "Checking" : "Refresh health"}
              </button>
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
          <GenericProvider
            provider={provider}
            test={() => test(provider.id)}
            testing={testing === provider.id}
            tested={tested === provider.id}
            lastChecked={lastChecked}
          />
        </div>
      </div>
    </>
  );
}
