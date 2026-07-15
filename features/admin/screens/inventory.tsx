"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  X,
} from "lucide-react";
import { useState } from "react";
import { stockItems, stockProducts } from "@/lib/inventory-mock-data";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
function GlobalInventory() {
  const [revealed, setRevealed] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const productsPage = useClientPagination(stockProducts);
  const itemsPage = useClientPagination(stockItems);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Available stock" value="105" note="Across 3 products" />
        <Metric label="Reserved" value="4" note="Atomic checkout holds" />
        <Metric
          label="Sold credentials"
          value="735"
          note="Permanently assigned"
        />
        <Metric
          label="Invalid items"
          value="3"
          note="Blocked from allocation"
          tone="danger"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Platform inventory health"
          desc="Global visibility without exposing secrets by default"
          action={
            <button
              onClick={() => setRevealed(!revealed)}
              className="flex items-center gap-2 rounded-lg border border-[#dce1e9] px-3 py-2 text-[8px] font-bold"
            >
              {revealed ? (
                <EyeOff className="size-3" />
              ) : (
                <Eye className="size-3" />
              )}
              {revealed ? "Hide privileged values" : "Privileged reveal"}
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <TableHeader
              labels={[
                "Product",
                "Merchant",
                "Format",
                "Available",
                "Reserved",
                "Sold",
                "Invalid",
                "Health",
                "",
              ]}
            />
            <tbody>
              {productsPage.pageRows.map((p, i) => (
                <tr key={p.id} className="border-t border-[#e8eaf0] text-[9px]">
                  <td className="px-5 py-4">
                    <b className="block">{p.title}</b>
                    <code className="text-[7px] text-[#8993a6]">{p.id}</code>
                  </td>
                  <td>{i === 1 ? "KodeKita" : "Digital Supply ID"}</td>
                  <td>
                    <code className="rounded bg-[#f1f3f7] px-2 py-1">
                      {p.delivery}
                    </code>
                  </td>
                  <td className="font-extrabold">{p.available}</td>
                  <td>{p.reserved}</td>
                  <td>{p.sold}</td>
                  <td className={p.invalid ? "text-[#c6534c]" : ""}>
                    {p.invalid}
                  </td>
                  <td>
                    <RiskBadge
                      risk={p.available <= p.lowAt ? "Review" : "Low"}
                    />
                  </td>
                  <td>
                    <button onClick={() => setAction(`Inspect ${p.title}`)}>
                      <ChevronRight className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...productsPage.pagination} />
      </section>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Recent credential allocations"
          desc="Secret access is individually audited"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <TableHeader
              labels={[
                "Stock item",
                "Schema preview",
                "Status",
                "Assigned order",
                "Created",
                "Control",
              ]}
            />
            <tbody>
              {itemsPage.pageRows.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-[#e8eaf0] text-[9px]"
                >
                  <td className="px-5 py-4 font-mono font-bold">{item.id}</td>
                  <td className="font-mono">
                    {revealed
                      ? `${item.values.username}|${item.values.password}|${item.values.team_link}`
                      : `${item.values.username}|••••••••|••••••••`}
                  </td>
                  <td>
                    <AdminStatus status={item.status} />
                  </td>
                  <td className="font-mono">{item.orderId || "—"}</td>
                  <td>{item.createdAt}</td>
                  <td>
                    <button
                      onClick={() =>
                        setAction(
                          item.status === "Invalid"
                            ? "Delete invalid stock item"
                            : "Invalidate stock item",
                        )
                      }
                      className="text-[8px] font-bold text-[#c6534c]"
                    >
                      {item.status === "Invalid" ? "Delete" : "Invalidate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...itemsPage.pagination} />
      </section>
      <div className="mt-4 rounded-[20px] border border-[#edcf91] bg-[#fff8e9] p-5">
        <div className="flex gap-3">
          <LockKeyhole className="size-4 text-[#a7731f]" />
          <div>
            <b className="block text-[9px] text-[#8e651f]">
              Privileged secret access policy
            </b>
            <p className="mt-1 text-[8px] leading-4 text-[#806f4f]">
              Every reveal records administrator, reason, stock ID, order ID,
              IP, and timestamp. Secrets must never enter general audit
              payloads, analytics, exports, or error logs.
            </p>
          </div>
        </div>
      </div>
      {action && (
        <ControlDialog
          title={action}
          onClose={() => setAction(null)}
          danger={action.includes("Delete") || action.includes("Invalidate")}
        />
      )}
    </>
  );
}
function PanelHead({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <div>
        <h2 className="text-xs font-black">{title}</h2>
        <p className="mt-1 text-[9px] text-[#8590a4]">{desc}</p>
      </div>
      {action}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className={`${panel} p-5`}>
      <p className="text-[8px] font-extrabold tracking-[.12em] text-[#818ca1] uppercase">
        {label}
      </p>
      <p className="mt-2 text-xl font-black tracking-[-.035em]">{value}</p>
      {note && (
        <p
          className={`mt-1 text-[8px] font-semibold ${tone === "danger" ? "text-[#d55850]" : tone === "warning" ? "text-[#d28a25]" : "text-[#788399]"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}
function TableHeader({ labels }: { labels: string[] }) {
  return (
    <thead>
      <tr className="bg-[#f7f8fa] text-[8px] font-extrabold tracking-[.1em] text-[#8490a5] uppercase">
        {labels.map((x, i) => (
          <th key={x + i} className={i === 0 ? "px-5 py-3" : "py-3 pr-5"}>
            {x}
          </th>
        ))}
      </tr>
    </thead>
  );
}
function AdminStatus({ status }: { status: string }) {
  const positive = [
    "Active",
    "Paid",
    "Completed",
    "Live",
    "Success",
    "Operational",
    "Delivered",
    "Available",
    "Sold",
    "Verified",
    "Fulfilled",
    "Published",
  ].includes(status);
  const pending = [
    "Pending",
    "Processing",
    "Invited",
    "On hold",
    "Review",
    "Reserved",
  ].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[8px] font-extrabold whitespace-nowrap ${positive ? "bg-[#e9f7ef] text-[#287d4c]" : pending ? "bg-[#fff6e4] text-[#a16d1e]" : "bg-[#fff0ee] text-[#c9544d]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
function RiskBadge({ risk }: { risk: string }) {
  const low = risk === "Low";
  const high = ["High", "Critical"].includes(risk);
  return (
    <span
      className={`rounded-lg px-2 py-1 text-[8px] font-extrabold ${low ? "bg-[#e9f7ef] text-[#287d4c]" : high ? "bg-[#fff0ee] text-[#c9544d]" : "bg-[#fff6e4] text-[#9b6a1f]"}`}
    >
      {risk}
    </span>
  );
}
function ControlDialog({
  title,
  onClose,
  danger = false,
}: {
  title: string;
  onClose: () => void;
  danger?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#080d1b]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-6 shadow-2xl">
        {done ? (
          <div className="py-8 text-center">
            <span
              className={`mx-auto grid size-14 place-items-center rounded-full ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#e9f7ef] text-[#287d4c]"}`}
            >
              <Check className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-black">Action recorded</h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              Mock operation completed and an immutable audit event was created.
            </p>
            <button
              onClick={onClose}
              className="mt-6 h-10 w-full rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start">
              <span
                className={`grid size-11 place-items-center rounded-xl ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#edf1ff] text-[#5b7cfa]"}`}
              >
                {danger ? (
                  <AlertTriangle className="size-5" />
                ) : (
                  <LockKeyhole className="size-5" />
                )}
              </span>
              <button onClick={onClose} className="ml-auto">
                <X className="size-4" />
              </button>
            </div>
            <h3 className="mt-5 text-lg font-black tracking-[-.03em]">
              {title}
            </h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              This privileged operation will be attributed to your administrator
              account and stored in the audit trail.
            </p>
            <label className="mt-5 grid gap-2 text-[9px] font-extrabold">
              Reason for action
              <textarea
                rows={3}
                placeholder="Provide an operational reason..."
                className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none focus:border-[#5b7cfa]"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-[8px] text-[#737e93]">
              <input type="checkbox" /> I have reviewed the available evidence
              and understand the impact.
            </label>
            <div className="mt-6 flex gap-2">
              <button
                onClick={onClose}
                className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => setDone(true)}
                className={`h-10 flex-1 rounded-xl text-[9px] font-extrabold text-white ${danger ? "bg-[#ce544d]" : "bg-[#11182a]"}`}
              >
                Confirm action
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { GlobalInventory as AdminInventoryScreen };
