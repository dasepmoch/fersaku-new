"use client";

import { adminPanel } from "@/features/admin/ui";

import { useState } from "react";
import {
  Activity,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { initialRiskAlerts } from "./data";
import { RiskCaseDetail } from "./detail";
import { AdminMetric, StatusPill } from "./pieces";

export function SmartRiskOperations() {
  const [alerts, setAlerts] = useState(initialRiskAlerts);
  const [selectedId, setSelectedId] = useState(initialRiskAlerts[0].id);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("All severity");
  const [simulating, setSimulating] = useState(false);
  const selected = alerts.find((item) => item.id === selectedId) || alerts[0];
  const visible = alerts.filter((item) => {
    const matchText = `${item.id} ${item.merchant} ${item.signal} ${item.type}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return (
      matchText && (severity === "All severity" || item.severity === severity)
    );
  });
  const { pageRows, pagination } = useClientPagination(visible);

  const updateStatus = (status: string) => {
    setAlerts((items) =>
      items.map((item) =>
        item.id === selected.id ? { ...item, status } : item,
      ),
    );
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          icon={Siren}
          label="Critical alerts"
          value="4"
          note="2 auto-blocked"
          tone="danger"
        />
        <AdminMetric
          icon={CircleDollarSign}
          label="Funds protected"
          value="Rp81,8jt"
          note="Across 19 merchants"
          tone="warning"
        />
        <AdminMetric
          icon={Gauge}
          label="Signals evaluated"
          value="2,84jt"
          note="Last 24 hours"
        />
        <AdminMetric
          icon={ShieldCheck}
          label="Decision accuracy"
          value="95,8%"
          note="4,2% false positive"
          tone="success"
        />
      </div>

      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <div className="relative overflow-hidden bg-[#101728] p-6 text-white">
          <div className="absolute -top-28 -right-20 size-72 rounded-full bg-[#ef665d]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
            <span className="grid size-14 place-items-center rounded-[18px] bg-[#ef665d] shadow-xl shadow-[#ef665d]/20">
              <ShieldAlert className="size-7" />
            </span>
            <div>
              <p className="text-[8px] font-extrabold tracking-[.18em] text-[#ef8d86] uppercase">
                Smart risk engine
              </p>
              <h2 className="mt-2 text-xl font-black">
                Real-time merchant threat detection
              </h2>
              <p className="mt-2 max-w-2xl text-[9px] leading-5 text-white/50">
                Rules, graph relationships, device intelligence, KYC similarity,
                and transaction velocity combine into explainable decisions.
                Every automatic hold remains reviewable.
              </p>
            </div>
            <button
              onClick={() => {
                setSimulating(true);
                setTimeout(() => setSimulating(false), 1200);
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[8px] font-extrabold text-[#11182a] lg:ml-auto"
            >
              {simulating ? (
                <RefreshCcw className="size-3.5 animate-spin" />
              ) : (
                <Zap className="size-3.5" />
              )}
              {simulating ? "Evaluating scenario..." : "Run rule simulator"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe3ec] bg-white px-3 text-[#7c879d]">
            <Search className="size-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search merchant, signal, or case..."
              className="min-w-0 flex-1 bg-transparent text-[9px] outline-none"
            />
          </label>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[9px] font-bold"
          >
            {["All severity", "Critical", "High", "Medium"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 border-r border-[#e5e8ef]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#8490a5] uppercase">
                  <tr>
                    {[
                      "Case",
                      "Merchant & signal",
                      "Risk",
                      "Automated action",
                      "Status",
                      "",
                    ].map((label) => (
                      <th key={label} className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "cursor-pointer border-t border-[#e8eaf0] text-[9px] transition",
                        selectedId === item.id
                          ? "bg-[#f1f4ff]"
                          : "hover:bg-[#fafbfc]",
                      )}
                    >
                      <td className="px-4 py-4 font-mono font-bold text-[#536fdf]">
                        {item.id}
                      </td>
                      <td>
                        <b className="block text-[9px]">{item.merchant}</b>
                        <span className="mt-1 block max-w-[260px] text-[8px] text-[#7c879d]">
                          {item.signal}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              item.severity === "Critical"
                                ? "bg-[#e75750]"
                                : item.severity === "High"
                                  ? "bg-[#e99730]"
                                  : "bg-[#5b7cfa]",
                            )}
                          />
                          <b>{item.score}</b>
                          <span className="text-[8px] text-[#7c879d]">
                            {item.severity}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[180px] text-[8px] text-[#667188]">
                        {item.action}
                      </td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>
                        <ChevronRight className="size-4 text-[#8b95a8]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination {...pagination} />
          </div>

          <RiskCaseDetail selected={selected} updateStatus={updateStatus} />
        </div>
      </section>

      <section className={`${adminPanel} mt-4 p-5`}>
        <div className="flex items-center">
          <div>
            <h3 className="text-xs font-black">Detection policy matrix</h3>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              Production rules remain versioned, testable, and reversible.
            </p>
          </div>
          <button className="ml-auto flex h-9 items-center gap-2 rounded-xl border border-[#dce1e9] px-3 text-[8px] font-extrabold">
            <Play className="size-3.5" /> Shadow-test policy
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["New merchant velocity", "> Rp25jt / first 2h", "Auto hold"],
            ["Bank-name similarity", "< 0.78", "Block payout"],
            ["Device cluster", "> 8 identities", "Open case"],
            ["IP reputation", "Threat score > 80", "Step-up MFA"],
          ].map(([name, threshold, action]) => (
            <div key={name} className="rounded-2xl border border-[#e1e5ed] p-4">
              <Activity className="size-4 text-[#5b7cfa]" />
              <b className="mt-4 block text-[9px]">{name}</b>
              <code className="mt-2 block text-[8px] text-[#687389]">
                {threshold}
              </code>
              <span className="mt-3 inline-flex rounded-lg bg-[#eef1f8] px-2 py-1 text-[7px] font-extrabold text-[#536fdf]">
                {action}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
