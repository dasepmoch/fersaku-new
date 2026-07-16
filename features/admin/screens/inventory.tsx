"use client";

import {
  adminPanel,
  PanelHead,
  Metric,
  TableHeader,
  AdminStatus,
  ControlDialog,
  RiskBadge,
} from "@/features/admin/ui";

import { ChevronRight, Eye, EyeOff, LockKeyhole } from "lucide-react";

import { useState } from "react";

import { useAdminInventory } from "@/features/admin/data";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

function GlobalInventory() {
  const { data } = useAdminInventory();
  const [revealed, setRevealed] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const productsPage = useClientPagination(data?.products ?? []);
  const itemsPage = useClientPagination(data?.items ?? []);
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
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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

export { GlobalInventory as AdminInventoryScreen };
