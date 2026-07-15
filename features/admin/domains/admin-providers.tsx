"use client";

import {
  Activity,
  AlertTriangle,
  Banknote,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  LoaderCircle,
  Network,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { EmergencySwitchboard } from "@/features/admin/operations/emergency";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";

const baseProviders = [
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

function AiProvider({
  test,
  testing,
  tested,
}: {
  test: () => void;
  testing: boolean;
  tested: boolean;
}) {
  const [tab, setTab] = useState("Overview");
  const [enabled, setEnabled] = useState(true);
  const [playground, setPlayground] = useState(false);
  const [prompt, setPrompt] = useState(
    "Ringkas insiden callback pembayaran untuk tim operations.",
  );
  const [answer, setAnswer] = useState("");
  const generations = [
    [
      "gen_91KA",
      "dinda@fersaku.id",
      "incident.summary",
      "fersaku-ops-v1",
      "842",
      "Allowed",
      "2m",
    ],
    [
      "gen_91K8",
      "risk@fersaku.id",
      "risk.case",
      "fersaku-ops-v1",
      "1.284",
      "Allowed",
      "4m",
    ],
    [
      "gen_91J2",
      "support@fersaku.id",
      "support.draft",
      "fersaku-ops-v1",
      "622",
      "Allowed",
      "18m",
    ],
    [
      "gen_91H7",
      "unknown",
      "prompt.injection",
      "safety-classifier",
      "194",
      "Blocked",
      "31m",
    ],
    [
      "gen_91F1",
      "security@fersaku.id",
      "audit.summary",
      "fersaku-ops-v1",
      "514",
      "Allowed",
      "1h",
    ],
    [
      "gen_91D4",
      "admin@fersaku.id",
      "policy.review",
      "safety-classifier",
      "331",
      "Allowed",
      "2h",
    ],
    [
      "gen_91C2",
      "ops@fersaku.id",
      "incident.summary",
      "fersaku-ops-v1",
      "901",
      "Allowed",
      "3h",
    ],
    [
      "gen_91B9",
      "risk@fersaku.id",
      "risk.case",
      "safety-classifier",
      "412",
      "Blocked",
      "4h",
    ],
  ];
  const { pageRows, pagination } = useClientPagination(generations);
  return (
    <>
      <section className={`${panel} overflow-hidden`}>
        <div className="relative overflow-hidden bg-[#261429] p-6 text-white sm:p-7">
          <div className="absolute -top-24 -right-10 size-64 rounded-full bg-[#f05a7e]/15 blur-2xl" />
          <div className="relative flex items-start">
            <span className="grid size-14 place-items-center rounded-[18px] bg-[#f05a7e] text-white">
              <BrainCircuit className="size-7" />
            </span>
            <div className="ml-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">Fersaku AI Gateway</h2>
                <span className="rounded-full bg-[#ffd2df] px-2 py-1 text-[7px] font-black text-[#6d1733]">
                  GUARDED
                </span>
              </div>
              <p className="mt-2 text-[9px] text-white/50">
                Product copy, storefront writing, SEO, release notes, and
                campaign assistance
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusChip icon={CheckCircle2} text="Operational" />
                <StatusChip icon={Bot} text="3 model routes" />
                <StatusChip icon={ShieldCheck} text="Safety filters active" />
              </div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "relative ml-auto h-6 w-11 rounded-full",
                enabled ? "bg-[#f05a7e]" : "bg-white/20",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 size-4 rounded-full bg-white transition",
                  enabled ? "left-6" : "left-1",
                )}
              />
            </button>
          </div>
        </div>
        <div className="flex overflow-x-auto border-b border-[#e5e8ef] px-4">
          {[
            "Overview",
            "Models & routing",
            "Safety & privacy",
            "Generation audit",
            "Credentials",
          ].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-4 text-[9px] font-extrabold",
                tab === item
                  ? "border-[#f05a7e] text-[#c84065]"
                  : "border-transparent text-[#7c879d]",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "Overview" && (
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Generations today", "4.821", "+31%"],
                ["Median latency", "692 ms", "-84 ms"],
                ["Safety blocks", "28", "0.58%"],
                ["Estimated cost", "Rp184rb", "Within budget"],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-2xl bg-[#f4f6f9] p-4">
                  <span className="text-[7px] font-extrabold tracking-wider text-[#8490a5] uppercase">
                    {label}
                  </span>
                  <b className="mt-2 block text-lg">{value}</b>
                  <span className="mt-1 text-[7px] text-[#c84065]">{note}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#e2e6ed] p-5">
                <Gauge className="size-4 text-[#c84065]" />
                <h3 className="mt-4 text-[9px] font-black">Route health</h3>
                <div className="mt-4 grid gap-3">
                  {[
                    ["Copy generation", "99.94%", "692 ms"],
                    ["Safety classifier", "99.99%", "118 ms"],
                    ["Embedding / similarity", "99.92%", "224 ms"],
                  ].map(([label, uptime, latency]) => (
                    <div
                      key={label}
                      className="flex items-center rounded-xl bg-[#f7f8fa] p-3"
                    >
                      <span className="size-2 rounded-full bg-[#28a566]" />
                      <b className="ml-2 text-[8px]">{label}</b>
                      <span className="ml-auto text-[7px] text-[#707a90]">
                        {uptime} • {latency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-[#e2e6ed] p-5">
                <Sparkles className="size-4 text-[#c84065]" />
                <h3 className="mt-4 text-[9px] font-black">
                  Supported surfaces
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "Product title",
                    "Short description",
                    "Long description",
                    "Store bio",
                    "SEO metadata",
                    "Release notes",
                    "Campaign copy",
                  ].map((surface) => (
                    <span
                      key={surface}
                      className="rounded-lg bg-[#f8edf1] px-2 py-1.5 text-[7px] font-bold text-[#8f3652]"
                    >
                      {surface}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={test}
                className="flex h-10 items-center gap-2 rounded-xl bg-[#11182a] px-4 text-[8px] font-extrabold text-white"
              >
                {testing ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : tested ? (
                  <Check className="size-3.5" />
                ) : (
                  <Zap className="size-3.5" />
                )}
                {testing
                  ? "Testing routes..."
                  : tested
                    ? "All routes healthy"
                    : "Test AI routes"}
              </button>
              <button
                onClick={() => setPlayground(true)}
                className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] px-4 text-[8px] font-extrabold"
              >
                <Sparkles className="size-3.5" /> Open safe playground
              </button>
            </div>
          </div>
        )}
        {tab === "Models & routing" && (
          <div className="p-5">
            <div className="grid gap-3">
              {[
                [
                  "fersaku-copy-v1",
                  "Primary",
                  "Product and storefront copy",
                  "8k context",
                  "Active",
                ],
                [
                  "fersaku-fast-v1",
                  "Fallback",
                  "Short titles and rewrites",
                  "4k context",
                  "Active",
                ],
                [
                  "safety-classifier",
                  "Mandatory pre/post filter",
                  "PII, abuse, prompt injection",
                  "2k context",
                  "Active",
                ],
              ].map(([model, route, use, context, status]) => (
                <div
                  key={model}
                  className="grid gap-3 rounded-2xl border border-[#e2e6ed] p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto] sm:items-center"
                >
                  <div>
                    <b className="block font-mono text-[8px]">{model}</b>
                    <span className="text-[7px] text-[#707a90]">{route}</span>
                  </div>
                  <span className="text-[8px]">{context}</span>
                  <span className="text-[8px] text-[#707a90]">{use}</span>
                  <span className="rounded-full bg-[#e7f6ec] px-2 py-1 text-[7px] font-extrabold text-[#238150]">
                    {status}
                  </span>
                  <button className="text-[8px] font-extrabold text-[#536fdf]">
                    Configure
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "Safety & privacy" && (
          <div className="p-5">
            <div className="rounded-2xl border border-[#f0d69e] bg-[#fff8e8] p-4 text-[8px] leading-4 text-[#7c6a45]">
              <AlertTriangle className="mr-2 inline size-3.5" />
              AI output is assistive. Sellers remain responsible for
              truthfulness, licensing, and prohibited claims.
            </div>
            <div className="mt-4 grid gap-2">
              {[
                ["Block secrets and credentials in prompts", true],
                ["Redact buyer PII before model routing", true],
                ["Detect prompt injection", true],
                ["Store full prompts for 30-day audit", false],
                ["Require human review before publish", true],
                ["Allow model training on merchant data", false],
              ].map(([label, active]) => (
                <AiPolicy
                  key={label as string}
                  label={label as string}
                  defaultActive={active as boolean}
                />
              ))}
            </div>
          </div>
        )}
        {tab === "Generation audit" && (
          <div className="p-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left">
                <thead className="bg-[#f7f8fa] text-[7px] tracking-wider text-[#8490a5] uppercase">
                  <tr>
                    {[
                      "Generation ID",
                      "Actor",
                      "Surface",
                      "Model",
                      "Tokens",
                      "Result",
                      "Age",
                      "Inspect",
                    ].map((label) => (
                      <th key={label} className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row[0]}
                      className="border-t border-[#e8eaf0] text-[8px]"
                    >
                      <td className="px-4 py-4 font-mono text-[#536fdf]">
                        {row[0]}
                      </td>
                      <td>{row[1]}</td>
                      <td className="font-mono">{row[2]}</td>
                      <td>{row[3]}</td>
                      <td>{row[4]}</td>
                      <td>
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 font-extrabold",
                            row[5] === "Allowed"
                              ? "bg-[#e7f6ec] text-[#238150]"
                              : "bg-[#fff0eb] text-[#b55039]",
                          )}
                        >
                          {row[5]}
                        </span>
                      </td>
                      <td>{row[6]}</td>
                      <td>
                        <Eye className="size-3.5 text-[#536fdf]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination {...pagination} />
          </div>
        )}
        {tab === "Credentials" && (
          <div className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Credential
                label="Primary route key"
                value="••••••••••••copy_91K"
                shown={false}
              />
              <Credential
                label="Fallback route key"
                value="••••••••••••fast_82J"
                shown={false}
              />
              <Credential
                label="Safety service key"
                value="••••••••••••safe_11M"
                shown={false}
              />
              <Credential
                label="Webhook signing secret"
                value="••••••••••••hook_42P"
                shown={false}
              />
            </div>
            <button className="mt-5 h-10 rounded-xl border border-[#dce1e9] px-4 text-[8px] font-extrabold">
              Rotate AI credentials
            </button>
          </div>
        )}
      </section>
      {playground && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#07101e]/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[24px] bg-white p-6 text-[#131827] shadow-2xl">
            <div className="flex items-start">
              <div>
                <p className="text-[8px] font-extrabold tracking-[.16em] text-[#c84065] uppercase">
                  Admin safe playground
                </p>
                <h2 className="mt-2 text-lg font-black">
                  Test guarded generation
                </h2>
              </div>
              <button
                onClick={() => setPlayground(false)}
                className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
              >
                <X className="size-4" />
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              className="mt-5 w-full resize-none rounded-xl border border-[#dce1e9] p-3 text-xs"
            />
            <button
              onClick={() =>
                setAnswer("Prompt OS — Sistem AI Praktis untuk Kerja Kreatif")
              }
              className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-[#261429] px-4 text-[8px] font-extrabold text-white"
            >
              <Sparkles className="size-3.5" /> Generate guarded response
            </button>
            {answer && (
              <div className="mt-4 rounded-2xl bg-[#f8edf1] p-4">
                <b className="text-[8px] text-[#8f3652]">
                  Allowed • safety score 0.98
                </b>
                <p className="mt-2 text-sm font-bold">{answer}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AiPolicy({
  label,
  defaultActive,
}: {
  label: string;
  defaultActive: boolean;
}) {
  const [active, setActive] = useState(defaultActive);
  return (
    <div className="flex items-center rounded-xl border border-[#e2e6ed] p-4">
      <ShieldCheck className="size-4 text-[#c84065]" />
      <b className="ml-3 text-[8px]">{label}</b>
      <button
        onClick={() => setActive(!active)}
        className={cn(
          "relative ml-auto h-5 w-9 rounded-full",
          active ? "bg-[#c84065]" : "bg-[#cbd2de]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-3 rounded-full bg-white transition",
            active ? "left-5" : "left-1",
          )}
        />
      </button>
    </div>
  );
}


function GenericProvider({
  provider,
  test,
  testing,
  tested,
}: {
  provider: (typeof baseProviders)[number];
  test: () => void;
  testing: boolean;
  tested: boolean;
}) {
  const Icon = provider.icon;
  return (
    <section className={`${panel} p-6`}>
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
function StatusChip({
  icon: Icon,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[7px] font-bold text-white/75">
      <Icon className="size-3" />
      {text}
    </span>
  );
}
function BadgeIcon({ className }: { className?: string }) {
  return <CircleDot className={className} />;
}
function Credential({
  label,
  value,
  shown,
  action,
}: {
  label: string;
  value: string;
  shown: boolean;
  action?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#e2e6ed] p-4">
      <span className="text-[7px] font-extrabold tracking-wider text-[#8490a5] uppercase">
        {label}
      </span>
      <div className="mt-3 flex items-center">
        <code className="min-w-0 flex-1 truncate text-[9px] font-bold">
          {value}
        </code>
        {action && (
          <button
            onClick={action}
            className="ml-2 grid size-8 place-items-center rounded-lg border border-[#dce1e9]"
          >
            {shown ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </button>
        )}
        <button className="ml-1 grid size-8 place-items-center rounded-lg border border-[#dce1e9]">
          <Copy className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
function RoutingCard({
  title,
  value,
  note,
  active,
}: {
  title: string;
  value: string;
  note: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e2e6ed] p-4">
      <div className="flex items-center">
        <b className="text-[8px]">{title}</b>
        <span
          className={cn(
            "ml-auto size-2 rounded-full",
            active ? "bg-[#25a85a]" : "bg-[#cbd2de]",
          )}
        />
      </div>
      <p className="mt-3 text-[10px] font-black">{value}</p>
      <span className="mt-1 block text-[7px] text-[#7c879d]">{note}</span>
    </div>
  );
}
function Limit({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2 text-[7px] font-bold text-[#7c879d]">
      {label}
      <input
        defaultValue={value}
        className="h-10 rounded-xl border border-[#dce1e9] px-3 text-[9px] font-bold text-[#131827]"
      />
    </label>
  );
}
