"use client";

import {
  adminPanel,
  Metric,
  PanelHead,
  TableToolbar,
  TableHeader,
  AdminStatus,
} from "@/features/admin/ui";

import { MoreHorizontal, ShieldCheck, Users } from "lucide-react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

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
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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

export { UsersPage as AdminUsersScreen };
