"use client";

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  ChevronRight,
  CircleDollarSign,
  FileSearch,
  Gauge,
  LockKeyhole,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
const initialRiskAlerts = [
  {
    id: "RSK-9281",
    merchant: "Flash Deals Nusantara",
    signal: "Rp50.000.000 GMV dalam 58 menit pertama",
    severity: "Critical",
    score: 96,
    type: "Velocity anomaly",
    evidence: [
      "632 QRIS intents dari 14 device",
      "Median basket Rp79.114",
      "91% buyer baru dari satu /24 subnet",
    ],
    action: "Payout ditahan otomatis; checkout tetap read-only",
    status: "Open",
  },
  {
    id: "RSK-9278",
    merchant: "Budi Design Vault",
    signal: "Nama rekening payout berbeda dengan identitas KYC",
    severity: "High",
    score: 88,
    type: "Bank-name mismatch",
    evidence: [
      "KYC: BUDI SETIAWAN",
      "Rekening BCA: BUDI SANTOSO",
      "Similarity score hanya 0,61",
    ],
    action: "Withdrawal diblokir; reverifikasi bank diminta",
    status: "Open",
  },
  {
    id: "RSK-9269",
    merchant: "Prompt Factory ID",
    signal: "18 akun buyer memakai fingerprint perangkat yang sama",
    severity: "High",
    score: 82,
    type: "Device reuse",
    evidence: [
      "18 email unik",
      "Satu canvas fingerprint",
      "Kupon yang sama dipakai berulang",
    ],
    action: "Payout ditahan sementara",
    status: "Investigating",
  },
  {
    id: "RSK-9251",
    merchant: "NotionKita",
    signal: "Pola pembayaran sirkular antar akun terhubung",
    severity: "Medium",
    score: 69,
    type: "Circular payments",
    evidence: [
      "4 merchant berbagi IP admin",
      "Email beririsan",
      "Refund ratio 17,2%",
    ],
    action: "Enhanced monitoring selama 72 jam",
    status: "Monitoring",
  },
  {
    id: "RSK-9240",
    merchant: "Digital Supply ID",
    signal: "Spike refund 12% dalam 6 jam",
    severity: "Medium",
    score: 64,
    type: "Refund spike",
    evidence: [
      "18 refund requests",
      "Same product SKU cluster",
      "Buyer emails share provider domain",
    ],
    action: "Manual review queue",
    status: "Open",
  },
  {
    id: "RSK-9232",
    merchant: "Asep AI Tools",
    signal: "Checkout bot fingerprint score tinggi",
    severity: "High",
    score: 79,
    type: "Bot traffic",
    evidence: [
      "Headless browser signals",
      "Uniform user-agent",
      "Low dwell time",
    ],
    action: "Captcha challenge enabled",
    status: "Investigating",
  },
];
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

      <section className={`${panel} mt-4 overflow-hidden`}>
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

          <aside className="p-5">
            <div className="flex items-start">
              <div>
                <p className="font-mono text-[8px] font-bold text-[#536fdf]">
                  {selected.id}
                </p>
                <h3 className="mt-1 text-sm font-black">{selected.type}</h3>
              </div>
              <RiskScore score={selected.score} />
            </div>
            <p className="mt-4 text-[10px] leading-5 font-extrabold">
              {selected.signal}
            </p>
            <div className="mt-5 rounded-2xl bg-[#f6f7fa] p-4">
              <p className="text-[8px] font-extrabold tracking-wider text-[#7c879d] uppercase">
                Evidence bundle
              </p>
              <div className="mt-3 grid gap-2">
                {selected.evidence.map((item) => (
                  <div key={item} className="flex gap-2 text-[8px] leading-4">
                    <FileSearch className="mt-0.5 size-3.5 shrink-0 text-[#5b7cfa]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[#f0d69e] bg-[#fff8e8] p-4 text-[8px] leading-4 text-[#7c6a45]">
              <LockKeyhole className="mr-2 inline size-3.5" />
              {selected.action}
            </div>
            <label className="mt-4 grid gap-2 text-[8px] font-extrabold">
              Investigator note
              <textarea
                rows={3}
                defaultValue="Review device graph, KYC documents, and provider settlement evidence before releasing funds."
                className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] font-normal outline-none"
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => updateStatus("Investigating")}
                className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-extrabold"
              >
                Assign to me
              </button>
              <button
                onClick={() => updateStatus("Escalated")}
                className="h-10 rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
              >
                Escalate case
              </button>
              <button
                onClick={() => updateStatus("Released")}
                className="h-10 rounded-xl border border-[#b9dec8] bg-[#eff9f2] text-[8px] font-extrabold text-[#277a4b]"
              >
                Release hold
              </button>
              <button
                onClick={() => updateStatus("Restricted")}
                className="h-10 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white"
              >
                Restrict merchant
              </button>
            </div>
            <p className="mt-3 text-[7px] leading-4 text-[#8a94a7]">
              All decisions append actor, reason, evidence snapshot, previous
              state, and policy version to the immutable audit trail.
            </p>
          </aside>
        </div>
      </section>

      <section className={`${panel} mt-4 p-5`}>
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
function AdminMetric({
  icon: Icon,
  label,
  value,
  note,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const colors =
    tone === "danger"
      ? "bg-[#fff0ee] text-[#c9544d]"
      : tone === "warning"
        ? "bg-[#fff5df] text-[#ad741f]"
        : tone === "success"
          ? "bg-[#e7f6ec] text-[#238150]"
          : "bg-[#edf1fb] text-[#536fdf]";
  return (
    <div className={`${panel} p-5`}>
      <div className="flex items-start">
        <span
          className={cn("grid size-10 place-items-center rounded-xl", colors)}
        >
          <Icon className="size-4" />
        </span>
        <ArrowRight className="ml-auto size-4 text-[#a0a8b7]" />
      </div>
      <p className="mt-5 text-[8px] font-extrabold tracking-[.12em] text-[#7c879d] uppercase">
        {label}
      </p>
      <b className="mt-1 block text-xl tracking-[-.04em]">{value}</b>
      <span className="mt-1 block text-[8px] text-[#7c879d]">{note}</span>
    </div>
  );
}
function StatusPill({ value }: { value: string }) {
  const positive = [
    "200",
    "PAID",
    "COMPLETED",
    "Completed",
    "Fulfilled",
    "Released",
    "Approved",
  ].includes(value);
  const warning = [
    "Pending",
    "Timeout",
    "Manual",
    "Investigating",
    "Monitoring",
    "Open",
  ].includes(value);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[7px] font-extrabold",
        positive
          ? "bg-[#e7f6ec] text-[#238150]"
          : warning
            ? "bg-[#fff5df] text-[#9b6a1f]"
            : "bg-[#fff0ee] text-[#c9544d]",
      )}
    >
      {value}
    </span>
  );
}
function RiskScore({ score }: { score: number }) {
  return (
    <div className="ml-auto text-right">
      <p className="text-[7px] font-extrabold text-[#7c879d] uppercase">
        Risk score
      </p>
      <b className="mt-1 block text-2xl text-[#d95750]">{score}</b>
    </div>
  );
}
