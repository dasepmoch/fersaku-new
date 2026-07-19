"use client";

import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  RefreshCcw,
  ShoppingBag,
  Upload,
} from "lucide-react";
import { Input, Select, sellerCard } from "./pieces";

export function DeliveryRulesTab({
  lowAt,
  updates,
  setUpdates,
}: {
  lowAt: number;
  updates: boolean;
  setUpdates: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  return (
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
        <Input label="Low stock alert" value={String(lowAt)} />
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
            Notify existing buyers only when this seller marks a new version as
            available.
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
              fulfillment or privileged reveal, excluded from analytics/logs,
              and permanently bound to exactly one paid order.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActivityTab() {
  return (
    <div className="grid gap-3">
      {[
        [Upload, "84 stock items imported", "Asep Kurnia • 12 Jul, 13:42"],
        [ShoppingBag, "Stock stk_8K2A3 assigned", "Order FRS-240712-1842"],
        [RefreshCcw, "Reservation stk_8K2A2 created", "Expires in 11 minutes"],
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
            <span className="text-[8px] text-[#718078]">{desc as string}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InventoryAside({
  available,
  reserved,
  sold,
  invalid,
  lowAt,
}: {
  available: number;
  reserved: number;
  sold: number;
  invalid: number;
  lowAt: number;
}) {
  return (
    <aside className="grid content-start gap-4">
      <section className={`${sellerCard} p-5`}>
        <h3 className="text-xs font-extrabold">Stock health</h3>
        <div className="mt-5 flex items-end justify-between">
          <b className="text-4xl">{available}</b>
          <span className="rounded-full bg-[#e9f7ef] px-2.5 py-1 text-[8px] font-extrabold text-[#287d4c]">
            AVAILABLE
          </span>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf0e9]">
          <div className="h-full w-3/4 rounded-full bg-[#173f2c]" />
        </div>
        <div className="mt-5 grid gap-3 text-[9px]">
          {[
            ["Reserved", String(reserved)],
            ["Sold", String(sold)],
            ["Invalid", String(invalid)],
            ["Low stock threshold", String(lowAt)],
          ].map((x) => (
            <div key={x[0]} className="flex justify-between">
              <span className="text-[#718078]">{x[0]}</span>
              <b>{x[1]}</b>
            </div>
          ))}
        </div>
      </section>
      <section className={`${sellerCard} p-5`}>
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
  );
}
