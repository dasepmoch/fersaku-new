"use client";

import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import type {
  InventoryField,
  StockItem,
} from "@/features/seller/inventory/contracts";
import { TablePagination } from "@/shared/ui/table-pagination";
import type { useClientPagination } from "@/shared/ui/use-client-pagination";
import { Status } from "./pieces";

type Pagination = ReturnType<typeof useClientPagination>["pagination"];

export function StockItemsTab({
  fields,
  raw,
  setRaw,
  imported,
  setImported,
  showSecrets,
  setShowSecrets,
  stockPageRows,
  stockPagination,
}: {
  fields: InventoryField[];
  raw: string;
  setRaw: (value: string) => void;
  imported: boolean;
  setImported: (value: boolean) => void;
  showSecrets: boolean;
  setShowSecrets: (value: boolean | ((prev: boolean) => boolean)) => void;
  stockPageRows: StockItem[];
  stockPagination: Pagination;
}) {
  const rows = raw.split("\n").filter(Boolean);

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[1fr_.9fr]">
        <div>
          <h3 className="text-xs font-extrabold">Bulk import stock</h3>
          <p className="mt-1 text-[8px] text-[#718078]">
            Satu item per baris. Urutan kolom mengikuti schema delivery.
          </p>
          <div className="mt-4 rounded-xl bg-[#eef3e9] p-3">
            <code className="text-[9px] font-bold">
              {fields.map((f) => f.key).join("|")}
            </code>
          </div>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setImported(false);
            }}
            rows={8}
            className="hairline mt-3 w-full resize-none rounded-xl border bg-white p-3 font-mono text-[9px] leading-5 outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[8px] text-[#718078]">
              {rows.length} baris siap divalidasi
            </span>
            <button
              onClick={() => setImported(true)}
              className="rounded-lg bg-[#173f2c] px-3 py-2 text-[8px] font-extrabold text-white"
            >
              {imported
                ? `${rows.length} item berhasil diimpor`
                : "Validate & import"}
            </button>
          </div>
        </div>
        <div className="hairline rounded-2xl border bg-[#f7f7f3] p-4">
          <h3 className="text-[10px] font-extrabold">Import preview</h3>
          <div className="mt-4 grid gap-3">
            {rows.slice(0, 3).map((row, i) => {
              const values = row.split("|");
              return (
                <div key={i} className="rounded-xl bg-white p-3">
                  <div className="flex items-center">
                    <b className="text-[8px]">Item {i + 1}</b>
                    <span
                      className={`ml-auto rounded-full px-2 py-1 text-[7px] font-bold ${values.length === fields.length ? "bg-[#e9f7ef] text-[#287d4c]" : "bg-[#fff0ee] text-[#c9544d]"}`}
                    >
                      {values.length === fields.length ? "VALID" : "INVALID"}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1">
                    {fields.map((field, fi) => (
                      <div
                        key={field.key}
                        className="flex justify-between text-[7px]"
                      >
                        <span className="text-[#718078]">{field.label}</span>
                        <code>
                          {field.secret ? "••••••••" : values[fi] || "Missing"}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="hairline mt-7 border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-extrabold">Stored inventory</h3>
            <p className="mt-1 text-[8px] text-[#718078]">
              Secret fields are masked by default and never included in logs.
            </p>
          </div>
          <button
            onClick={() => setShowSecrets(!showSecrets)}
            className="hairline flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-[8px] font-bold"
          >
            {showSecrets ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {showSecrets ? "Hide secrets" : "Reveal privileged"}
          </button>
        </div>
        <div className="hairline mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="bg-[#f3f4ef] text-[7px] tracking-wider text-[#718078] uppercase">
                <th className="px-4 py-3">Stock ID</th>
                {fields.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>Status</th>
                <th>Order</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stockPageRows.map((item) => (
                <tr key={item.id} className="hairline border-t text-[8px]">
                  <td className="px-4 py-3 font-mono font-bold">{item.id}</td>
                  {fields.map((f) => (
                    <td
                      key={f.key}
                      className="max-w-40 truncate pr-4 font-mono"
                    >
                      {f.secret && !showSecrets
                        ? "••••••••"
                        : item.values[f.key] || "—"}
                    </td>
                  ))}
                  <td>
                    <Status status={item.status} />
                  </td>
                  <td className="font-mono">{item.orderId || "—"}</td>
                  <td>
                    <MoreHorizontal className="size-3.5" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination {...stockPagination} />
        </div>
      </div>
    </div>
  );
}
