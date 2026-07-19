"use client";

import {
  adminPanel,
  Metric,
  TableToolbar,
  TableHeader,
  AdminStatus,
} from "@/features/admin/ui";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { compactRupiah } from "@/shared/format/money";
import { rupiah } from "@/lib/utils";
import { useAdminMerchants } from "@/features/admin/data";
import { getDomainSource } from "@/shared/data/domain-source";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { RiskBadge } from "./pieces";

export function Merchants() {
  const isMock = getDomainSource("adminRead") === "mock";
  const { data } = useAdminMerchants();
  const merchants = data ?? [];
  const { pageRows, pagination } = useClientPagination(merchants);

  const totalLabel = isMock
    ? "1.284"
    : merchants.length > 0
      ? merchants.length.toLocaleString("id-ID")
      : "—";
  const volumeLabel = isMock
    ? "Rp684jt"
    : merchants.length > 0
      ? compactRupiah(
          merchants.reduce((sum, m) => sum + Math.max(0, m.volume), 0),
        )
      : "—";
  const restrictedLabel = isMock
    ? "12"
    : String(
        merchants.filter(
          (m) =>
            m.status === "Suspended" ||
            m.status === "Restricted" ||
            m.status === "Closed",
        ).length,
      );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Total merchants"
          value={totalLabel}
          note={isMock ? "+86 this month" : "Current page"}
        />
        <Metric
          label="Active volume"
          value={volumeLabel}
          note={isMock ? "30 day GMV" : "Listed merchants"}
        />
        <Metric
          label="Restricted"
          value={restrictedLabel}
          note={isMock ? "4 pending review" : "Suspended / restricted"}
          tone="danger"
        />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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
                "API access",
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
                    <AdminStatus status={m.apiAccess} />
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
