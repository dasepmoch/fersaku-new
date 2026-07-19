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
import { getDomainSource } from "@/shared/data/domain-source";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

export function BuyerIdentities() {
  const isMock = getDomainSource("adminRead") === "mock";
  const { data } = useAdminBuyers();
  const buyers = data ?? [];
  const { pageRows, pagination } = useClientPagination(buyers);

  const identityLabel = isMock
    ? "8.942"
    : buyers.length > 0
      ? buyers.length.toLocaleString("id-ID")
      : "—";
  const purchaseLinksLabel = isMock
    ? "12.481"
    : buyers.length > 0
      ? buyers
          .reduce((sum, b) => sum + Math.max(0, b.purchases), 0)
          .toLocaleString("id-ID")
      : "—";
  const sessionsLabel = isMock
    ? "2.184"
    : buyers.length > 0
      ? buyers
          .reduce((sum, b) => sum + Math.max(0, b.sessions), 0)
          .toLocaleString("id-ID")
      : "—";
  const unclaimedLabel = isMock
    ? "184"
    : String(buyers.filter((b) => b.verified !== "Verified").length);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="Buyer identities"
          value={identityLabel}
          note={isMock ? "6,812 verified" : "Current page"}
        />
        <Metric
          label="Purchase links"
          value={purchaseLinksLabel}
          note={isMock ? "Across 1,284 stores" : "Listed buyers"}
        />
        <Metric
          label="Active sessions"
          value={sessionsLabel}
          note={isMock ? "30 day sessions" : "Listed buyers"}
        />
        <Metric
          label="Unclaimed purchases"
          value={unclaimedLabel}
          note={isMock ? "Email not verified" : "Pending verification"}
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
