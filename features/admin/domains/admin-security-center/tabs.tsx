"use client";

import { adminPanel } from "@/features/admin/ui";

import {
  AlertOctagon,
  Eye,
  Fingerprint,
  KeyRound,
  Laptop,
  LockKeyhole,
  Search,
  Smartphone,
} from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { Policy } from "./pieces";

export function PostureTab() {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className={`${adminPanel} p-5`}>
        <h3 className="text-[11px] font-black">Control coverage</h3>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Administrator MFA", "100%", "Healthy"],
            ["Staff least privilege", "96%", "Healthy"],
            ["Provider secret rotation", "92%", "Review"],
            ["Session risk checks", "100%", "Healthy"],
            ["Impersonation safeguards", "100%", "Healthy"],
            ["Audit event integrity", "100%", "Healthy"],
          ].map(([label, value, status]) => (
            <div
              key={label}
              className="rounded-2xl border border-[#e2e6ed] p-4"
            >
              <div className="flex items-center">
                <b className="text-[8px]">{label}</b>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-1 text-[7px] font-extrabold",
                    status === "Healthy"
                      ? "bg-[#e7f6ec] text-[#238150]"
                      : "bg-[#fff0d9] text-[#9a6b20]",
                  )}
                >
                  {status}
                </span>
              </div>
              <b className="mt-4 block text-xl">{value}</b>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf0f4]">
                <div
                  className="h-full rounded-full bg-[#5b7cfa]"
                  style={{ width: value }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className={`${adminPanel} p-5`}>
        <AlertOctagon className="size-5 text-[#e59633]" />
        <h3 className="mt-5 text-[11px] font-black">Recommendations</h3>
        <div className="mt-4 grid gap-3">
          {[
            ["Rotate legacy Duitku secret", "Due in 4 days"],
            ["Review 2 dormant staff accounts", "No login for 90 days"],
            ["Tighten inventory reveal scope", "3 roles currently allowed"],
          ].map(([title, note], index) => (
            <div key={title} className="rounded-2xl bg-[#f7f8fa] p-4">
              <span className="text-[7px] font-extrabold text-[#e59633]">
                0{index + 1}
              </span>
              <b className="mt-2 block text-[8px]">{title}</b>
              <span className="mt-1 block text-[7px] text-[#707a90]">
                {note}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function SecurityEventsTab({
  query,
  setQuery,
  pageRows,
  pagination,
  setSelected,
}: {
  query: string;
  setQuery: (value: string) => void;
  pageRows: string[][];
  pagination: ComponentProps<typeof TablePagination>;
  setSelected: (row: string[]) => void;
}) {
  return (
    <section className={`${adminPanel} mt-5 overflow-hidden`}>
      <div className="flex items-center border-b border-[#e5e8ef] p-4">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe3eb] px-3">
          <Search className="size-3.5 text-[#7c879d]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search event, actor, IP, target..."
            className="min-w-0 flex-1 bg-transparent text-[9px] outline-none"
          />
        </label>
        <button className="ml-2 h-10 rounded-xl border border-[#dfe3eb] px-3 text-[8px] font-bold">
          Last 24 hours
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead className="bg-[#f7f8fa] text-[7px] tracking-wider text-[#8490a5] uppercase">
            <tr>
              {[
                "Event",
                "Signal",
                "Actor",
                "Context",
                "Severity",
                "Status",
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
                <td className="font-bold">{row[1]}</td>
                <td>{row[2]}</td>
                <td>{row[3]}</td>
                <td>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 font-extrabold",
                      row[4] === "High"
                        ? "bg-[#fff0eb] text-[#b55039]"
                        : row[4] === "Medium"
                          ? "bg-[#fff0d9] text-[#9a6b20]"
                          : "bg-[#e7f6ec] text-[#238150]",
                    )}
                  >
                    {row[4]}
                  </span>
                </td>
                <td>{row[5]}</td>
                <td>{row[6]}</td>
                <td>
                  <button onClick={() => setSelected(row)}>
                    <Eye className="size-3.5 text-[#536fdf]" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination {...pagination} />
    </section>
  );
}

export function AdminSessionsTab() {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {[
        [
          Smartphone,
          "Dinda Kusuma",
          "Chrome • Android • Jakarta",
          "Current",
          "180.252.81.42",
        ],
        [
          Laptop,
          "Super Admin",
          "Chrome • Linux • Jakarta",
          "8m ago",
          "103.28.54.11",
        ],
        [
          Laptop,
          "Finance Ops",
          "Safari • macOS • Bandung",
          "1h ago",
          "36.85.22.194",
        ],
        [
          Smartphone,
          "Risk Analyst",
          "Chrome • Android • Surabaya",
          "3h ago",
          "114.122.81.7",
        ],
      ].map(([Icon, name, device, active, ip]) => (
        <section key={name as string} className={`${adminPanel} p-5`}>
          <div className="flex items-center">
            <span className="grid size-10 place-items-center rounded-xl bg-[#eef1ff] text-[#536fdf]">
              <Icon className="size-4" />
            </span>
            <div className="ml-3">
              <b className="block text-[9px]">{name as string}</b>
              <span className="text-[7px] text-[#707a90]">
                {device as string}
              </span>
            </div>
            <span className="ml-auto text-[7px] font-bold text-[#238150]">
              {active as string}
            </span>
          </div>
          <div className="mt-4 flex items-center border-t border-[#e8eaf0] pt-3 text-[7px] text-[#707a90]">
            <Fingerprint className="mr-2 size-3" />
            {ip as string}
            <button className="ml-auto font-extrabold text-[#b55039]">
              Revoke
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

export function SecretAccessTab() {
  return (
    <section className={`${adminPanel} mt-5 p-5`}>
      <div className="flex items-center">
        <LockKeyhole className="size-5 text-[#536fdf]" />
        <div className="ml-3">
          <h3 className="text-[10px] font-black">Privileged secret access</h3>
          <p className="mt-1 text-[8px] text-[#707a90]">
            Provider tokens, API keys, inventory secrets, and recovery codes.
          </p>
        </div>
        <span className="ml-auto rounded-full bg-[#e7f6ec] px-2 py-1 text-[7px] font-extrabold text-[#238150]">
          Fully audited
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Email API token", "dinda@fersaku.id", "18m ago"],
          ["Duitku merchant key", "superadmin@fersaku.id", "2d ago"],
          ["Inventory credential", "risk@fersaku.id", "4d ago"],
        ].map(([secret, actor, time]) => (
          <div key={secret} className="rounded-2xl border border-[#e2e6ed] p-4">
            <KeyRound className="size-4 text-[#536fdf]" />
            <b className="mt-4 block text-[8px]">{secret}</b>
            <span className="mt-2 block text-[7px] text-[#707a90]">
              {actor}
            </span>
            <span className="mt-1 block text-[7px] text-[#707a90]">{time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PoliciesTab() {
  return (
    <div className="mt-5 grid gap-3">
      {[
        ["Require MFA for every administrator", true],
        ["Block login from anonymizing networks", true],
        ["Require re-authentication for secret reveal", true],
        ["Auto-revoke dormant staff after 90 days", false],
        ["Restrict impersonation to read-only by default", true],
        ["Require two-person approval for provider rotation", false],
      ].map(([label, enabled]) => (
        <Policy
          key={label as string}
          label={label as string}
          defaultEnabled={enabled as boolean}
        />
      ))}
    </div>
  );
}
