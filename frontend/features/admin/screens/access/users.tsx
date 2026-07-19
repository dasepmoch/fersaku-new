"use client";

import {
  adminPanel,
  Metric,
  PanelHead,
  TableToolbar,
  TableHeader,
  AdminStatus,
} from "@/features/admin/ui";

import { Eye, MoreHorizontal, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { ImpersonationDialog } from "@/features/admin/screens/merchants/impersonation-dialog";
import {
  useAdminRoles,
  useAdminStaffDirectory,
  useAdminUsers,
  type AdminUserLookup,
} from "@/features/admin/data";
import { getDomainSource } from "@/shared/data/domain-source";

function UsersPage() {
  const isMock = getDomainSource("adminRead") === "mock";
  const staffQuery = useAdminStaffDirectory();
  const usersQuery = useAdminUsers({ limit: 50 });
  const { data: roles } = useAdminRoles();
  const admins = staffQuery.data ?? [];
  const sellerUsers = useMemo(
    () => (usersQuery.data ?? []).filter((user) => !user.isAdmin),
    [usersQuery.data],
  );
  const [impersonationTarget, setImpersonationTarget] =
    useState<AdminUserLookup | null>(null);
  const { pageRows, pagination } = useClientPagination(admins);
  const adminCount = admins.length;
  const roleCount = (roles ?? []).length;

  const staffLoading = staffQuery.isLoading && !staffQuery.data;
  const staffError =
    !isMock && staffQuery.isError
      ? (staffQuery.error?.message ?? "Administrator directory unavailable")
      : null;
  const staffDenied =
    !isMock && !staffQuery.isLoading && !staffQuery.isError && !staffQuery.data;
  const sellersLoading = usersQuery.isLoading && !usersQuery.data;
  const sellersError =
    !isMock && usersQuery.isError
      ? (usersQuery.error?.message ?? "Seller lookup unavailable")
      : null;
  const sellersDenied =
    !isMock && !usersQuery.isLoading && !usersQuery.isError && !usersQuery.data;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="Seller users"
          value={
            isMock
              ? "1.947"
              : sellerUsers.length > 0
                ? sellerUsers.length.toLocaleString("id-ID")
                : "—"
          }
          note={isMock ? "1,284 stores" : "Lookup via users.read"}
        />
        <Metric
          label="Administrators"
          value={staffLoading && adminCount === 0 ? "—" : String(adminCount)}
          note={`${roleCount} roles`}
        />
        <Metric
          label="Active sessions"
          value={isMock ? "286" : "—"}
          note="Across all users"
        />
        <Metric
          label="Locked accounts"
          value={isMock ? "7" : "—"}
          note="Review required"
          tone="danger"
        />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Administrator access"
          desc="Role-based access to Fersaku Control"
        />
        {staffError && (
          <div
            role="alert"
            className="border-t border-[#f1c7c1] bg-[#fff0ee] px-5 py-3 text-[8px] leading-4 text-[#92443d]"
          >
            {staffError}
          </div>
        )}
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
                <tr
                  key={a.email}
                  className="border-t border-[#e8eaf0] text-[9px]"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-[#e8ecf8] font-black text-[#52617e]">
                        {a.name
                          .split(" ")
                          .map((x) => x[0])
                          .join("")}
                      </span>
                      <div>
                        <b className="text-[10px]">{a.name}</b>
                        <span className="block text-[8px] text-[#8993a6]">
                          {a.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="rounded-lg bg-[#eef1f6] px-2.5 py-1.5 font-bold">
                      {a.roleLabel}
                    </span>
                  </td>
                  <td>
                    {a.mfaEnabled ? (
                      <span className="flex items-center gap-1 text-[#31875a]">
                        <ShieldCheck className="size-3" /> Enabled
                      </span>
                    ) : (
                      <span className="text-[#8993a6]">Pending</span>
                    )}
                  </td>
                  <td>
                    <AdminStatus status={a.status} />
                  </td>
                  <td>{a.lastActive}</td>
                  <td>
                    <MoreHorizontal className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!staffLoading && pageRows.length === 0 && !staffError && (
          <div className="border-t border-[#e8eaf0] px-5 py-4 text-[8px] text-[#8993a6]">
            {staffDenied
              ? "Administrator directory requires users.read."
              : isMock
                ? "No administrators in mock directory."
                : "No administrators returned from users.read."}
          </div>
        )}
        <TablePagination {...pagination} />
      </section>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Seller account controls"
          desc="Search users to reset sessions, verify email, or lock access"
        />
        <TableToolbar placeholder="Search seller name, email, user ID..." />
        {sellersError && (
          <div
            role="alert"
            className="border-t border-[#f1c7c1] bg-[#fff0ee] px-5 py-3 text-[8px] leading-4 text-[#92443d]"
          >
            {sellersError}
          </div>
        )}
        <div className="divide-y divide-[#e8eaf0]">
          {sellerUsers.map((user) => {
            const storeLabel = user.ownerMerchantId?.trim() || "—";
            return (
              <div
                key={user.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#edf1ff] text-[9px] font-black text-[#536fdf]">
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <div className="min-w-0">
                  <b className="block text-[10px]">{user.name}</b>
                  <span className="block truncate text-[8px] text-[#8993a6]">
                    {user.email} • {storeLabel} • {user.id}
                  </span>
                </div>
                <AdminStatus status={user.status} />
                <button
                  type="button"
                  disabled={!user.impersonatable}
                  title={
                    user.impersonatable
                      ? undefined
                      : "Impersonation not available for this account"
                  }
                  onClick={() => {
                    if (!user.impersonatable) return;
                    setImpersonationTarget(user);
                  }}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] px-3 text-[8px] font-extrabold sm:ml-auto disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Eye className="size-3.5" /> Open as user
                </button>
              </div>
            );
          })}
        </div>
        {!sellersLoading && sellerUsers.length === 0 && !sellersError && (
          <div className="border-t border-[#e8eaf0] px-5 py-4 text-[8px] text-[#8993a6]">
            {sellersDenied
              ? "Seller lookup requires users.read."
              : isMock
                ? "No seller accounts in mock lookup."
                : "No seller accounts returned from users.read."}
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-[#e8eaf0] p-5 text-[8px] text-[#8993a6]">
          <Users className="size-4 text-[#a1a9b8]" />
          <span>
            {isMock
              ? "Showing a mock lookup result. Production impersonation requires a server-issued, time-limited session and immutable audit event."
              : "Seller lookup uses users.read. Impersonation requires a server-issued session (ADM-390)."}
          </span>
        </div>
      </section>
      {impersonationTarget && impersonationTarget.impersonatable && (
        <ImpersonationDialog
          merchant={impersonationTarget.name}
          merchantId={impersonationTarget.id}
          targetEmail={impersonationTarget.email}
          targetType="user"
          onClose={() => setImpersonationTarget(null)}
        />
      )}
    </>
  );
}

export { UsersPage as AdminUsersScreen };
