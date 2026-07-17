"use client";

import { Plus, Trash2 } from "lucide-react";
import type { InventoryField } from "@/features/seller/inventory/contracts";

export function CredentialFormatTab({
  fields,
  setFields,
  addField,
  updateField,
}: {
  fields: InventoryField[];
  setFields: (
    value: InventoryField[] | ((current: InventoryField[]) => InventoryField[]),
  ) => void;
  addField: () => void;
  updateField: (index: number, patch: Partial<InventoryField>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-extrabold">Buyer delivery schema</h3>
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
                onChange={(e) => updateField(i, { label: e.target.value })}
                className="hairline h-10 rounded-lg border px-3 text-[9px] font-normal outline-none"
              />
            </label>
            <label className="grid gap-1.5 text-[8px] font-bold">
              Field key
              <input
                value={field.key}
                onChange={(e) =>
                  updateField(i, {
                    key: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                  })
                }
                className="hairline h-10 rounded-lg border px-3 font-mono text-[9px] font-normal outline-none"
              />
            </label>
            <button
              onClick={() =>
                setFields((current) => current.filter((_, fi) => fi !== i))
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
                <label key={key} className="flex items-center gap-2 text-[8px]">
                  <input
                    type="checkbox"
                    checked={field[key as keyof InventoryField] as boolean}
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
            .map((f, i) => (f.secret ? `secret_${i + 1}` : `value_${i + 1}`))
            .join("|")}
        </p>
      </div>
    </div>
  );
}
