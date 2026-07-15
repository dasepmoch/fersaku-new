"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronRight,
  Eye,
  FileDown,
  Filter,
  KeyRound,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { useState } from "react";
import { rupiah } from "@/lib/utils";
import { buyerPurchases, buyerSessions } from "@/lib/buyer-mock-data";
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
function BuyerIdentities() {
  const buyers = [
    {
      id: "byr_91K2",
      name: "Nadia Putri",
      email: "nadia@studio.id",
      verified: "Verified",
      purchases: 4,
      spent: 395000,
      sessions: 3,
      last: "Now",
    },
    {
      id: "byr_91J8",
      name: "Rizky Hidayat",
      email: "rizky@gmail.com",
      verified: "Verified",
      purchases: 7,
      spent: 842000,
      sessions: 1,
      last: "8m ago",
    },
    {
      id: "byr_90X4",
      name: "Dimas Ardi",
      email: "dimas@hey.com",
      verified: "Pending",
      purchases: 1,
      spent: 59000,
      sessions: 0,
      last: "21m ago",
    },
    {
      id: "byr_90W1",
      name: "Sinta Maharani",
      email: "sinta@mail.id",
      verified: "Verified",
      purchases: 3,
      spent: 218000,
      sessions: 2,
      last: "1h ago",
    },
    {
      id: "byr_90V7",
      name: "Fajar Nugroho",
      email: "fajar@hey.com",
      verified: "Verified",
      purchases: 12,
      spent: 1540000,
      sessions: 4,
      last: "3h ago",
    },
    {
      id: "byr_90U2",
      name: "Laras Ayu",
      email: "laras@studio.id",
      verified: "Pending",
      purchases: 0,
      spent: 0,
      sessions: 1,
      last: "5h ago",
    },
  ];
  const { pageRows, pagination } = useClientPagination(buyers);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Buyer identities" value="8.942" note="6,812 verified" />
        <Metric
          label="Purchase links"
          value="12.481"
          note="Across 1,284 stores"
        />
        <Metric label="Active sessions" value="2.184" note="30 day sessions" />
        <Metric
          label="Unclaimed purchases"
          value="184"
          note="Email not verified"
          tone="warning"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <TableToolbar placeholder="Search buyer ID, email, order, or product..." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <TableHeader
              labels={[
                "Buyer",
                "Email state",
                "Purchases",
                "Lifetime spend",
                "Sessions",
                "Last active",
                "",
              ]}
            />
            <tbody>
              {pageRows.map((b) => (
                <tr key={b.id} className="border-t border-[#e8eaf0] text-[9px]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/buyers/${b.id}`}
                      className="flex items-center gap-3"
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-[#e8ecf7] font-black">
                        {b.name
                          .split(" ")
                          .map((x) => x[0])
                          .join("")}
                      </span>
                      <div>
                        <b className="block text-[10px]">{b.name}</b>
                        <code className="text-[8px] text-[#8993a6]">
                          {b.id}
                        </code>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <AdminStatus status={b.verified} />
                    <span className="ml-2">{b.email}</span>
                  </td>
                  <td>{b.purchases}</td>
                  <td className="font-extrabold">{rupiah(b.spent)}</td>
                  <td>{b.sessions}</td>
                  <td>{b.last}</td>
                  <td>
                    <ChevronRight className="size-4" />
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
function BuyerIdentityDetail({ id }: { id: string }) {
  const [action, setAction] = useState<string | null>(null);
  const [sessions, setSessions] = useState(buyerSessions);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <AdminButton
          secondary
          onClick={() => setAction("Send buyer magic link")}
        >
          <KeyRound className="size-4" /> Send magic link
        </AdminButton>
        <AdminButton
          secondary
          onClick={() => setAction("Change verified buyer email")}
        >
          <UserCog className="size-4" /> Change email
        </AdminButton>
        <button
          onClick={() => setSessions([])}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#efc8c4] bg-[#fff5f4] px-4 text-[9px] font-extrabold text-[#c6534c]"
        >
          <Ban className="size-4" /> Revoke all sessions
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className={`${panel} p-6`}>
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-full bg-[#ffb69d] text-sm font-black">
              NP
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black">Nadia Putri</h2>
                <AdminStatus status="Verified" />
              </div>
              <p className="mt-1 text-[9px] text-[#7d879b]">
                nadia@studio.id • {id}
              </p>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric label="Purchases" value="4" note="Across 4 sellers" />
            <Metric
              label="Lifetime spend"
              value="Rp395.000"
              note="No refunds"
            />
            <Metric
              label="Active sessions"
              value={String(sessions.length)}
              note="Passwordless login"
            />
          </div>
          <div className="mt-7 border-t border-[#e5e8ef] pt-6">
            <h3 className="text-[10px] font-black">
              Cross-store purchase access
            </h3>
            <p className="mt-1 text-[8px] text-[#7d879b]">
              Admins can inspect access globally. Individual sellers remain
              isolated to orders from their own store.
            </p>
            <div className="mt-4 grid gap-3">
              {buyerPurchases.map((p) => (
                <div
                  key={p.orderId}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-[#e1e5ed] p-3"
                >
                  <div>
                    <b className="block text-[9px]">{p.product}</b>
                    <span className="text-[7px] text-[#8993a6]">
                      {p.seller} • {p.orderId}
                    </span>
                  </div>
                  <AdminStatus status={p.status} />
                  <Link href={`/admin/orders/${p.orderId}`}>
                    <Eye className="size-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={`${panel} overflow-hidden`}>
          <PanelHead
            title="Buyer sessions"
            desc="Magic-link sessions and device access"
          />
          <div>
            {sessions.length ? (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-t border-[#e8eaf0] p-4"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-[#edf1ff]">
                    <ShieldCheck className="size-3.5 text-[#5b7cfa]" />
                  </span>
                  <div>
                    <b className="block text-[8px]">{s.device}</b>
                    <span className="text-[7px] text-[#8993a6]">
                      {s.ip} • {s.active}
                    </span>
                  </div>
                  {!s.current && (
                    <button
                      onClick={() =>
                        setSessions((current) =>
                          current.filter((x) => x.id !== s.id),
                        )
                      }
                      className="ml-auto text-[8px] font-bold text-[#c6534c]"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[9px] text-[#7d879b]">
                All buyer sessions revoked.
              </div>
            )}
          </div>
        </section>
      </div>
      {action && (
        <ControlDialog title={action} onClose={() => setAction(null)} />
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
  BuyerIdentities as AdminBuyersScreen,
  BuyerIdentityDetail as AdminBuyerDetailScreen,
};
