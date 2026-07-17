"use client";

import { adminPanel } from "@/features/admin/ui";

import {
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileClock,
  Filter,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type AdminAuditEvent,
  isAuditExportComplete,
  runAuditExportJob,
  useAdminAuditEvent,
  useAdminAuditEvents,
  useAdminAuditIntegrity,
} from "@/features/admin/data";
import { cn } from "@/lib/utils";
import { getDomainSource } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import {
  appendClientAuditEvent,
  verifyMockAuditIntegrity,
} from "@/features/admin/data/client-audit";

const categoryOf = (actor: string) =>
  actor === "system"
    ? "System"
    : actor.endsWith("@fersaku.id")
      ? "Administrator"
      : "Seller";

const auditCsvColumns: Array<[label: string, field: keyof AdminAuditEvent]> = [
  ["Event ID", "id"],
  ["Timestamp", "time"],
  ["Actor", "actor"],
  ["Action", "action"],
  ["Target", "target"],
  ["IP address", "ip"],
  ["Result", "result"],
  ["Context", "context"],
  ["Previous hash", "previousHash"],
  ["Integrity hash", "integrityHash"],
];

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadAuditCsv(events: AdminAuditEvent[]) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return false;
  }
  const lines = [
    auditCsvColumns.map(([label]) => csvCell(label)).join(","),
    ...events.map((event) =>
      auditCsvColumns.map(([, field]) => csvCell(event[field])).join(","),
    ),
  ];
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${lines.join("\r\n")}`], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `fersaku-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

