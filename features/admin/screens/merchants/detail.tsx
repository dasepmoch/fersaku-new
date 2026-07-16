"use client";

import {
  adminPanel,
  AdminButton,
  PanelHead,
  Metric,
  AdminStatus,
  ControlDialog,
} from "@/features/admin/ui";
import Link from "next/link";
import {
  ArrowDownRight,
  Ban,
  Eye,
  FileClock,
  KeyRound,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { rupiah } from "@/lib/utils";
import {
  useAdminAuditEvents,
  useAdminMerchant,
  useAdminOrders,
} from "@/features/admin/data";
import { MerchantFeeConfigurator } from "@/features/admin/commerce/merchant-fees";
import { ImpersonationDialog } from "./impersonation-dialog";
import { Info, RiskBadge } from "./pieces";

export function MerchantDetail({ id }: { id: string }) {
  const { data } = useAdminMerchant(id);
  const { data: orders } = useAdminOrders();
  const { data: auditEvents } = useAdminAuditEvents();
  const merchant = data;
  const [action, setAction] = useState<string | null>(null);
  if (!merchant) return null;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <AdminButton
          secondary
          onClick={() => setAction("Impersonate merchant")}
        >
          <Eye className="size-4" /> Impersonate
        </AdminButton>
        <AdminButton
          secondary
          onClick={() => setAction("Reset merchant API keys")}
        >
          <KeyRound className="size-4" /> Rotate keys
        </AdminButton>
        <button
          onClick={() =>
            setAction(
              merchant.status === "Suspended"
                ? "Restore merchant"
                : "Suspend merchant",
            )
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#f2c4c0] bg-[#fff5f4] px-4 text-[10px] font-extrabold text-[#c74f48]"
        >
          <Ban className="size-4" />{" "}
          {merchant.status === "Suspended" ? "Restore" : "Suspend merchant"}
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className={`${adminPanel} p-6`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-[#eaf0ff] text-xl font-black text-[#5b7cfa]">
              {merchant.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-[-.03em]">
                  {merchant.name}
                </h2>
                <AdminStatus status={merchant.status} />
              </div>
              <p className="mt-1 text-[10px] text-[#778297]">
                {merchant.id} • Joined {merchant.joined}
              </p>
            </div>
            <div className="sm:ml-auto">
              <RiskBadge risk={merchant.risk} />
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Lifetime GMV"
              value={rupiah(82640000)}
              note="482 orders"
            />
            <Metric
              label="Available balance"
              value={rupiah(18240500)}
              note="No active holds"
            />
            <Metric
              label="Platform revenue"
              value={rupiah(3184000)}
              note="3% + fees"
            />
          </div>
          <div className="mt-7 grid gap-5 border-t border-[#e5e8ef] pt-6 sm:grid-cols-2">
            <Info
              title="Owner & business"
              rows={[
                ["Legal name", merchant.owner],
                ["Email", merchant.email],
                ["Business type", "Individual creator"],
                ["Tax status", "Not verified"],
              ]}
            />
            <Info
              title="Operational state"
              rows={[
                ["Storefront", "Published"],
                ["Payments", "Enabled"],
                ["Withdrawals", "Enabled"],
                ["Settlement", "T+1 day"],
              ]}
            />
          </div>
        </section>
        <section className={`${adminPanel} overflow-hidden`}>
          <PanelHead title="Account timeline" desc="Latest sensitive changes" />
          <div>
            {(auditEvents ?? []).slice(0, 5).map((e) => (
              <div
                key={e.id}
                className="flex gap-3 border-t border-[#e8eaf0] p-4"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#edf1ff]">
                  <FileClock className="size-3 text-[#5b7cfa]" />
                </span>
                <div>
                  <p className="font-mono text-[9px] font-bold">{e.action}</p>
                  <p className="mt-1 text-[8px] text-[#8791a5]">
                    {e.actor} • {e.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <MerchantFeeConfigurator merchantName={merchant.name} />
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className={`${adminPanel} overflow-hidden`}>
          <PanelHead
            title="Recent orders"
            desc="Last transactions for this merchant"
            action={
              <Link
                href="/admin/orders"
                className="text-[9px] font-bold text-[#5b7cfa]"
              >
                View global orders
              </Link>
            }
          />
          {(orders ?? []).slice(0, 4).map((o) => (
            <div
              key={o.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-[#e8eaf0] px-5 py-4 text-[9px]"
            >
              <div>
                <Link href={`/admin/orders/${o.id}`} className="font-bold">
                  {o.id}
                </Link>
                <span className="mt-1 block text-[8px] text-[#8993a6]">
                  {o.customer} • {o.product}
                </span>
              </div>
              <AdminStatus status={o.status} />
              <b>{rupiah(o.gross)}</b>
            </div>
          ))}
        </section>
        <section className={`${adminPanel} overflow-hidden`}>
          <PanelHead
            title="Balance controls"
            desc="Manual balance action requires reason and audit"
          />
          <div className="grid grid-cols-2 gap-3 p-5">
            <button
              onClick={() => setAction("Add balance adjustment")}
              className="rounded-xl border border-[#dce1eb] p-4 text-left hover:bg-[#f8f9fb]"
            >
              <Plus className="size-4 text-[#2f9d60]" />
              <b className="mt-6 block text-[10px]">Credit adjustment</b>
              <span className="mt-1 block text-[8px] text-[#8993a6]">
                Add auditable funds
              </span>
            </button>
            <button
              onClick={() => setAction("Create balance debit")}
              className="rounded-xl border border-[#dce1eb] p-4 text-left hover:bg-[#f8f9fb]"
            >
              <ArrowDownRight className="size-4 text-[#df5d55]" />
              <b className="mt-6 block text-[10px]">Debit adjustment</b>
              <span className="mt-1 block text-[8px] text-[#8993a6]">
                Deduct or lock funds
              </span>
            </button>
          </div>
        </section>
      </div>
      {action === "Impersonate merchant" ? (
        <ImpersonationDialog
          merchant={merchant.name}
          merchantId={merchant.id}
          onClose={() => setAction(null)}
        />
      ) : action ? (
        <ControlDialog title={action} onClose={() => setAction(null)} />
      ) : null}
    </>
  );
}
