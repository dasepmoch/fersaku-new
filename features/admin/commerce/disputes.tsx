"use client";

import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Gavel,
  LockKeyhole,
  ReceiptText,
  RotateCcw,
  Search,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
type Dispute = {
  id: string;
  order: string;
  buyer: string;
  merchant: string;
  reason: string;
  amount: string;
  funds: string;
  status: string;
  age: string;
  evidence: number;
};
const disputeSeed: Dispute[] = [
  {
    id: "DSP-24071",
    order: "FRS-240712-1848",
    buyer: "Nadia Putri",
    merchant: "Asep AI Tools",
    reason: "File rusak / tidak dapat dibuka",
    amount: "Rp129.000",
    funds: "Held",
    status: "Evidence review",
    age: "18m",
    evidence: 3,
  },
  {
    id: "DSP-24066",
    order: "FRS-240711-1721",
    buyer: "Rizky Hidayat",
    merchant: "DesignKit Studio",
    reason: "Produk tidak sesuai deskripsi",
    amount: "Rp249.000",
    funds: "Held",
    status: "Seller response",
    age: "2h",
    evidence: 5,
  },
  {
    id: "DSP-24052",
    order: "FRS-240710-1604",
    buyer: "Dimas Ardi",
    merchant: "Prompt Factory ID",
    reason: "Delivery kosong",
    amount: "Rp79.000",
    funds: "Available",
    status: "New",
    age: "5h",
    evidence: 2,
  },
  {
    id: "DSP-24041",
    order: "FRS-240709-1422",
    buyer: "Sinta Maharani",
    merchant: "Digital Supply ID",
    reason: "Akses link expired",
    amount: "Rp99.000",
    funds: "Held",
    status: "Evidence review",
    age: "1d",
    evidence: 4,
  },
  {
    id: "DSP-24033",
    order: "FRS-240708-1109",
    buyer: "Fajar Nugroho",
    merchant: "KodeKita",
    reason: "Kode stok invalid",
    amount: "Rp159.000",
    funds: "Held",
    status: "Seller response",
    age: "2d",
    evidence: 6,
  },
  {
    id: "DSP-24021",
    order: "FRS-240707-0931",
    buyer: "Laras Ayu",
    merchant: "NotionKita",
    reason: "Refund request partial",
    amount: "Rp49.000",
    funds: "Released",
    status: "Resolved",
    age: "3d",
    evidence: 2,
  },
];
export function DisputeResolutionCenter() {
  const [items, setItems] = useState(disputeSeed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const selected = items.find((item) => item.id === selectedId);
  const filteredItems = items.filter((item) => {
    const matchesQuery = [
      item.id,
      item.order,
      item.buyer,
      item.merchant,
      item.reason,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
    return (
      matchesQuery &&
      (statusFilter === "All statuses" || item.status === statusFilter)
    );
  });
  const { pageRows, pagination } = useClientPagination(filteredItems);
  const update = (status: string, funds?: string) => {
    if (!selected) return;
    setItems((rows) =>
      rows.map((row) =>
        row.id === selected.id
          ? { ...row, status, funds: funds || row.funds }
          : row,
      ),
    );
    setSelectedId(null);
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpsMetric
          icon={Gavel}
          label="Open disputes"
          value="12"
          note="3 high priority"
          tone="danger"
        />
        <OpsMetric
          icon={LockKeyhole}
          label="Funds held"
          value="Rp4,82jt"
          note="Across 9 merchants"
          tone="warning"
        />
        <OpsMetric
          icon={RotateCcw}
          label="Refunded this month"
          value="Rp1,24jt"
          note="0,42% order rate"
        />
        <OpsMetric
          icon={Clock3}
          label="Median resolution"
          value="6j 18m"
          note="SLA target 24h"
          tone="success"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe3ec] px-3 text-[#7c879d]">
            <Search className="size-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dispute, order, buyer, merchant..."
              className="min-w-0 flex-1 bg-transparent text-[9px] outline-none"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[9px] font-bold"
          >
            <option>All statuses</option>
            <option>New</option>
            <option>Evidence review</option>
            <option>Seller response</option>
            <option>Resolved</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#7c879d] uppercase">
              <tr>
                {[
                  "Case",
                  "Order",
                  "Buyer",
                  "Merchant",
                  "Reason",
                  "Amount",
                  "Funds",
                  "Evidence",
                  "Status",
                  "Age",
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
                  <td className="font-mono">{item.order}</td>
                  <td>{item.buyer}</td>
                  <td className="font-bold">{item.merchant}</td>
                  <td className="max-w-[190px]">{item.reason}</td>
                  <td className="font-extrabold">{item.amount}</td>
                  <td>
                    <Status value={item.funds} />
                  </td>
                  <td>{item.evidence} files</td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>{item.age}</td>
                  <td>
                    <button
                      onClick={() => {
                        setSelectedId(item.id);
                        setRefunded(false);
                      }}
                      className="font-extrabold text-[#536fdf]"
                    >
                      Open case
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
      {selected && (
        <OpsModal
          icon={Gavel}
          eyebrow="Buyer protection case"
          title={`${selected.id} - ${selected.order}`}
          onClose={() => setSelectedId(null)}
          danger
        >
          {refunded ? (
            <div className="rounded-[24px] bg-[#e7f6ec] p-7 text-center text-[#238150]">
              <CheckCircle2 className="mx-auto size-8" />
              <h3 className="mt-4 text-lg font-black">
                Refund issued and ledger reversed.
              </h3>
              <p className="mt-2 text-[9px] leading-5">
                Buyer notification, seller balance debit, provider refund job,
                and immutable dispute event were queued.
              </p>
              <button
                onClick={() => {
                  update("Refunded", "Released");
                }}
                className="mt-5 h-10 rounded-xl bg-[#218a52] px-5 text-[8px] font-extrabold text-white"
              >
                Close resolved case
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Buyer", selected.buyer],
                  ["Merchant", selected.merchant],
                  ["Claim", selected.reason],
                  ["Transaction amount", selected.amount],
                  ["Seller funds", selected.funds],
                  ["Evidence package", `${selected.evidence} files`],
                ].map(([label, value]) => (
                  <DataFact key={label} label={label} value={value} />
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  [ReceiptText, "Transaction proof", "QRIS paid + invoice"],
                  [Upload, "Buyer evidence", "screen-recording.mp4"],
                  [FileText, "Seller response", "Replacement link sent"],
                ].map(([Icon, title, note]) => (
                  <div
                    key={title as string}
                    className="rounded-2xl border border-[#dfe3ec] bg-[#f5f6f9] p-4"
                  >
                    <Icon className="size-4 text-[#536fdf]" />
                    <b className="mt-4 block text-[8px]">{title as string}</b>
                    <span className="mt-1 block text-[7px] text-[#7c879d]">
                      {note as string}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-[#f0d69e] bg-[#fff8e8] p-4 text-[8px] leading-4 text-[#7c6a45]">
                <LockKeyhole className="mr-2 inline size-3.5" />
                Hold only the disputed amount from pending/available seller
                funds. Never mutate historical paid ledger entries.
              </div>
              <Field label="Resolution note">
                <textarea
                  rows={3}
                  defaultValue="Review buyer evidence, seller response, delivery logs, and product snapshot before deciding."
                  className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px]"
                />
              </Field>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => update("Seller response", "Held")}
                  className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
                >
                  Request seller evidence
                </button>
                <button
                  onClick={() => update("Rejected", "Released")}
                  className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
                >
                  Reject buyer claim
                </button>
                <button
                  onClick={() => update("Resolved - replacement", "Released")}
                  className="h-10 rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
                >
                  Accept replacement
                </button>
                <button
                  onClick={() => setRefunded(true)}
                  className="h-10 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white"
                >
                  Issue refund
                </button>
              </div>
            </>
          )}
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
