"use client";

import { useState, type ReactNode } from "react";
import {
  AlertOctagon,
  CircleDollarSign,
  FileSearch,
  Landmark,
  RefreshCcw,
  Scale,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
type Discrepancy = {
  id: string;
  providerRef: string;
  order: string;
  provider: string;
  internal: string;
  amount: string;
  difference: string;
  age: string;
  severity: string;
  status: string;
};
const discrepancySeed: Discrepancy[] = [
  {
    id: "REC-9281",
    providerRef: "DKT-99281",
    order: "FRS-240712-1902",
    provider: "PAID",
    internal: "PENDING",
    amount: "Rp129.000",
    difference: "+Rp129.000",
    age: "6m",
    severity: "Critical",
    status: "Open",
  },
  {
    id: "REC-9272",
    providerRef: "DKT-99142",
    order: "FRS-240712-1874",
    provider: "PAID",
    internal: "PAID",
    amount: "Rp79.000",
    difference: "Fee Rp700",
    age: "18m",
    severity: "Medium",
    status: "Review",
  },
  {
    id: "REC-9241",
    providerRef: "XND-82114",
    order: "WD-120724",
    provider: "COMPLETED",
    internal: "PROCESSING",
    amount: "Rp5.000.000",
    difference: "Rp5.000.000",
    age: "42m",
    severity: "High",
    status: "Open",
  },
  {
    id: "REC-9230",
    providerRef: "DKT-99011",
    order: "FRS-240712-1801",
    provider: "PAID",
    internal: "PAID",
    amount: "Rp49.000",
    difference: "Fee Rp450",
    age: "1h",
    severity: "Low",
    status: "Review",
  },
  {
    id: "REC-9218",
    providerRef: "XND-81990",
    order: "WD-120701",
    provider: "COMPLETED",
    internal: "COMPLETED",
    amount: "Rp2.500.000",
    difference: "Rp0",
    age: "2h",
    severity: "Low",
    status: "Resolved",
  },
  {
    id: "REC-9204",
    providerRef: "DKT-98840",
    order: "FRS-240711-1650",
    provider: "PAID",
    internal: "PENDING",
    amount: "Rp199.000",
    difference: "+Rp199.000",
    age: "4h",
    severity: "Critical",
    status: "Open",
  },
];
export function ReconciliationCenter() {
  const [items, setItems] = useState(discrepancySeed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const selected = items.find((item) => item.id === selectedId);
  const { pageRows, pagination } = useClientPagination(items);
  const resolve = () => {
    if (!selected) return;
    setItems((rows) =>
      rows.map((row) =>
        row.id === selected.id
          ? { ...row, status: "Resolved", difference: "Rp0" }
          : row,
      ),
    );
    setSelectedId(null);
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpsMetric
          icon={Landmark}
          label="Provider settlement"
          value="Rp1,284M"
          note="12 Jul 2026"
          tone="success"
        />
        <OpsMetric
          icon={CircleDollarSign}
          label="Internal paid ledger"
          value="Rp1,279M"
          note="Before open mismatches"
        />
        <OpsMetric
          icon={AlertOctagon}
          label="Open discrepancy"
          value="3"
          note="Rp5,129jt exposure"
          tone="danger"
        />
        <OpsMetric
          icon={Scale}
          label="Reconciliation rate"
          value="99,96%"
          note="Target 100%"
          tone="warning"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-[#e5e8ef] p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-black">
              Payment reconciliation & ledger check
            </h2>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              Duitku/Xendit settlement versus payment, order, seller balance,
              and double-entry ledger.
            </p>
          </div>
          <button
            onClick={() => {
              setRunning(true);
              setTimeout(() => setRunning(false), 1300);
            }}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#11182a] px-4 text-[8px] font-extrabold text-white sm:ml-auto"
          >
            {running ? (
              <RefreshCcw className="size-3.5 animate-spin" />
            ) : (
              <Scale className="size-3.5" />
            )}
            {running ? "Reconciling..." : "Run reconciliation"}
          </button>
        </div>
        <div className="grid gap-px bg-[#e5e8ef] sm:grid-cols-4">
          {[
            ["Provider gross", "Rp1.284.129.000"],
            ["Internal captured", "Rp1.279.000.000"],
            ["Seller credits", "Rp1.240.630.000"],
            ["Fees + unresolved", "Rp43.499.000"],
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-5">
              <span className="text-[7px] font-extrabold text-[#7c879d] uppercase">
                {label}
              </span>
              <b className="mt-2 block text-sm">{value}</b>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#7c879d] uppercase">
              <tr>
                {[
                  "Case",
                  "Provider ref",
                  "Order/Payout",
                  "Provider",
                  "Internal",
                  "Amount",
                  "Difference",
                  "Age",
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
                  className="border-t border-[#e8eaf0] text-[8px]"
                >
                  <td className="px-4 py-4 font-mono font-bold text-[#536fdf]">
                    {item.id}
                  </td>
                  <td className="font-mono">{item.providerRef}</td>
                  <td className="font-mono font-bold">{item.order}</td>
                  <td>
                    <Status value={item.provider} />
                  </td>
                  <td>
                    <Status value={item.internal} />
                  </td>
                  <td className="font-bold">{item.amount}</td>
                  <td
                    className={
                      item.difference === "Rp0"
                        ? "text-[#238150]"
                        : "font-extrabold text-[#c9544d]"
                    }
                  >
                    {item.difference}
                  </td>
                  <td>{item.age}</td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>
                    <button
                      onClick={() => setSelectedId(item.id)}
                      className="flex items-center gap-1 font-extrabold text-[#536fdf]"
                    >
                      <FileSearch className="size-3.5" /> Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
      <section className={`${panel} mt-4 p-5`}>
        <div className="flex items-center">
          <ShieldCheck className="size-4 text-[#238150]" />
          <div className="ml-3">
            <b className="block text-[9px]">Double-entry invariant</b>
            <span className="text-[8px] text-[#7c879d]">
              Assets = seller liabilities + platform revenue + provider fees +
              unresolved suspense.
            </span>
          </div>
          <span className="ml-auto rounded-full bg-[#e7f6ec] px-3 py-1.5 text-[8px] font-extrabold text-[#238150]">
            BALANCED AFTER SUSPENSE
          </span>
        </div>
      </section>
      {selected && (
        <OpsModal
          icon={Scale}
          eyebrow="Reconciliation discrepancy"
          title={selected.id}
          onClose={() => setSelectedId(null)}
          danger
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Provider reference", selected.providerRef],
              ["Order / payout", selected.order],
              ["Provider status", selected.provider],
              ["Internal status", selected.internal],
              ["Amount", selected.amount],
              ["Difference", selected.difference],
            ].map(([label, value]) => (
              <DataFact key={label} label={label} value={value} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-[#f5f6f9] p-4">
            <p className="text-[8px] font-extrabold text-[#7c879d] uppercase">
              Suggested resolution
            </p>
            <p className="mt-2 text-[9px] leading-5">
              Verify signature and provider settlement export, then replay the
              idempotent payment/withdrawal state transition. Post any
              correction through an append-only adjustment entry.
            </p>
          </div>
          <Field label="Required reconciliation note">
            <textarea
              rows={3}
              defaultValue="Provider settlement and reference verified. Replay idempotent transition and post suspense correction."
              className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px]"
            />
          </Field>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setSelectedId(null)}
              className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
            >
              Keep open
            </button>
            <button
              onClick={resolve}
              className="h-10 flex-1 rounded-xl bg-[#218a52] text-[8px] font-extrabold text-white"
            >
              Resolve & post audit
            </button>
          </div>
        </OpsModal>
      )}
    </>
  );
}
function OpsMetric({
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
  const color =
    tone === "danger"
      ? "bg-[#fff0ee] text-[#c9544d]"
      : tone === "warning"
        ? "bg-[#fff5df] text-[#ad741f]"
        : tone === "success"
          ? "bg-[#e7f6ec] text-[#238150]"
          : "bg-[#edf1fb] text-[#536fdf]";
  return (
    <div className={`${panel} p-5`}>
      <span className={cn("grid size-10 place-items-center rounded-xl", color)}>
        <Icon className="size-4" />
      </span>
      <p className="mt-5 text-[8px] font-extrabold tracking-[.12em] text-[#7c879d] uppercase">
        {label}
      </p>
      <b className="mt-1 block text-xl tracking-[-.04em]">{value}</b>
      <span className="mt-1 block text-[8px] text-[#7c879d]">{note}</span>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const good = [
    "Live",
    "Completed",
    "Resolved",
    "PAID",
    "COMPLETED",
    "Available",
    "Released",
  ].includes(value);
  const warning = [
    "Queued",
    "Open",
    "Review",
    "PENDING",
    "PROCESSING",
    "Held",
    "Evidence review",
    "Seller response",
    "New",
  ].includes(value);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[7px] font-extrabold",
        good
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
function DataFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f5f6f9] p-3">
      <span className="text-[7px] text-[#7c879d]">{label}</span>
      <b className="mt-1 block text-[9px]">{value}</b>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-[8px] font-extrabold">
      {label}
      {children}
    </label>
  );
}
function OpsModal({
  icon: Icon,
  eyebrow,
  title,
  onClose,
  children,
  danger = false,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/75 p-4 backdrop-blur-sm">
      <section className="my-6 w-full max-w-2xl rounded-[26px] bg-white p-6 text-[#131827] shadow-2xl">
        <div className="flex items-start">
          <span
            className={cn(
              "grid size-12 place-items-center rounded-2xl",
              danger
                ? "bg-[#fff0ee] text-[#c9544d]"
                : "bg-[#edf1fb] text-[#536fdf]",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="ml-4">
            <p className="text-[7px] font-extrabold tracking-[.18em] text-[#7c879d] uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-black">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
