"use client";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCcw,
  RotateCcw,
  Search,
  Upload,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
type WebhookRow = {
  id: string;
  source: string;
  event: string;
  order: string;
  http: string;
  providerStatus: string;
  orderStatus: string;
  age: string;
  attempts: number;
};
const initialWebhooks: WebhookRow[] = [
  {
    id: "whd_9244",
    source: "Duitku",
    event: "payment.qris.paid",
    order: "FRS-240712-1902",
    http: "Timeout",
    providerStatus: "PAID",
    orderStatus: "Pending",
    age: "3m",
    attempts: 4,
  },
  {
    id: "whd_9241",
    source: "Duitku",
    event: "payment.qris.paid",
    order: "FRS-240712-1848",
    http: "200",
    providerStatus: "PAID",
    orderStatus: "Fulfilled",
    age: "7m",
    attempts: 1,
  },
  {
    id: "whd_9231",
    source: "Xendit",
    event: "withdrawal.completed",
    order: "WD-120724",
    http: "200",
    providerStatus: "COMPLETED",
    orderStatus: "Completed",
    age: "12m",
    attempts: 1,
  },
  {
    id: "whd_9227",
    source: "Seller",
    event: "delivery.fulfilled",
    order: "FRS-240712-1811",
    http: "500",
    providerStatus: "DELIVERED",
    orderStatus: "Fulfilled",
    age: "18m",
    attempts: 3,
  },
  {
    id: "whd_9224",
    source: "Duitku",
    event: "payment.qris.paid",
    order: "FRS-240712-1804",
    http: "401",
    providerStatus: "PAID",
    orderStatus: "Pending",
    age: "24m",
    attempts: 5,
  },
  {
    id: "whd_9218",
    source: "Xendit",
    event: "withdrawal.failed",
    order: "WD-120690",
    http: "200",
    providerStatus: "FAILED",
    orderStatus: "Pending",
    age: "36m",
    attempts: 2,
  },
  {
    id: "whd_9211",
    source: "Seller",
    event: "delivery.failed",
    order: "FRS-240712-1790",
    http: "500",
    providerStatus: "FAILED",
    orderStatus: "Pending",
    age: "48m",
    attempts: 4,
  },
];
export function WebhookOperations() {
  const [rows, setRows] = useState(initialWebhooks);
  const [selectedId, setSelectedId] = useState(initialWebhooks[0].id);
  const [forceOpen, setForceOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const selected = rows.find((row) => row.id === selectedId) || rows[0];
  const { pageRows, pagination } = useClientPagination(rows);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          icon={Webhook}
          label="Events today"
          value="18.492"
          note="3 provider sources"
        />
        <AdminMetric
          icon={CheckCircle2}
          label="Success rate"
          value="99,72%"
          note="+0,08%"
          tone="success"
        />
        <AdminMetric
          icon={AlertTriangle}
          label="Order mismatches"
          value="2"
          note="Provider paid, order pending"
          tone="danger"
        />
        <AdminMetric
          icon={Clock3}
          label="Median latency"
          value="92 ms"
          note="p95 840 ms"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className={`${panel} min-w-0 overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row sm:items-center">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe3ec] px-3 text-[#7c879d]">
              <Search className="size-4" />
              <input
                placeholder="Search delivery, order, provider..."
                className="min-w-0 flex-1 text-[9px] outline-none"
              />
            </label>
            <select className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[9px] font-bold">
              <option>All providers</option>
              <option>Duitku</option>
              <option>Xendit</option>
              <option>Seller</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#8490a5] uppercase">
                <tr>
                  {[
                    "Delivery",
                    "Source",
                    "Event",
                    "Order",
                    "HTTP",
                    "Provider",
                    "Local state",
                    "Attempts",
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
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "cursor-pointer border-t border-[#e8eaf0] text-[8px]",
                      selectedId === row.id && "bg-[#f1f4ff]",
                    )}
                  >
                    <td className="px-4 py-4 font-mono font-bold text-[#536fdf]">
                      {row.id}
                    </td>
                    <td className="font-bold">{row.source}</td>
                    <td className="font-mono">{row.event}</td>
                    <td className="font-mono">{row.order}</td>
                    <td>
                      <StatusPill value={row.http} />
                    </td>
                    <td>
                      <StatusPill value={row.providerStatus} />
                    </td>
                    <td>
                      <StatusPill value={row.orderStatus} />
                    </td>
                    <td>{row.attempts}</td>
                    <td>{row.age}</td>
                    <td>
                      <Eye className="size-3.5 text-[#536fdf]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination} />
        </section>

        <aside className={`${panel} overflow-hidden`}>
          <div className="border-b border-[#e5e8ef] bg-[#11182a] p-5 text-white">
            <p className="font-mono text-[8px] text-[#91a2d2]">{selected.id}</p>
            <h3 className="mt-2 text-sm font-black">{selected.event}</h3>
            <p className="mt-1 text-[8px] text-white/45">
              {selected.source} - order {selected.order}
            </p>
          </div>
          <div className="p-5">
            {selected.providerStatus === "PAID" &&
              selected.orderStatus === "Pending" && (
                <div className="rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
                  <AlertOctagon className="mr-2 inline size-4" />
                  Settlement mismatch: provider confirms paid while Fersaku
                  order remains pending.
                </div>
              )}
            <div className="mt-4 grid gap-3">
              {[
                ["Provider reference", "DKT-QRP-99281"],
                ["Signature validation", "Valid - HMAC SHA256"],
                ["Received at", "12 Jul 2026, 14:39:22.841"],
                ["Idempotency key", `evt:${selected.id}`],
                ["Raw payload", "Encrypted - retained 90 days"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 border-b border-[#edf0f4] pb-3 text-[8px]"
                >
                  <span className="text-[#7c879d]">{label}</span>
                  <b className="text-right font-mono">{value}</b>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#f5f6f9] p-4">
              <p className="text-[8px] font-extrabold tracking-wider text-[#7c879d] uppercase">
                Payload preview
              </p>
              <pre className="mt-3 overflow-x-auto text-[7px] leading-4 text-[#455064]">{`{\n  "merchantOrderId": "${selected.order}",\n  "resultCode": "00",\n  "amount": 129000,\n  "reference": "DKT-QRP-99281"\n}`}</pre>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setRetrying(true);
                  setTimeout(() => setRetrying(false), 900);
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] text-[8px] font-extrabold"
              >
                {retrying ? (
                  <RefreshCcw className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {retrying ? "Retrying" : "Retry delivery"}
              </button>
              <button
                disabled={
                  !(
                    selected.providerStatus === "PAID" &&
                    selected.orderStatus === "Pending"
                  )
                }
                onClick={() => setForceOpen(true)}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#b9bfca]"
              >
                <Zap className="size-3.5" /> Force-Fulfill
              </button>
            </div>
            <p className="mt-3 text-[7px] leading-4 text-[#8a94a7]">
              Force-Fulfill is available only for a verified
              paid-provider/local-pending mismatch and requires settlement
              evidence.
            </p>
          </div>
        </aside>
      </div>

      {forceOpen && (
        <ForceFulfillDialog
          row={selected}
          onClose={() => setForceOpen(false)}
          onComplete={() => {
            setRows((items) =>
              items.map((item) =>
                item.id === selected.id
                  ? { ...item, orderStatus: "Fulfilled", http: "Manual" }
                  : item,
              ),
            );
            setForceOpen(false);
          }}
        />
      )}
    </>
  );
}
function ForceFulfillDialog({
  row,
  onClose,
  onComplete,
}: {
  row: WebhookRow;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [reference, setReference] = useState("DKT-QRP-99281");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const ready =
    reference.trim() && reason.trim().length >= 12 && evidence && confirmed;
  return (
    <Modal
      title="Manual Force-Fulfill"
      eyebrow="High-risk operation"
      icon={Zap}
      onClose={onClose}
      danger
    >
      <div className="rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
        This action marks <b>{row.order}</b> paid, queues digital fulfillment,
        notifies the buyer, and writes an immutable manual-override event.
      </div>
      <div className="mt-5 grid gap-4">
        <Field label="Verified provider reference">
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px] outline-none"
          />
        </Field>
        <Field label="Settlement / mutation evidence">
          <button
            onClick={() => setEvidence(true)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed text-[8px] font-extrabold",
              evidence
                ? "border-[#8cc8a5] bg-[#eff9f2] text-[#277a4b]"
                : "border-[#cfd5df]",
            )}
          >
            {evidence ? (
              <Check className="size-4" />
            ) : (
              <Upload className="size-4" />
            )}
            {evidence
              ? "mutation_DKT_99281.pdf attached"
              : "Attach evidence file (mock)"}
          </button>
        </Field>
        <Field label="Required operational reason">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Explain reconciliation checks and why manual fulfillment is safe..."
            className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] outline-none"
          />
        </Field>
        <label className="flex gap-3 rounded-xl bg-[#f5f6f9] p-4 text-[8px] leading-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            I compared amount, merchant order ID, provider reference, signature,
            and settlement evidence. I understand this cannot be silently
            undone.
          </span>
        </label>
      </div>
      <div className="mt-6 flex gap-2">
        <button
          onClick={onClose}
          className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
        >
          Cancel
        </button>
        <button
          disabled={!ready}
          onClick={onComplete}
          className="h-10 flex-1 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white disabled:bg-[#b9bfca]"
        >
          Force paid & fulfill
        </button>
      </div>
    </Modal>
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
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 grid gap-2 text-[8px] font-extrabold">
      {label}
      {children}
    </label>
  );
}
function Modal({
  title,
  eyebrow,
  icon: Icon,
  onClose,
  children,
  danger = false,
}: {
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/72 p-4 backdrop-blur-sm">
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
