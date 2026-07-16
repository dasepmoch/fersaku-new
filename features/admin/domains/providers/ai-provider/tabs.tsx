"use client";

import {
  AlertTriangle,
  Check,
  Eye,
  Gauge,
  LoaderCircle,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { AiPolicy } from "../ai-policy";
import { Credential } from "../pieces";

export function OverviewTab({
  test,
  testing,
  tested,
  onOpenPlayground,
}: {
  test: () => void;
  testing: boolean;
  tested: boolean;
  onOpenPlayground: () => void;
}) {
  return (
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
          <h3 className="mt-4 text-[9px] font-black">Supported surfaces</h3>
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
          onClick={onOpenPlayground}
          className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] px-4 text-[8px] font-extrabold"
        >
          <Sparkles className="size-3.5" /> Open safe playground
        </button>
      </div>
    </div>
  );
}

export function ModelsRoutingTab() {
  return (
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
  );
}

export function SafetyPrivacyTab() {
  return (
    <div className="p-5">
      <div className="rounded-2xl border border-[#f0d69e] bg-[#fff8e8] p-4 text-[8px] leading-4 text-[#7c6a45]">
        <AlertTriangle className="mr-2 inline size-3.5" />
        AI output is assistive. Sellers remain responsible for truthfulness,
        licensing, and prohibited claims.
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
  );
}

export function GenerationAuditTab({
  pageRows,
  pagination,
}: {
  pageRows: string[][];
  pagination: ComponentProps<typeof TablePagination>;
}) {
  return (
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
              <tr key={row[0]} className="border-t border-[#e8eaf0] text-[8px]">
                <td className="px-4 py-4 font-mono text-[#536fdf]">{row[0]}</td>
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
  );
}

export function CredentialsTab() {
  return (
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
  );
}
