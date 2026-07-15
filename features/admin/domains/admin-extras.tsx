"use client";

import {
  Download,
  Eye,
  FileClock,
  Filter,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { auditEvents } from "@/lib/admin-mock-data";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
const categoryOf = (actor: string) =>
  actor === "system"
    ? "System"
    : actor.endsWith("@fersaku.id")
      ? "Administrator"
      : "Seller";

export function AdminAuditExplorer() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All actors");
  const [action, setAction] = useState("All actions");
  const [result, setResult] = useState("All results");
  const [selected, setSelected] = useState<(typeof auditEvents)[number] | null>(
    null,
  );
  const [exported, setExported] = useState(false);
  const actions = [...new Set(auditEvents.map((e) => e.action))];
  const rows = useMemo(
    () =>
      auditEvents.filter((event) => {
        const haystack = Object.values(event).join(" ").toLowerCase();
        return (
          haystack.includes(query.toLowerCase()) &&
          (category === "All actors" || categoryOf(event.actor) === category) &&
          (action === "All actions" || event.action === action) &&
          (result === "All results" || event.result === result)
        );
      }),
    [query, category, action, result],
  );
  const { pageRows, pagination } = useClientPagination(rows);
  return (
    <>
      <section className={`${panel} overflow-hidden`}>
        <div className="border-b border-[#e5e8ef] p-4">
          <div className="grid gap-3 xl:grid-cols-[1fr_repeat(4,auto)]">
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-[#dfe3eb] bg-white px-3">
              <Search className="size-3.5 text-[#7c879d]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search event, actor, target, IP..."
                className="min-w-0 flex-1 bg-transparent text-[10px] outline-none"
              />
            </label>
            <AuditSelect
              value={category}
              onChange={setCategory}
              options={["All actors", "Administrator", "Seller", "System"]}
            />
            <AuditSelect
              value={action}
              onChange={setAction}
              options={["All actions", ...actions]}
            />
            <AuditSelect
              value={result}
              onChange={setResult}
              options={["All results", "Success", "Blocked"]}
            />
            <button
              onClick={() => {
                setExported(true);
                setTimeout(() => setExported(false), 1800);
              }}
              className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe3eb] bg-white px-3 text-[9px] font-extrabold"
            >
              <Download className="size-3.5" />{" "}
              {exported ? "Export queued" : "Export CSV"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[8px] text-[#707a90]">
            <Filter className="size-3" /> Showing {rows.length} of{" "}
            {auditEvents.length} mock events • Date range: last 24 hours
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left">
            <thead className="bg-[#f7f8fa] text-[8px] font-extrabold tracking-wider text-[#707a90] uppercase">
              <tr>
                {[
                  "Event ID",
                  "Timestamp",
                  "Actor",
                  "Category",
                  "Action",
                  "Target",
                  "IP address",
                  "Result",
                  "Context",
                ].map((x) => (
                  <th key={x} className="px-5 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((event) => (
                <tr
                  key={event.id}
                  className="border-t border-[#e8eaf0] text-[9px]"
                >
                  <td className="px-5 py-4 font-mono text-[#536fdf]">
                    {event.id}
                  </td>
                  <td>{event.time}</td>
                  <td className="font-bold">{event.actor}</td>
                  <td>
                    <span className="rounded-full bg-[#eef1f6] px-2 py-1 font-bold">
                      {categoryOf(event.actor)}
                    </span>
                  </td>
                  <td>
                    <code className="rounded bg-[#f1f3f7] px-2 py-1.5 font-bold">
                      {event.action}
                    </code>
                  </td>
                  <td className="font-mono">{event.target}</td>
                  <td className="font-mono text-[#6f7a90]">{event.ip}</td>
                  <td>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 font-extrabold",
                        event.result === "Success"
                          ? "bg-[#e7f6ec] text-[#238150]"
                          : "bg-[#fff0eb] text-[#b55039]",
                      )}
                    >
                      {event.result}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setSelected(event)}
                      className="text-[#5b7cfa]"
                    >
                      <Eye className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="py-16 text-center">
              <FileClock className="mx-auto size-8 text-[#9ba6bb]" />
              <b className="mt-4 block text-xs">
                No audit events match these filters
              </b>
              <button
                onClick={() => {
                  setQuery("");
                  setCategory("All actors");
                  setAction("All actions");
                  setResult("All results");
                }}
                className="mt-3 text-[9px] font-extrabold text-[#536fdf]"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
        <TablePagination {...pagination} />
        <div className="flex items-center justify-between border-t border-[#e5e8ef] px-5 py-4 text-[9px] text-[#707a90]">
          <span>Immutable retention: 7 years</span>
          <b>{rows.length} filtered events</b>
        </div>
      </section>
      {selected && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#060b17]/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[24px] border border-[#dfe3ec] bg-white p-6 text-[#131827] shadow-2xl">
            <div className="flex items-start">
              <div>
                <p className="text-[8px] font-extrabold tracking-[.16em] text-[#536fdf] uppercase">
                  Immutable event inspector
                </p>
                <h2 className="mt-2 text-lg font-extrabold">
                  {selected.action}
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dfe3eb]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-6 grid gap-3">
              {Object.entries({
                ...selected,
                category: categoryOf(selected.actor),
                userAgent: "Mozilla/5.0 • Chrome 126 • Linux",
                requestId: "req_01J2V9X24J",
                integrityHash: "sha256:6ad8…91ce",
              }).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[110px_1fr] gap-3 border-b border-[#e8eaf0] pb-3 text-[9px]"
                >
                  <span className="font-bold text-[#707a90]">{key}</span>
                  <code className="break-all">{value}</code>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-[#eef2ff] p-3 text-[8px] leading-4 text-[#536493]">
              This event is append-only. Detail access is itself recorded as an
              audit event.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function AuditSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-xl border border-[#dfe3eb] bg-white px-3 text-[9px] font-bold"
    >
      {options.map((x) => (
        <option key={x}>{x}</option>
      ))}
    </select>
  );
}
