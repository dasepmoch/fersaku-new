"use client";

import { Boxes } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { InventoryField } from "@/features/seller/inventory/contracts";
import { getDomainSource } from "@/shared/data/domain-source";
import {
  useImportSellerInventoryItemsMutation,
  usePutSellerInventorySchemaMutation,
  useRevealSellerInventoryItemMutation,
  useSellerInventoryDetail,
  useSellerInventorySchema,
} from "@/features/seller/inventory/hooks";
import { parseImportLines } from "@/features/seller/inventory/mappers";
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

const REVEAL_TTL_MS = 60_000;

export function InventoryDetail({ id }: { id: string }) {
  const storeId = useSellerStoreId();
  const isApi = getDomainSource("sellerCatalog") === "api";
  const { data: detail } = useSellerInventoryDetail(storeId, id);
  const { data: schema } = useSellerInventorySchema(storeId, id);
  const importMutation = useImportSellerInventoryItemsMutation();
  const putSchemaMutation = usePutSellerInventorySchemaMutation();
  const revealMutation = useRevealSellerInventoryItemMutation();

  const product = detail?.product;
  const remoteItems = detail?.items ?? [];

  const [tab, setTab] = useState("Stock items");
  const [fields, setFields] = useState<InventoryField[]>([]);
  const [raw, setRaw] = useState(
    "new.user01@inboxkit.id|Secure#001|https://canva.com/brand/join/NEW01\nnew.user02@inboxkit.id|Secure#002|https://canva.com/brand/join/NEW02",
  );
  const [imported, setImported] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  /** Component-local reveal map only — never React Query. */
  const [revealedById, setRevealedById] = useState<
    Record<string, Record<string, string>>
  >({});
  const [updates, setUpdates] = useState(false);

  // Seed fields from schema (API) or mock schema placeholder.
  useEffect(() => {
    if (schema?.fields?.length) {
      setFields(schema.fields);
    }
  }, [schema?.id, schema?.version, schema?.fields]);

  // TTL cleanup for component-local secrets.
  useEffect(() => {
    if (!showSecrets && Object.keys(revealedById).length === 0) return;
    const t = window.setTimeout(() => {
      setRevealedById({});
      setShowSecrets(false);
    }, REVEAL_TTL_MS);
    return () => window.clearTimeout(t);
  }, [showSecrets, revealedById]);

  const displayItems = useMemo(() => {
    if (!showSecrets || Object.keys(revealedById).length === 0) {
      return remoteItems;
    }
    return remoteItems.map((item) => {
      const secrets = revealedById[item.id];
      if (!secrets) return item;
      return {
        ...item,
        values: { ...item.values, ...secrets },
      };
    });
  }, [remoteItems, revealedById, showSecrets]);

  const { pageRows: stockPageRows, pagination: stockPagination } =
    useClientPagination(displayItems);

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

  const handleImport = async () => {
    if (!isApi) {
      setImported(true);
      return;
    }
    if (!schema?.version) return;
    const items = parseImportLines(raw, fields, schema.delimiter || "|");
    if (items.length === 0) return;
    try {
      await importMutation.mutateAsync({
        storeId,
        productId: id,
        expectedSchemaVersion: schema.version,
        items,
      });
      setImported(true);
    } catch {
      setImported(false);
    }
  };

  const handleRevealToggle = async () => {
    if (!isApi) {
      setShowSecrets((v) => !v);
      return;
    }
    if (showSecrets) {
      setShowSecrets(false);
      setRevealedById({});
      return;
    }
    // Reveal first page items only (per-item; no batch endpoint).
    const next: Record<string, Record<string, string>> = {};
    for (const item of stockPageRows.slice(0, 5)) {
      try {
        const res = await revealMutation.mutateAsync({
          storeId,
          itemId: item.id,
          reason: "seller inventory privileged view",
        });
        next[item.id] = res.secrets;
      } catch {
        // missing/expired MFA or denied — keep masked
      }
    }
    setRevealedById(next);
    setShowSecrets(Object.keys(next).length > 0);
  };

  const handleSaveSchema = async () => {
    if (!isApi) return;
    try {
      await putSchemaMutation.mutateAsync({
        storeId,
        productId: id,
        fields,
        delimiter: schema?.delimiter || "|",
        expectedVersion: schema?.version ?? null,
      });
    } catch {
      // schema conflict — keep local editor state
    }
  };

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
            <button
              type="button"
              onClick={() => void handleSaveSchema()}
              className="h-10 rounded-xl bg-[#173f2c] px-4 text-[9px] font-extrabold text-white"
            >
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
              onImport={() => void handleImport()}
              onRevealToggle={() => void handleRevealToggle()}
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