function openSignedDownload(url: string) {
  if (typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function AdminAuditExplorer() {
  const isMock = getDomainSource("adminRead") === "mock";
  const { data } = useAdminAuditEvents();
  const { data: integrity } = useAdminAuditIntegrity();
  const queryClient = useQueryClient();
  const auditEvents = useMemo(() => data ?? [], [data]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All actors");
  const [action, setAction] = useState("All actions");
  const [result, setResult] = useState("All results");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] =
    useState<AdminAuditEvent | null>(null);
  const [exported, setExported] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verification, setVerification] = useState<
    "idle" | "valid" | "invalid"
  >("idle");

  const { data: selectedDetail } = useAdminAuditEvent(selectedId ?? "");

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return selectedDetail ?? selectedFallback;
  }, [selectedId, selectedDetail, selectedFallback]);

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.auditLogs(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.auditIntegrity(),
      });
    };
    window.addEventListener("fersaku-admin-audit-updated", refresh);
    return () =>
      window.removeEventListener("fersaku-admin-audit-updated", refresh);
  }, [queryClient]);

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
    [auditEvents, query, category, action, result],
  );
  const { pageRows, pagination } = useClientPagination(rows);

  const chainIsValid = useMemo(() => {
    if (isMock) return verifyMockAuditIntegrity(auditEvents);
    return integrity?.chainValid ?? false;
  }, [isMock, auditEvents, integrity]);

  const chainLabel = useMemo(() => {
    if (isMock) {
      return chainIsValid ? "chain verified" : "chain invalid";
    }
    if (!integrity) return "integrity pending";
    if (integrity.chainValid) {
      return `${integrity.chainMode} verified`;
    }
    return `${integrity.verifierStatus || "integrity failed"}`;
  }, [isMock, chainIsValid, integrity]);

  const exportRows = useCallback(() => {
    if (exportBusy) return;
    setExportError(null);

    if (isMock) {
      if (!downloadAuditCsv(rows)) return;
      appendClientAuditEvent({
        actor: "admin@fersaku.id",
        action: "audit.export.csv",
        target: "filtered-audit-events",
        ip: "mock-admin-session",
        result: "Success",
        context: `Exported ${rows.length} filtered audit events`,
      });
      setExported(true);
      window.setTimeout(() => setExported(false), 1800);
      return;
    }

    setExportBusy(true);
    void (async () => {
      try {
        const job = await runAuditExportJob({
          reason: "Admin console audit trail export request",
          filter: {
            ...(action !== "All actions" ? { action } : {}),
            ...(result !== "All results" ? { result } : {}),
          },
        });
        if (!isAuditExportComplete(job)) {
          setExportError(
            job.errorMessage ||
              `Export ${job.status.toLowerCase()} — try again later`,
          );
          return;
        }
        if (job.downloadUrl) {
          openSignedDownload(job.downloadUrl);
        }
        setExported(true);
        window.setTimeout(() => setExported(false), 1800);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.admin.auditLogs(),
        });
      } catch {
        setExportError("Export failed. Server remains authority.");
      } finally {
        setExportBusy(false);
      }
    })();
  }, [action, exportBusy, isMock, queryClient, result, rows]);

  useEffect(() => {
    window.addEventListener("fersaku-admin-audit-export", exportRows);
    return () =>
      window.removeEventListener("fersaku-admin-audit-export", exportRows);
  }, [exportRows]);

  const openInspector = (event: AdminAuditEvent) => {
    setSelectedFallback(event);
    setSelectedId(event.id);
    setVerification("idle");
    if (isMock) {
      appendClientAuditEvent({
        actor: "admin@fersaku.id",
        action: "audit.event.inspect",
        target: event.id,
        ip: "mock-admin-session",
        result: "Success",
        context: "Read-only audit event detail access",
      });
    }
  };

  const inspectorEntries = useMemo(() => {
    if (!selected) return [] as Array<[string, string]>;
    const base: Record<string, string> = {
      id: selected.id,
      time: selected.time,
      actor: selected.actor,
      action: selected.action,
      target: selected.target,
      ip: selected.ip,
      result: selected.result,
      ...(selected.context ? { context: selected.context } : {}),
      ...(selected.previousHash
        ? { previousHash: selected.previousHash }
        : {}),
      ...(selected.integrityHash
        ? { integrityHash: selected.integrityHash }
        : {}),
      category: categoryOf(selected.actor),
    };
    if (selected.requestId) base.requestId = selected.requestId;
    if (typeof selected.sequenceNo === "number") {
      base.sequenceNo = String(selected.sequenceNo);
    }
    if (selected.merchantId) base.merchantId = selected.merchantId;
    if (selected.resourceType) base.resourceType = selected.resourceType;
    if (selected.resourceId) base.resourceId = selected.resourceId;
    if (isMock) {
      base.userAgent = "Mozilla/5.0 • Chrome 126 • Linux";
      if (!base.requestId) base.requestId = "req_01J2V9X24J";
    }
    return Object.entries(base);
  }, [selected, isMock]);

  return (
    <>
      <section className={`${adminPanel} overflow-hidden`}>
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
              onClick={exportRows}
              disabled={exportBusy}
              className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe3eb] bg-white px-3 text-[9px] font-extrabold disabled:opacity-60"
            >
              <Download className="size-3.5" />{" "}
              {exportBusy
                ? "Exporting…"
                : exported
                  ? "CSV downloaded"
                  : "Export CSV"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[8px] text-[#707a90]">
            <Filter className="size-3" /> Showing {rows.length} of{" "}
            {auditEvents.length} {isMock ? "mock events" : "events"} • Date
            range: last 24 hours
            {exportError ? (
              <span className="ml-2 font-bold text-[#b55039]">{exportError}</span>
            ) : null}
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
                      type="button"
                      aria-label={`Inspect audit event ${event.id}`}
                      onClick={() => openInspector(event)}
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
        <div className="flex flex-col gap-2 border-t border-[#e5e8ef] px-5 py-4 text-[9px] text-[#707a90] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck
              className={cn(
                "size-3.5",
                chainIsValid ? "text-[#2a8954]" : "text-[#b55039]",
              )}
            />
            {isMock ? "Append-only mock" : "Append-only server"} • {chainLabel}•
            production retention: 7 years
          </span>
          <b>{rows.length} filtered events</b>
        </div>
      </section>
      {selected && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#060b17]/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-inspector-title"
            className="w-full max-w-lg rounded-[24px] border border-[#dfe3ec] bg-white p-6 text-[#131827] shadow-2xl"
          >
            <div className="flex items-start">
              <div>
                <h2
                  id="audit-inspector-title"
                  className="text-[8px] font-extrabold tracking-[.16em] text-[#536fdf] uppercase"
                >
                  Immutable event inspector
                </h2>
                <h3 className="mt-2 text-lg font-extrabold">
                  {selected.action}
                </h3>
              </div>
              <button
                aria-label="Close event inspector"
                onClick={() => {
                  setSelectedId(null);
                  setSelectedFallback(null);
                  setVerification("idle");
                }}
                className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dfe3eb]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-6 grid gap-3">
              {inspectorEntries.map(([key, value]) => (
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
              <div className="flex items-center gap-2 font-extrabold">
                <CheckCircle2 className="size-3.5" />
                This event is append-only.
              </div>
              <p className="mt-1 leading-4">
                {isMock
                  ? "Detail access is itself recorded as an audit event. Integrity verification uses a deterministic local mock chain; production uses the server-side signed SHA-256 chain."
                  : "Integrity verification uses the server JCS-1 chain verifier. Hashes are shown only when the backend provides them."}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    JSON.stringify(selected, null, 2),
                  );
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] text-[8px] font-extrabold"
              >
                <Copy className="size-3.5" />
                {copied ? "Copied" : "Copy event"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerification(chainIsValid ? "valid" : "invalid");
                  window.setTimeout(() => setVerification("idle"), 1800);
                  if (!isMock) {
                    void queryClient.invalidateQueries({
                      queryKey: queryKeys.admin.auditIntegrity(),
                    });
                  }
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
              >
                <ShieldCheck className="size-3.5" />
                {verification === "valid"
                  ? "Hash verified"
                  : verification === "invalid"
                    ? "Hash invalid"
                    : "Verify integrity"}
              </button>
            </div>
          </section>
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
