"use client";

import { Boxes } from "lucide-react";
import { useMemo, useState } from "react";
import type { InventoryField } from "@/features/seller/inventory/contracts";
import { getInventoryDetailLocalSeed } from "@/features/seller/inventory/api";
import { useSellerInventoryProduct } from "@/features/seller/inventory/hooks";
import { useSellerStoreId } from "@/shared/seller/current-store";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { CredentialFormatTab } from "./credential-format-tab";
import {
  ActivityTab,
  DeliveryRulesTab,
  InventoryAside,
} from "./delivery-activity";
import { sellerCard } from "./pieces";
import { StockItemsTab } from "./stock-items-tab";

export function InventoryDetail({ id }: { id: string }) {
  const storeId = useSellerStoreId();
  const { data: product } = useSellerInventoryProduct(storeId, id);
  const [tab, setTab] = useState("Stock items");
  const localSeed = useMemo(() => getInventoryDetailLocalSeed(), []);
  const [fields, setFields] = useState<InventoryField[]>(
    () => localSeed.fields,
  );
  const [raw, setRaw] = useState(
    "new.user01@inboxkit.id|Secure#001|https://canva.com/brand/join/NEW01\nnew.user02@inboxkit.id|Secure#002|https://canva.com/brand/join/NEW02",
  );
  const [imported, setImported] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [updates, setUpdates] = useState(false);
  const { pageRows: stockPageRows, pagination: stockPagination } =
    useClientPagination(localSeed.stockItems);
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
  if (!product) return null;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${sellerCard} overflow-hidden`}>
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
            <StockItemsTab
              fields={fields}
              raw={raw}
              setRaw={setRaw}
              imported={imported}
              setImported={setImported}
              showSecrets={showSecrets}
              setShowSecrets={setShowSecrets}
              stockPageRows={stockPageRows}
              stockPagination={stockPagination}
            />
          )}
          {tab === "Credential format" && (
            <CredentialFormatTab
              fields={fields}
              setFields={setFields}
              addField={addField}
              updateField={updateField}
            />
          )}
          {tab === "Delivery rules" && (
            <DeliveryRulesTab
              lowAt={product.lowAt}
              updates={updates}
              setUpdates={setUpdates}
            />
          )}
          {tab === "Activity" && <ActivityTab />}
        </div>
      </section>
      <InventoryAside
        available={product.available}
        reserved={product.reserved}
        sold={product.sold}
        invalid={product.invalid}
        lowAt={product.lowAt}
      />
    </div>
  );
}
