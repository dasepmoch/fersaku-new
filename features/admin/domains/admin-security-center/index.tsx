"use client";

import {
  Check,
  KeyRound,
  Laptop,
  Play,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { securityEvents } from "./data";
import { SecurityEventDialog } from "./event-dialog";
import {
  AdminSessionsTab,
  PoliciesTab,
  PostureTab,
  SecretAccessTab,
  SecurityEventsTab,
} from "./tabs";

export function AdminSecurityCenter() {
  const [tab, setTab] = useState("Posture");
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<null | string[]>(null);
  const filtered = useMemo(
    () =>
      securityEvents.filter((row) =>
        row.join(" ").toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  const { pageRows, pagination } = useClientPagination(filtered);
  const scan = () => {
    setScanning(true);
    setScanDone(false);
    setTimeout(() => {
      setScanning(false);
      setScanDone(true);
      setTimeout(() => setScanDone(false), 1800);
    }, 1200);
  };
  return (
    <>
      <div className="rounded-[24px] bg-[#11182a] p-6 text-white sm:p-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-[8px] font-extrabold tracking-[.18em] text-[#7f98ff] uppercase">
              Continuous security audit
            </p>
            <h2 className="font-display mt-3 text-5xl">94 / 100</h2>
            <p className="mt-2 text-[9px] text-white/45">
              Strong posture • 2 recommendations • last full scan 14 minutes ago
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {[
              [ShieldCheck, "MFA coverage", "100%"],
              [KeyRound, "Secrets rotated", "92%"],
              [Laptop, "Trusted sessions", "18"],
            ].map(([Icon, label, value]) => (
              <div key={label as string} className="rounded-2xl bg-white/7 p-4">
                <Icon className="size-4 text-[#7f98ff]" />
                <b className="mt-3 block text-sm">{value as string}</b>
                <span className="text-[7px] text-white/40">
                  {label as string}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={scan}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#5b7cfa] px-4 text-[8px] font-extrabold"
          >
            {scanning ? (
              <RefreshCcw className="size-4 animate-spin" />
            ) : scanDone ? (
              <Check className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
            {scanning
              ? "Running audit..."
              : scanDone
                ? "Audit complete"
                : "Run security audit"}
          </button>
        </div>
      </div>
      <div className="mt-5 flex overflow-x-auto rounded-[18px] border border-[#dfe3ec] bg-white p-1">
        {[
          "Posture",
          "Security events",
          "Admin sessions",
          "Secret access",
          "Policies",
        ].map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={cn(
              "h-10 shrink-0 rounded-xl px-4 text-[8px] font-extrabold",
              tab === item ? "bg-[#11182a] text-white" : "text-[#707a90]",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "Posture" && <PostureTab />}
      {tab === "Security events" && (
        <SecurityEventsTab
          query={query}
          setQuery={setQuery}
          pageRows={pageRows}
          pagination={pagination}
          setSelected={setSelected}
        />
      )}
      {tab === "Admin sessions" && <AdminSessionsTab />}
      {tab === "Secret access" && <SecretAccessTab />}
      {tab === "Policies" && <PoliciesTab />}
      {selected && (
        <SecurityEventDialog
          selected={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
