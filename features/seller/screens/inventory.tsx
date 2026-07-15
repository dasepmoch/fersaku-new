"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  FileDown,
  Filter,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Search,
  ShoppingBag,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import {
  canvaSchema,
  stockItems,
  stockProducts,
  type InventoryField,
} from "@/lib/inventory-mock-data";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const card = "rounded-[22px] border hairline bg-[#fbfaf7] shadow-card";
function Inventory() {
  const totalAvailable = stockProducts.reduce((sum, p) => sum + p.available, 0);
  const low = stockProducts.filter((p) => p.available <= p.lowAt).length;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat
          label="Stok tersedia"
          value={String(totalAvailable)}
          note="Siap dialokasikan"
        />
        <MiniStat label="Reserved" value="4" note="Checkout belum selesai" />
        <MiniStat label="Terjual" value="735" note="Lifetime fulfilled" />
        <MiniStat
          label="Stok menipis"
          value={String(low)}
          note="Perlu ditambah"
        />
      </div>
      <section className={`${card} mt-4 overflow-hidden`}>
        <div className="hairline flex flex-col gap-3 border-b p-4 sm:flex-row">
          <SearchBox placeholder="Cari produk stok..." />
          <div className="flex gap-2 sm:ml-auto">
            <FilterButton />
            <button className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold">
              <FileDown className="size-3.5" /> Export inventory
            </button>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          {stockProducts.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/inventory/${p.id}`}
              className="group hairline rounded-[20px] border bg-white p-5 transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex items-start">
                <span className="grid size-11 place-items-center rounded-xl bg-[#e9ff9b]">
                  <Boxes className="size-5" />
                </span>
                <span
                  className={`ml-auto rounded-full px-2.5 py-1.5 text-[8px] font-extrabold ${p.available <= p.lowAt ? "bg-[#fff4ce] text-[#8a6c22]" : "bg-[#e9f7ef] text-[#287d4c]"}`}
                >
                  {p.available <= p.lowAt ? "LOW STOCK" : "HEALTHY"}
                </span>
              </div>
              <h2 className="mt-6 text-sm font-extrabold">{p.title}</h2>
              <p className="mt-1 text-[9px] text-[#718078]">
                {p.type} • <code>{p.delivery}</code>
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  ["Available", p.available],
                  ["Reserved", p.reserved],
                  ["Sold", p.sold],
                ].map((x) => (
                  <div
                    key={x[0] as string}
                    className="rounded-xl bg-[#f3f4ef] p-3"
                  >
                    <span className="block text-[7px] tracking-wider text-[#7a867f] uppercase">
                      {x[0] as string}
                    </span>
                    <b className="mt-1 block text-sm">{x[1] as number}</b>
                  </div>
                ))}
              </div>
              <div className="hairline mt-5 flex items-center border-t pt-4 text-[9px] font-extrabold text-[#315d47]">
                Kelola inventory
                <ChevronRight className="ml-auto size-4 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
function InventoryDetail({ id }: { id: string }) {
  const product = stockProducts.find((p) => p.id === id) || stockProducts[0];
  const [tab, setTab] = useState("Stock items");
  const [fields, setFields] = useState<InventoryField[]>(canvaSchema);
  const [raw, setRaw] = useState(
    "new.user01@inboxkit.id|Secure#001|https://canva.com/brand/join/NEW01\nnew.user02@inboxkit.id|Secure#002|https://canva.com/brand/join/NEW02",
  );
  const [imported, setImported] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [updates, setUpdates] = useState(false);
  const rows = raw.split("\n").filter(Boolean);
  const { pageRows: stockPageRows, pagination: stockPagination } =
    useClientPagination(stockItems);
  const addField = () =>
    setFields((current) => [
      ...current,
      {
        key: `field_${current.length + 1}`,
        label: "Custom field",
        secret: false,
        required: false,
        buyerCopyable: true,
      },
    ]);
  const updateField = (index: number, patch: Partial<InventoryField>) =>
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} overflow-hidden`}>
        <div className="hairline flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-[#e9ff9b]">
            <Boxes className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold">{product.title}</h2>
            <p className="mt-1 text-[9px] text-[#718078]">
              {product.type} • Allocation FIFO • Low stock at {product.lowAt}
            </p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-bold">
              Export secure CSV
            </button>
            <button className="h-10 rounded-xl bg-[#173f2c] px-4 text-[9px] font-extrabold text-white">
              Save inventory settings
            </button>
          </div>
        </div>
        <div className="hairline flex overflow-x-auto border-b px-4">
          {[
            "Stock items",
            "Credential format",
            "Delivery rules",
            "Activity",
          ].map((x) => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className={`border-b-2 px-4 py-4 text-[9px] font-extrabold whitespace-nowrap ${tab === x ? "border-[#173f2c]" : "border-transparent text-[#718078]"}`}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="p-5 sm:p-7">
          {tab === "Stock items" && (
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
                              {values.length === fields.length
                                ? "VALID"
                                : "INVALID"}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1">
                            {fields.map((field, fi) => (
                              <div
                                key={field.key}
                                className="flex justify-between text-[7px]"
                              >
                                <span className="text-[#718078]">
                                  {field.label}
                                </span>
                                <code>
                                  {field.secret
                                    ? "••••••••"
                                    : values[fi] || "Missing"}
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
                      Secret fields are masked by default and never included in
                      logs.
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
                        <tr
                          key={item.id}
                          className="hairline border-t text-[8px]"
                        >
                          <td className="px-4 py-3 font-mono font-bold">
                            {item.id}
                          </td>
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
          )}
          {tab === "Credential format" && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold">
                    Buyer delivery schema
                  </h3>
                  <p className="mt-1 text-[8px] text-[#718078]">
                    Field order defines the pipe-delimited import format.
                  </p>
                </div>
                <button
                  onClick={addField}
                  className="hairline flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-[8px] font-bold"
                >
                  <Plus className="size-3.5" /> Add field
                </button>
              </div>
              <div className="mt-5 grid gap-3">
                {fields.map((field, i) => (
                  <div
                    key={`${field.key}-${i}`}
                    className="hairline grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <label className="grid gap-1.5 text-[8px] font-bold">
                      Buyer label
                      <input
                        value={field.label}
                        onChange={(e) =>
                          updateField(i, { label: e.target.value })
                        }
                        className="hairline h-10 rounded-lg border px-3 text-[9px] font-normal outline-none"
                      />
                    </label>
                    <label className="grid gap-1.5 text-[8px] font-bold">
                      Field key
                      <input
                        value={field.key}
                        onChange={(e) =>
                          updateField(i, {
                            key: e.target.value
                              .toLowerCase()
                              .replace(/\s+/g, "_"),
                          })
                        }
                        className="hairline h-10 rounded-lg border px-3 font-mono text-[9px] font-normal outline-none"
                      />
                    </label>
                    <button
                      onClick={() =>
                        setFields((current) =>
                          current.filter((_, fi) => fi !== i),
                        )
                      }
                      className="hairline mt-5 grid size-10 place-items-center rounded-lg border text-[#a44f3b]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <div className="flex flex-wrap gap-4 sm:col-span-3">
                      {[
                        ["secret", "Encrypt & mask secret"],
                        ["required", "Required for import"],
                        ["buyerCopyable", "Buyer can copy"],
                      ].map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-[8px]"
                        >
                          <input
                            type="checkbox"
                            checked={
                              field[key as keyof InventoryField] as boolean
                            }
                            onChange={(e) =>
                              updateField(i, { [key]: e.target.checked })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-[#173f2c] p-5 text-white">
                <p className="text-[8px] font-bold tracking-wider text-white/45 uppercase">
                  Current import format
                </p>
                <code className="mt-3 block text-sm font-bold text-[#d7ff64]">
                  {fields.map((f) => f.key).join("|")}
                </code>
                <p className="mt-3 text-[8px] leading-4 text-white/45">
                  Example:{" "}
                  {fields
                    .map((f, i) =>
                      f.secret ? `secret_${i + 1}` : `value_${i + 1}`,
                    )
                    .join("|")}
                </p>
              </div>
            </div>
          )}
          {tab === "Delivery rules" && (
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Allocation strategy"
                  options={[
                    "FIFO — oldest first",
                    "LIFO — newest first",
                    "Random allocation",
                  ]}
                />
                <Input label="Reservation timeout" value="15 minutes" />
                <Input label="Low stock alert" value={String(product.lowAt)} />
                <Select
                  label="When stock is empty"
                  options={[
                    "Disable checkout",
                    "Allow backorder",
                    "Keep product visible",
                  ]}
                />
              </div>
              <label className="flex items-center justify-between rounded-2xl bg-[#f5f5f0] p-4">
                <div>
                  <b className="block text-[9px]">Product updates</b>
                  <span className="mt-1 block text-[8px] text-[#718078]">
                    Notify existing buyers only when this seller marks a new
                    version as available.
                  </span>
                </div>
                <button
                  onClick={() => setUpdates(!updates)}
                  className={`relative h-6 w-11 rounded-full ${updates ? "bg-[#173f2c]" : "bg-[#c9cec9]"}`}
                >
                  <span
                    className={`absolute top-1 size-4 rounded-full bg-white transition ${updates ? "left-6" : "left-1"}`}
                  />
                </button>
              </label>
              <div className="rounded-2xl border border-[#efc8c0] bg-[#fff6f2] p-4">
                <div className="flex gap-3">
                  <LockKeyhole className="size-4 text-[#a44f3b]" />
                  <div>
                    <b className="text-[9px] text-[#a44f3b]">
                      Credential security policy
                    </b>
                    <p className="mt-1 text-[8px] leading-4 text-[#85736e]">
                      Values must be encrypted at rest, decrypted only during
                      fulfillment or privileged reveal, excluded from
                      analytics/logs, and permanently bound to exactly one paid
                      order.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === "Activity" && (
            <div className="grid gap-3">
              {[
                [
                  Upload,
                  "84 stock items imported",
                  "Asep Kurnia • 12 Jul, 13:42",
                ],
                [
                  ShoppingBag,
                  "Stock stk_8K2A3 assigned",
                  "Order FRS-240712-1842",
                ],
                [
                  RefreshCcw,
                  "Reservation stk_8K2A2 created",
                  "Expires in 11 minutes",
                ],
                [
                  AlertTriangle,
                  "Item stk_8K2A4 marked invalid",
                  "Missing password and invalid URL",
                ],
              ].map(([Icon, title, desc]) => (
                <div
                  key={title as string}
                  className="hairline flex items-center gap-3 rounded-xl border bg-white p-4"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-[#eef3e9]">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <b className="block text-[9px]">{title as string}</b>
                    <span className="text-[8px] text-[#718078]">
                      {desc as string}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <aside className="grid content-start gap-4">
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Stock health</h3>
          <div className="mt-5 flex items-end justify-between">
            <b className="text-4xl">{product.available}</b>
            <span className="rounded-full bg-[#e9f7ef] px-2.5 py-1 text-[8px] font-extrabold text-[#287d4c]">
              AVAILABLE
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf0e9]">
            <div className="h-full w-3/4 rounded-full bg-[#173f2c]" />
          </div>
          <div className="mt-5 grid gap-3 text-[9px]">
            {[
              ["Reserved", String(product.reserved)],
              ["Sold", String(product.sold)],
              ["Invalid", String(product.invalid)],
              ["Low stock threshold", String(product.lowAt)],
            ].map((x) => (
              <div key={x[0]} className="flex justify-between">
                <span className="text-[#718078]">{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            ))}
          </div>
        </section>
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Best-practice checks</h3>
          <div className="mt-4 grid gap-3">
            {[
              "Schema versioned",
              "Secrets encrypted",
              "One item per order",
              "Atomic reservation",
              "Reveal is audited",
            ].map((x) => (
              <div
                key={x}
                className="flex items-center gap-2 text-[8px] font-bold"
              >
                <CheckCircle2 className="size-3.5 text-[#2e714f]" />
                {x}
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="hairline flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border bg-white px-3 text-[10px] text-[#829087]">
      <Search className="size-3.5" />
      <input
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none"
      />
    </div>
  );
}
function FilterButton() {
  return (
    <button className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold">
      <Filter className="size-3.5" /> Filter
    </button>
  );
}
function Status({ status }: { status: string }) {
  const positive = ["Paid", "Active", "Completed", "Delivered"].includes(
    status,
  );
  const pending = ["Pending", "Processing"].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-extrabold ${positive ? "bg-[#e5f5e6] text-[#2e714f]" : pending ? "bg-[#fff4ce] text-[#8a6c22]" : "bg-[#ffebe3] text-[#a7573e]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
function MiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-[9px] font-extrabold tracking-wider text-[#7d8982] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-[9px] text-[#7d8982]">{note}</p>
    </div>
  );
}
function Input({
  label,
  placeholder,
  prefix,
  value,
}: {
  label: string;
  placeholder?: string;
  prefix?: string;
  value?: string;
}) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <div className="hairline flex h-12 overflow-hidden rounded-xl border bg-white">
        {prefix && (
          <span className="hairline flex items-center border-r bg-[#f3f4ef] px-3 text-[10px] font-semibold text-[#77837b]">
            {prefix}
          </span>
        )}
        <input
          defaultValue={value}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-4 text-sm font-normal outline-none"
        />
      </div>
    </label>
  );
}
function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <select className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none">
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}

export {
  Inventory as SellerInventoryScreen,
  InventoryDetail as SellerInventoryDetailScreen,
};
