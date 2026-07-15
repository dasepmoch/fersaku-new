"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  Ban,
  Check,
  Eye,
  FileClock,
  FileDown,
  Filter,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { adminOrders, auditEvents, merchants } from "@/lib/admin-mock-data";
import { rupiah } from "@/lib/utils";
import { MerchantFeeConfigurator } from "@/features/admin/commerce/merchant-fees";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
function AdminButton({
  children,
  secondary = false,
  onClick,
}: {
  children: React.ReactNode;
  secondary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-extrabold transition ${secondary ? "border border-[#d8dde8] bg-white text-[#3c465d] hover:bg-[#f8f9fb]" : "bg-[#11182a] text-white hover:-translate-y-0.5 hover:bg-[#202b48]"}`}
    >
      {children}
    </button>
  );
}
function Merchants() {
  const { pageRows, pagination } = useClientPagination(merchants);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total merchants" value="1.284" note="+86 this month" />
        <Metric label="Active volume" value="Rp684jt" note="30 day GMV" />
        <Metric
          label="Restricted"
          value="12"
          note="4 pending review"
          tone="danger"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <TableToolbar placeholder="Search merchant, owner, email, store ID..." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <TableHeader
              labels={[
                "Merchant",
                "Owner",
                "30D volume",
                "Orders",
                "Risk",
                "Status",
                "Joined",
                "",
              ]}
            />
            <tbody>
              {pageRows.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-[#e8eaf0] text-[9px] hover:bg-[#fafbfc]"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/merchants/${m.id}`}
                      className="flex items-center gap-3"
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-[#edf1ff] font-black text-[#5b7cfa]">
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <b className="block text-[10px] text-[#22283a]">
                          {m.name}
                        </b>
                        <code className="text-[8px] text-[#8993a6]">
                          {m.id}
                        </code>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <b className="block">{m.owner}</b>
                    <span className="text-[8px] text-[#8993a6]">{m.email}</span>
                  </td>
                  <td className="font-extrabold">{rupiah(m.volume)}</td>
                  <td>{m.orders}</td>
                  <td>
                    <RiskBadge risk={m.risk} />
                  </td>
                  <td>
                    <AdminStatus status={m.status} />
                  </td>
                  <td className="text-[#737e93]">{m.joined}</td>
                  <td>
                    <MoreHorizontal className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
    </>
  );
}
function MerchantDetail({ id }: { id: string }) {
  const merchant = merchants.find((m) => m.id === id) || merchants[0];
  const [action, setAction] = useState<string | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <AdminButton
          secondary
          onClick={() => setAction("Impersonate merchant")}
        >
          <Eye className="size-4" /> Impersonate
        </AdminButton>
        <AdminButton
          secondary
          onClick={() => setAction("Reset merchant API keys")}
        >
          <KeyRound className="size-4" /> Rotate keys
        </AdminButton>
        <button
          onClick={() =>
            setAction(
              merchant.status === "Suspended"
                ? "Restore merchant"
                : "Suspend merchant",
            )
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#f2c4c0] bg-[#fff5f4] px-4 text-[10px] font-extrabold text-[#c74f48]"
        >
          <Ban className="size-4" />{" "}
          {merchant.status === "Suspended" ? "Restore" : "Suspend merchant"}
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className={`${panel} p-6`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-[#eaf0ff] text-xl font-black text-[#5b7cfa]">
              {merchant.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-[-.03em]">
                  {merchant.name}
                </h2>
                <AdminStatus status={merchant.status} />
              </div>
              <p className="mt-1 text-[10px] text-[#778297]">
                {merchant.id} • Joined {merchant.joined}
              </p>
            </div>
            <div className="sm:ml-auto">
              <RiskBadge risk={merchant.risk} />
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Lifetime GMV"
              value={rupiah(82640000)}
              note="482 orders"
            />
            <Metric
              label="Available balance"
              value={rupiah(18240500)}
              note="No active holds"
            />
            <Metric
              label="Platform revenue"
              value={rupiah(3184000)}
              note="3% + fees"
            />
          </div>
          <div className="mt-7 grid gap-5 border-t border-[#e5e8ef] pt-6 sm:grid-cols-2">
            <Info
              title="Owner & business"
              rows={[
                ["Legal name", merchant.owner],
                ["Email", merchant.email],
                ["Business type", "Individual creator"],
                ["Tax status", "Not verified"],
              ]}
            />
            <Info
              title="Operational state"
              rows={[
                ["Storefront", "Published"],
                ["Payments", "Enabled"],
                ["Withdrawals", "Enabled"],
                ["Settlement", "T+1 day"],
              ]}
            />
          </div>
        </section>
        <section className={`${panel} overflow-hidden`}>
          <PanelHead title="Account timeline" desc="Latest sensitive changes" />
          <div>
            {auditEvents.slice(0, 5).map((e) => (
              <div
                key={e.id}
                className="flex gap-3 border-t border-[#e8eaf0] p-4"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#edf1ff]">
                  <FileClock className="size-3 text-[#5b7cfa]" />
                </span>
                <div>
                  <p className="font-mono text-[9px] font-bold">{e.action}</p>
                  <p className="mt-1 text-[8px] text-[#8791a5]">
                    {e.actor} • {e.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <MerchantFeeConfigurator merchantName={merchant.name} />
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className={`${panel} overflow-hidden`}>
          <PanelHead
            title="Recent orders"
            desc="Last transactions for this merchant"
            action={
              <Link
                href="/admin/orders"
                className="text-[9px] font-bold text-[#5b7cfa]"
              >
                View global orders
              </Link>
            }
          />
          {adminOrders.slice(0, 4).map((o) => (
            <div
              key={o.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-[#e8eaf0] px-5 py-4 text-[9px]"
            >
              <div>
                <Link href={`/admin/orders/${o.id}`} className="font-bold">
                  {o.id}
                </Link>
                <span className="mt-1 block text-[8px] text-[#8993a6]">
                  {o.customer} • {o.product}
                </span>
              </div>
              <AdminStatus status={o.status} />
              <b>{rupiah(o.gross)}</b>
            </div>
          ))}
        </section>
        <section className={`${panel} overflow-hidden`}>
          <PanelHead
            title="Balance controls"
            desc="Manual balance action requires reason and audit"
          />
          <div className="grid grid-cols-2 gap-3 p-5">
            <button
              onClick={() => setAction("Add balance adjustment")}
              className="rounded-xl border border-[#dce1eb] p-4 text-left hover:bg-[#f8f9fb]"
            >
              <Plus className="size-4 text-[#2f9d60]" />
              <b className="mt-6 block text-[10px]">Credit adjustment</b>
              <span className="mt-1 block text-[8px] text-[#8993a6]">
                Add auditable funds
              </span>
            </button>
            <button
              onClick={() => setAction("Create balance debit")}
              className="rounded-xl border border-[#dce1eb] p-4 text-left hover:bg-[#f8f9fb]"
            >
              <ArrowDownRight className="size-4 text-[#df5d55]" />
              <b className="mt-6 block text-[10px]">Debit adjustment</b>
              <span className="mt-1 block text-[8px] text-[#8993a6]">
                Deduct or lock funds
              </span>
            </button>
          </div>
        </section>
      </div>
      {action === "Impersonate merchant" ? (
        <ImpersonationDialog
          merchant={merchant.name}
          merchantId={merchant.id}
          onClose={() => setAction(null)}
        />
      ) : action ? (
        <ControlDialog title={action} onClose={() => setAction(null)} />
      ) : null}
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
function TableToolbar({
  placeholder,
  inline = false,
}: {
  placeholder: string;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? "w-full max-w-md"
          : "flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row"
      }
    >
      <SearchInput placeholder={placeholder} />
      {!inline && (
        <div className="flex gap-2 sm:ml-auto">
          <SelectButton label="All statuses" />
          <button className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold">
            <Filter className="size-3.5" /> More filters
          </button>
          <button className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold">
            <FileDown className="size-3.5" /> Export
          </button>
        </div>
      )}
    </div>
  );
}
function SearchInput({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[#8590a4]">
      <Search className="size-3.5" />
      <input
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[9px] outline-none"
      />
    </div>
  );
}
function SelectButton({ label }: { label: string }) {
  return (
    <button className="h-10 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold whitespace-nowrap text-[#667188]">
      {label}
    </button>
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
function Info({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div>
      <h3 className="mb-4 text-[9px] font-black tracking-[.1em] text-[#778297] uppercase">
        {title}
      </h3>
      <div className="grid gap-3">
        {rows.map((r) => (
          <div key={r[0]} className="flex justify-between gap-4 text-[9px]">
            <span className="text-[#818ca1]">{r[0]}</span>
            <b className="text-right">{r[1]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
function ImpersonationDialog({
  merchant,
  merchantId,
  onClose,
}: {
  merchant: string;
  merchantId: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState("read-only");
  const [reason, setReason] = useState("");
  const [fullConfirmed, setFullConfirmed] = useState(false);
  const scopePolicy = (
    {
      "read-only": {
        allowed: [
          "View dashboard and settings",
          "Inspect product and order state",
          "Reproduce navigation issues",
        ],
        blocked: [
          "Edit data",
          "Reveal credentials",
          "Change bank or withdraw funds",
        ],
      },
      "support-write": {
        allowed: [
          "Edit non-sensitive store content",
          "Retry safe delivery jobs",
          "Upload replacement product files",
        ],
        blocked: [
          "Reveal secrets",
          "Change bank or balance",
          "Manage API keys or staff",
        ],
      },
      full: {
        allowed: [
          "All seller workspace actions",
          "Sensitive configuration with step-up checks",
          "Incident remediation",
        ],
        blocked: [
          "Silent secret export",
          "Bypass immutable audit",
          "Disable impersonation banner",
        ],
      },
    } as Record<string, { allowed: string[]; blocked: string[] }>
  )[scope];
  const canStart =
    reason.trim().length >= 12 && (scope !== "full" || fullConfirmed);
  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-[#080d1b]/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
        <div className="flex items-start">
          <span className="grid size-11 place-items-center rounded-xl bg-[#fff5df] text-[#c47d1f]">
            <Eye className="size-5" />
          </span>
          <button onClick={onClose} className="ml-auto">
            <X className="size-4" />
          </button>
        </div>
        <h3 className="mt-5 text-lg font-black">Impersonate {merchant}</h3>
        <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
          Creates a time-limited administrator session inside the seller
          workspace. The seller identity is never replaced and every action
          remains attributed to you.
        </p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-[9px] font-extrabold">
            Session scope
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setFullConfirmed(false);
              }}
              className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px]"
            >
              <option value="read-only">Read-only investigation</option>
              <option value="support-write">Support write access</option>
              <option value="full">Full privileged access</option>
            </select>
          </label>
          <div className="grid gap-3 rounded-2xl border border-[#e2e6ed] bg-[#f7f8fa] p-4 sm:grid-cols-2">
            <div>
              <p className="text-[7px] font-extrabold tracking-wider text-[#277a4b] uppercase">
                Allowed in this scope
              </p>
              <div className="mt-3 grid gap-2">
                {scopePolicy.allowed.map((item) => (
                  <span key={item} className="flex gap-2 text-[8px] leading-4">
                    <Check className="mt-0.5 size-3 shrink-0 text-[#277a4b]" />{" "}
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[7px] font-extrabold tracking-wider text-[#c9544d] uppercase">
                Always blocked / guarded
              </p>
              <div className="mt-3 grid gap-2">
                {scopePolicy.blocked.map((item) => (
                  <span key={item} className="flex gap-2 text-[8px] leading-4">
                    <LockKeyhole className="mt-0.5 size-3 shrink-0 text-[#c9544d]" />{" "}
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <label className="grid gap-2 text-[9px] font-extrabold">
            Session duration
            <select className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px]">
              <option>15 minutes</option>
              <option>30 minutes</option>
              <option>60 minutes</option>
            </select>
          </label>
          {scope === "full" && (
            <label className="flex gap-3 rounded-xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
              <input
                type="checkbox"
                checked={fullConfirmed}
                onChange={(event) => setFullConfirmed(event.target.checked)}
                className="mt-0.5"
              />
              I have an approved incident or escalation requiring full access
              and understand that sensitive actions still trigger step-up
              confirmation.
            </label>
          )}
          <label className="grid gap-2 text-[9px] font-extrabold">
            Required reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ticket, incident, or investigation context..."
              className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none"
            />
          </label>
        </div>
        <div className="mt-5 rounded-xl bg-[#fff8e9] p-4 text-[8px] leading-4 text-[#806f4f]">
          A persistent impersonation banner will appear. Credential reveals,
          exports, balance changes, and destructive actions still require
          separate confirmation.
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
          >
            Cancel
          </button>
          <Link
            href={`/dashboard?impersonate=${merchantId}&scope=${scope}`}
            className={`flex h-10 flex-1 items-center justify-center rounded-xl text-[9px] font-extrabold text-white ${canStart ? "bg-[#11182a]" : "pointer-events-none bg-[#9aa2b2]"}`}
          >
            Start audited session
          </Link>
        </div>
      </div>
    </div>
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

export {
  Merchants as AdminMerchantsScreen,
  MerchantDetail as AdminMerchantDetailScreen,
};
