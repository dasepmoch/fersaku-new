"use client";

import {
  ChevronRight,
  CreditCard,
  Database,
  Network,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getDomainSource } from "@/shared/data/domain-source";
import { EmergencySwitchboard } from "@/features/admin/operations/emergency";
import { useAdminProviderInfrastructure } from "@/features/admin/operations/emergency/hooks";
import type {
  HealthStatusKind,
  ProviderHealthRow,
} from "@/features/admin/operations/emergency/data";
import { GenericProvider, type ProviderItem } from "./generic-provider";

const ICON_BY_ID: Record<string, LucideIcon> = {
  xendit: CreditCard,
  r2: Database,
  redis: Network,
  resend: Terminal,
  mail: Terminal,
};

function statusTone(kind: HealthStatusKind) {
  switch (kind) {
    case "ok":
      return "bg-[#e7f6ec] text-[#238150]";
    case "degraded":
      return "bg-[#fff0d9] text-[#9a6b20]";
    case "down":
      return "bg-[#fff0ee] text-[#c9544d]";
    default:
      return "bg-[#eef0f5] text-[#5c667a]";
  }
}

function vaultTone(kind: HealthStatusKind) {
  switch (kind) {
    case "ok":
      return {
        wrap: "border-[#cfe8da] bg-[#f0faf4]",
        icon: "bg-[#d9f3e3] text-[#27804d]",
        btn: "border-[#cfe8da] text-[#277a4b]",
        Icon: ShieldCheck,
      };
    case "degraded":
      return {
        wrap: "border-[#f0d9a8] bg-[#fff8eb]",
        icon: "bg-[#ffe8c2] text-[#9a6b20]",
        btn: "border-[#f0d9a8] text-[#9a6b20]",
        Icon: ShieldAlert,
      };
    case "down":
      return {
        wrap: "border-[#efc9c5] bg-[#fff6f5]",
        icon: "bg-[#ffe0dc] text-[#c9544d]",
        btn: "border-[#efc9c5] text-[#c9544d]",
        Icon: ShieldAlert,
      };
    default:
      return {
        wrap: "border-[#dfe3ec] bg-[#f5f6f9]",
        icon: "bg-[#e8ebf2] text-[#5c667a]",
        btn: "border-[#dfe3ec] text-[#5c667a]",
        Icon: ShieldQuestion,
      };
  }
}

function toProviderItem(row: ProviderHealthRow): ProviderItem {
  return {
    id: row.id,
    icon: ICON_BY_ID[row.id] ?? Network,
    name: row.name,
    type: row.type,
    status: row.statusLabel,
    statusKind: row.statusKind,
    latency: row.latencyLabel,
    uptime: row.message || row.accountScope || "—",
    role: row.role,
    color: row.color,
  };
}

export function ProviderInfrastructure() {
  const isMock = getDomainSource("adminRead") === "mock";
  const query = useAdminProviderInfrastructure();
  // Mock fixtures live in hooks/api only (INT-170 presentation boundary).
  const rows = useMemo<ProviderHealthRow[]>(
    () => query.data?.rows ?? [],
    [query.data],
  );
  const items = useMemo(() => rows.map(toProviderItem), [rows]);
  const [selected, setSelected] = useState<string>("");
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);

  const activeId =
    selected && items.some((i) => i.id === selected)
      ? selected
      : (items[0]?.id ?? "");
  const provider = items.find((item) => item.id === activeId) ?? items[0];

  const overallKind =
    query.data?.overallKind ?? (isMock ? "degraded" : "unknown");
  const tone = vaultTone(overallKind);
  const VaultIcon = tone.Icon;
  const lastChecked =
    query.data?.checkedLabel ?? (isMock ? "just now" : "unknown");
  const overallLabel =
    query.data?.overallLabel ??
    (isMock ? "Provider vault degraded" : "Provider health unknown");

  const refreshing = query.isFetching && !query.isLoading;

  const test = (id: string) => {
    // Refresh is the real health probe; no fake local timer success on api.
    setTesting(id);
    setTested(null);
    void query.refetch().finally(() => {
      setTesting(null);
      setTested(id);
      window.setTimeout(() => setTested(null), 1800);
    });
  };

  const refreshStatus = () => {
    void query.refetch();
  };

  const loadError =
    !isMock &&
    (query.data?.systemError ||
      query.data?.providersError ||
      query.error?.message);

  return (
    <>
      <EmergencySwitchboard />
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div>
          <div className={cn("rounded-[20px] border p-5", tone.wrap)}>
            <div className="flex items-center">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-xl",
                  tone.icon,
                )}
              >
                <VaultIcon className="size-4" />
              </span>
              <div className="ml-3">
                <h3 className="text-[10px] font-black">{overallLabel}</h3>
                <p className="mt-1 text-[8px] text-[#688374]">
                  {items.length || 0} providers
                  {items.some((i) => i.id === "xendit")
                    ? " • Xendit primary"
                    : ""}{" "}
                  • health checked {lastChecked}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshStatus}
                className={cn(
                  "ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border bg-white px-3 text-[8px] font-extrabold",
                  tone.btn,
                )}
              >
                <RefreshCw
                  className={cn("size-3.5", refreshing && "animate-spin")}
                />
                {refreshing ? "Checking" : "Refresh health"}
              </button>
            </div>
          </div>
          {loadError ? (
            <div className="mt-3 rounded-xl border border-[#efc9c5] bg-[#fff6f5] px-3 py-2 text-[8px] text-[#b94c46]">
              {loadError}
            </div>
          ) : null}
          {!isMock && items.length === 0 && !query.isLoading ? (
            <div className="mt-3 rounded-xl border border-[#dfe3ec] bg-white px-3 py-4 text-[8px] text-[#7c879d]">
              No provider health returned. Not showing fake operational status.
            </div>
          ) : null}
          <div className="mt-4 grid gap-2">
            {items.map((item) => {
              const Icon = item.icon;
              const kind =
                rows.find((r) => r.id === item.id)?.statusKind ?? "unknown";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    "rounded-[18px] border p-4 text-left transition",
                    activeId === item.id
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
                        statusTone(kind),
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
          {provider ? (
            <GenericProvider
              provider={provider}
              test={() => test(provider.id)}
              testing={testing === provider.id}
              tested={tested === provider.id}
              lastChecked={lastChecked}
            />
          ) : (
            <section className="rounded-[20px] border border-[#dfe3ec] bg-white p-6 text-[9px] text-[#7c879d]">
              Provider detail unavailable until health is returned.
            </section>
          )}
        </div>
      </div>
    </>
  );
}
