"use client";

import {
  adminPanel,
  Metric,
  TableToolbar,
  TableHeader,
  AdminStatus,
} from "@/features/admin/ui";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { rupiah } from "@/lib/utils";
import { useAdminBuyers } from "@/features/admin/data";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

export function BuyerIdentities() {
  const { data } = useAdminBuyers();
  const buyers = data ?? [];
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
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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
