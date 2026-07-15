"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Check,
  FileClock,
  FileDown,
  Filter,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { adminRoles, permissionGroups } from "@/lib/admin-mock-data";
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
function AdminProfileSettings() {
  const [saved, setSaved] = useState(false);
  const [mfa, setMfa] = useState(true);
  const [sessions, setSessions] = useState([
    {
      id: "current",
      device: "Chrome on Linux",
      ip: "103.28.54.11",
      active: "Now",
      current: true,
    },
    {
      id: "mobile",
      device: "Safari on iPhone",
      ip: "180.252.91.18",
      active: "2h ago",
      current: false,
    },
  ]);
  const [notifs, setNotifs] = useState({
    risk: true,
    withdrawals: true,
    incidents: true,
    digest: false,
  });
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className={`${panel} p-5 sm:p-7`}>
        <SettingsGroup
          title="Staff identity"
          desc="Your administrator identity is shown in every audit event."
        >
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-full bg-[#5b7cfa] text-sm font-black text-white">
              DK
            </span>
            <div>
              <button className="rounded-lg border border-[#dce1e9] bg-white px-3 py-2 text-[8px] font-bold">
                Upload new photo
              </button>
              <p className="mt-2 text-[7px] text-[#7d879b]">
                PNG or JPG • maximum 2 MB
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <AdminInput label="Full name" value="Dinda Kusuma" />
            <AdminInput label="Work email" value="dinda@fersaku.id" />
            <AdminInput label="Job title" value="Head of Platform Operations" />
            <AdminInput label="Timezone" value="Asia/Jakarta" />
          </div>
        </SettingsGroup>
        <SettingsGroup
          title="Personal notifications"
          desc="Security events remain mandatory."
        >
          <div className="grid gap-3">
            {[
              ["risk", "Critical risk cases"],
              ["withdrawals", "High-value withdrawal reviews"],
              ["incidents", "Provider and infrastructure incidents"],
              ["digest", "Daily operations digest"],
            ].map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-[#e1e5ed] p-4"
              >
                <div>
                  <b className="block text-[9px]">{label}</b>
                  <span className="text-[7px] text-[#7d879b]">
                    Email and in-console notification
                  </span>
                </div>
                <Toggle
                  value={notifs[key as keyof typeof notifs]}
                  onChange={() =>
                    setNotifs({
                      ...notifs,
                      [key]: !notifs[key as keyof typeof notifs],
                    })
                  }
                />
              </div>
            ))}
          </div>
        </SettingsGroup>
        <div className="flex justify-end">
          <AdminButton onClick={() => setSaved(true)}>
            <Check className="size-4" />
            {saved ? "Profile saved & audited" : "Save profile"}
          </AdminButton>
        </div>
      </section>
      <aside className="grid content-start gap-4">
        <section className={`${panel} p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[10px] font-black">
                Multi-factor authentication
              </h3>
              <p className="mt-1 text-[7px] text-[#7d879b]">
                Required for Super Administrators
              </p>
            </div>
            <Toggle value={mfa} onChange={() => setMfa(!mfa)} />
          </div>
          <div className="mt-4 rounded-xl bg-[#edf1ff] p-3 text-[8px] text-[#536ba9]">
            Authenticator verified • Recovery codes generated 2 Jul 2026
          </div>
          <button className="mt-3 h-9 w-full rounded-lg border border-[#dce1e9] text-[8px] font-bold">
            Regenerate recovery codes
          </button>
        </section>
        <section className={`${panel} overflow-hidden`}>
          <PanelHead title="Trusted sessions" desc="Administrator devices" />
          <div>
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 border-t border-[#e8eaf0] p-4"
              >
                <span className="grid size-8 place-items-center rounded-xl bg-[#edf1ff]">
                  <ShieldCheck className="size-3.5 text-[#5b7cfa]" />
                </span>
                <div>
                  <b className="block text-[8px]">{session.device}</b>
                  <span className="text-[7px] text-[#7d879b]">
                    {session.ip} • {session.active}
                  </span>
                </div>
                {!session.current && (
                  <button
                    onClick={() =>
                      setSessions((current) =>
                        current.filter((item) => item.id !== session.id),
                      )
                    }
                    className="ml-auto text-[7px] font-bold text-[#c6534c]"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
function UsersPage() {
  const admins = [
    ["Dinda Kusuma", "dinda@fersaku.id", "Super admin", "Active", "Now"],
    ["Raka Mahendra", "raka@fersaku.id", "Risk analyst", "Active", "8m ago"],
    ["Salsa Putri", "salsa@fersaku.id", "Finance ops", "Active", "42m ago"],
    ["Kevin Tan", "kevin@fersaku.id", "Support", "Invited", "Never"],
    ["Niko Aditya", "niko@fersaku.id", "Support", "Active", "1h ago"],
    ["Fara Anindya", "fara@fersaku.id", "Risk analyst", "Active", "2h ago"],
  ];
  const { pageRows, pagination } = useClientPagination(admins);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Seller users" value="1.947" note="1,284 stores" />
        <Metric label="Administrators" value="12" note="4 roles" />
        <Metric label="Active sessions" value="286" note="Across all users" />
        <Metric
          label="Locked accounts"
          value="7"
          note="Review required"
          tone="danger"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Administrator access"
          desc="Role-based access to Fersaku Control"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <TableHeader
              labels={[
                "Administrator",
                "Role",
                "MFA",
                "Status",
                "Last active",
                "",
              ]}
            />
            <tbody>
              {pageRows.map((a) => (
                <tr key={a[1]} className="border-t border-[#e8eaf0] text-[9px]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-[#e8ecf8] font-black text-[#52617e]">
                        {a[0]
                          .split(" ")
                          .map((x) => x[0])
                          .join("")}
                      </span>
                      <div>
                        <b className="text-[10px]">{a[0]}</b>
                        <span className="block text-[8px] text-[#8993a6]">
                          {a[1]}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="rounded-lg bg-[#eef1f6] px-2.5 py-1.5 font-bold">
                      {a[2]}
                    </span>
                  </td>
                  <td>
                    <span className="flex items-center gap-1 text-[#31875a]">
                      <ShieldCheck className="size-3" /> Enabled
                    </span>
                  </td>
                  <td>
                    <AdminStatus status={a[3]} />
                  </td>
                  <td>{a[4]}</td>
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
      <section className={`${panel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Seller account controls"
          desc="Search users to reset sessions, verify email, or lock access"
        />
        <TableToolbar placeholder="Search seller name, email, user ID..." />
        <div className="p-8 text-center">
          <Users className="mx-auto size-8 text-[#a1a9b8]" />
          <h3 className="mt-3 text-xs font-black">
            Search 1,947 seller accounts
          </h3>
          <p className="mt-1 text-[9px] text-[#8993a6]">
            Full user details appear after searching.
          </p>
        </div>
      </section>
    </>
  );
}
function RolesPage() {
  const [cloneRole, setCloneRole] = useState<string | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Administrator roles"
          value={String(adminRoles.length)}
          note="1 protected system role"
        />
        <Metric
          label="Staff accounts"
          value="18"
          note="16 active • 2 invited"
        />
        <Metric
          label="Permission grants"
          value="142"
          note="Across all assignments"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Access roles"
          desc="Each staff account inherits permissions from one or more roles"
        />
        <div className="grid gap-3 border-t border-[#e8eaf0] p-4 md:grid-cols-2 xl:grid-cols-3">
          {adminRoles.map((role) => (
            <article
              key={role.id}
              className="rounded-2xl border border-[#dfe3ec] bg-[#fbfcfe] p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span
                  className="grid size-10 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: role.color }}
                >
                  <KeyRound className="size-4" />
                </span>
                {role.system ? (
                  <span className="rounded-full bg-[#edf1ff] px-2 py-1 text-[7px] font-extrabold text-[#506fdf]">
                    PROTECTED
                  </span>
                ) : (
                  <MoreHorizontal className="size-4 text-[#8b95a8]" />
                )}
              </div>
              <h3 className="mt-5 text-[11px] font-black">{role.name}</h3>
              <p className="mt-2 min-h-10 text-[8px] leading-4 text-[#7d879b]">
                {role.description}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-[#e6e9ef] pt-4">
                <span className="flex items-center gap-1.5 text-[8px] font-bold text-[#748097]">
                  <Users className="size-3" />
                  {role.members} staff
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCloneRole(role.name)}
                    className="text-[8px] font-extrabold text-[#66738c]"
                  >
                    Clone
                  </button>
                  <Link
                    href={`/admin/roles/${role.id}`}
                    className="text-[8px] font-extrabold text-[#4f6fe1]"
                  >
                    Configure →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className={`${panel} mt-4 p-5`}>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff5df] text-[#d18a24]">
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h3 className="text-[10px] font-black">Least-privilege policy</h3>
            <p className="mt-1 text-[8px] leading-4 text-[#7c879d]">
              Permission changes take effect immediately, revoke affected
              sessions, and create an immutable audit event containing the old
              and new grants.
            </p>
          </div>
        </div>
      </section>
      {cloneRole && (
        <ControlDialog
          title={`Clone ${cloneRole}`}
          onClose={() => setCloneRole(null)}
        />
      )}
    </>
  );
}
function RoleBuilder({ id }: { id: string }) {
  const isNew = id === "new";
  const role = adminRoles.find((item) => item.id === id) || adminRoles[1];
  const defaults = new Set(
    isNew
      ? ["merchants.read", "risk.read"]
      : role.id === "role_finance"
        ? [
            "merchants.read",
            "orders.refund",
            "payments.reconcile",
            "balance.adjust",
            "withdrawals.review",
            "withdrawals.approve",
            "audit.export",
          ]
        : permissionGroups.flatMap((group) =>
            group.permissions.map((permission) => permission[0]),
          ),
  );
  const [selected, setSelected] = useState<Set<string>>(defaults);
  const [saved, setSaved] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const togglePermission = (permission: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  const toggleGroup = (permissions: string[]) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = permissions.every((permission) => next.has(permission));
      permissions.forEach((permission) =>
        all ? next.delete(permission) : next.add(permission),
      );
      return next;
    });
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <section className={`${panel} p-5 sm:p-7`}>
          <div className="flex flex-col gap-4 border-b border-[#e5e8ef] pb-6 sm:flex-row sm:items-start">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#edf1ff] text-[#5b7cfa]">
              <KeyRound className="size-5" />
            </span>
            <div className="flex-1">
              <input
                defaultValue={isNew ? "Custom operations role" : role.name}
                className="w-full border-0 bg-transparent text-xl font-black tracking-[-.03em] outline-none"
              />
              <textarea
                defaultValue={
                  isNew
                    ? "Describe what this staff role is responsible for."
                    : role.description
                }
                rows={2}
                className="mt-2 w-full resize-none border-0 bg-transparent text-[9px] leading-4 text-[#7d879b] outline-none"
              />
            </div>
            <AdminStatus status={isNew ? "Draft" : "Active"} />
          </div>
          <div className="mt-7">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[11px] font-black">Permission matrix</h3>
                <p className="mt-1 text-[8px] text-[#8791a5]">
                  {selected.size} permissions currently granted
                </p>
              </div>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[8px] font-extrabold text-[#c6544d]"
              >
                Clear all
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              {permissionGroups.map((group) => {
                const keys = group.permissions.map(
                  (permission) => permission[0],
                );
                const all = keys.every((permission) =>
                  selected.has(permission),
                );
                return (
                  <div
                    key={group.group}
                    className="overflow-hidden rounded-2xl border border-[#dfe3ec]"
                  >
                    <div className="flex items-center justify-between bg-[#f6f8fb] px-4 py-3">
                      <div>
                        <b className="text-[9px]">{group.group}</b>
                        <span className="ml-2 text-[7px] text-[#8b95a8]">
                          {
                            keys.filter((permission) =>
                              selected.has(permission),
                            ).length
                          }
                          /{keys.length} granted
                        </span>
                      </div>
                      <Toggle value={all} onChange={() => toggleGroup(keys)} />
                    </div>
                    <div>
                      {group.permissions.map(([permission, description]) => (
                        <label
                          key={permission}
                          className="flex cursor-pointer items-center gap-3 border-t border-[#e8eaf0] px-4 py-3.5"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(permission)}
                            onChange={() => togglePermission(permission)}
                            className="size-4 accent-[#5b7cfa]"
                          />
                          <div>
                            <code className="text-[8px] font-bold text-[#405dca]">
                              {permission}
                            </code>
                            <p className="mt-1 text-[7px] text-[#8791a5]">
                              {description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-7 flex justify-end gap-2 border-t border-[#e5e8ef] pt-6">
            <AdminButton secondary>Cancel</AdminButton>
            <AdminButton onClick={() => setSaved(true)}>
              <Check className="size-4" />
              {saved ? "Role saved & audited" : "Save role permissions"}
            </AdminButton>
          </div>
        </section>
        <aside className="grid content-start gap-4">
          <section className={`${panel} p-5`}>
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black">Assigned staff</h3>
              <button
                onClick={() => setAssigning(true)}
                className="text-[8px] font-extrabold text-[#4f6fe1]"
              >
                + Assign staff
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {[
                ["Salsa Putri", "salsa@fersaku.id", "SP"],
                ["Niko Aditya", "niko@fersaku.id", "NA"],
                ["Fara Anindya", "fara@fersaku.id", "FA"],
              ]
                .slice(0, role.members > 2 ? 3 : 2)
                .map((member) => (
                  <div key={member[1]} className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-[#e8ecf7] text-[8px] font-black">
                      {member[2]}
                    </span>
                    <div className="min-w-0">
                      <b className="block truncate text-[8px]">{member[0]}</b>
                      <span className="block truncate text-[7px] text-[#8993a6]">
                        {member[1]}
                      </span>
                    </div>
                    <button className="ml-auto text-[#a0a8b7]">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
            </div>
          </section>
          <section className={`${panel} p-5`}>
            <h3 className="text-[10px] font-black">Security impact</h3>
            <div className="mt-4 grid gap-3">
              {[
                [ShieldCheck, "MFA required", "All assigned staff"],
                [FileClock, "Fully audited", "Every permission change"],
                [LockKeyhole, "Session rotation", "On privilege escalation"],
              ].map(([Icon, title, desc]) => (
                <div key={title as string} className="flex gap-3">
                  <Icon className="size-3.5 text-[#5b7cfa]" />
                  <div>
                    <b className="block text-[8px]">{title as string}</b>
                    <span className="text-[7px] text-[#8993a6]">
                      {desc as string}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {!isNew && !role.system && (
            <button className="h-10 rounded-xl border border-[#efc8c4] bg-[#fff5f4] text-[8px] font-extrabold text-[#c6534c]">
              Delete custom role
            </button>
          )}
        </aside>
      </div>
      {assigning && (
        <ControlDialog
          title="Assign staff to role"
          onClose={() => setAssigning(false)}
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
function SettingsGroup({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7 border-b border-[#e5e8ef] pb-7 last:border-0">
      <h3 className="text-[11px] font-black">{title}</h3>
      <p className="mt-1 mb-5 text-[8px] text-[#8490a5]">{desc}</p>
      {children}
    </div>
  );
}
function AdminInput({
  label,
  value,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <div className="flex h-11 overflow-hidden rounded-xl border border-[#dce1e9] bg-white">
        {prefix && (
          <span className="grid place-items-center border-r border-[#e2e5ec] bg-[#f5f6f9] px-3 text-[9px] text-[#798499]">
            {prefix}
          </span>
        )}
        <input
          defaultValue={value}
          className="min-w-0 flex-1 px-3 text-[10px] outline-none"
        />
        {suffix && (
          <span className="grid place-items-center border-l border-[#e2e5ec] bg-[#f5f6f9] px-3 text-[9px] text-[#798499]">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
function Toggle({
  value,
  onChange,
  danger = false,
}: {
  value: boolean;
  onChange: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? (danger ? "bg-[#d95850]" : "bg-[#5b7cfa]") : "bg-[#cfd4df]"}`}
    >
      <span
        className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${value ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

export {
  UsersPage as AdminUsersScreen,
  AdminProfileSettings as AdminProfileScreen,
  RolesPage as AdminRolesScreen,
  RoleBuilder as AdminRoleBuilderScreen,
};
