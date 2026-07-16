"use client";

import { adminPanel, ControlDialog } from "@/features/admin/ui";

import { useRef, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCcw,
  RotateCcw,
  Search,
  Webhook,
  Zap,
} from "lucide-react";
import { cn, rupiah } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import {
  hasVerifiedForceFulfillEvidence,
  initialWebhooks,
  isFailedSellerDelivery,
  isFailedXenditCallback,
} from "./data";
import { ForceFulfillDialog } from "./force-fulfill-dialog";
import { AdminMetric, StatusPill } from "./pieces";
import { appendMockAuditEvent } from "@/features/admin/data/mock-audit";

const sourceStatus = (row: (typeof initialWebhooks)[number]) =>
  row.kind === "PROVIDER_CALLBACK" ? row.providerStatus : row.deliveryStatus;

export function WebhookOperations() {
  const [rows, setRows] = useState(initialWebhooks);
  const [selectedId, setSelectedId] = useState(initialWebhooks[0].id);
  const [forceOpen, setForceOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryTargetId, setRetryTargetId] = useState<string | null>(null);
  const retryingIdRef = useRef<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId) || rows[0];
  const retryTarget = rows.find((row) => row.id === retryTargetId);
  const failedCallbacks = rows.filter(isFailedXenditCallback);
  const { pageRows, pagination } = useClientPagination(rows);
  const requestRetry = (id: string) => {
    const row = rows.find((item) => item.id === id);
    if (
      !row ||
      (!isFailedXenditCallback(row) && !isFailedSellerDelivery(row)) ||
      retryingIdRef.current
    )
      return;
    setRetryTargetId(id);
  };
  const retryDelivery = (id: string, reason: string) => {
    return new Promise<void>((resolve, reject) => {
      const row = rows.find((item) => item.id === id);
      if (
        !row ||
        (!isFailedXenditCallback(row) && !isFailedSellerDelivery(row)) ||
        retryingIdRef.current
      ) {
        reject(new Error("Delivery is not eligible for replay"));
        return;
      }
      retryingIdRef.current = id;
      setRetryingId(id);
      setRows((items) =>
        items.map((item) =>
          item.id === id ? { ...item, http: "Retrying" } : item,
        ),
      );
      window.setTimeout(() => {
        setRows((items) =>
          items.map((item) =>
            item.id !== id
              ? item
              : item.kind === "PROVIDER_CALLBACK"
                ? {
                    ...item,
                    http: "202",
                    attempts: item.attempts + 1,
                    age: "now",
                  }
                : {
                    ...item,
                    http: "200",
                    deliveryStatus: "DELIVERED",
                    attempts: item.attempts + 1,
                    age: "now",
                  },
          ),
        );
        appendMockAuditEvent({
          actor: "admin@fersaku.id",
          action:
            row.kind === "PROVIDER_CALLBACK"
              ? "xendit.callback.retried"
              : "seller.webhook_delivery.retried",
          target: id,
          ip: "mock-admin-session",
          result: "Success",
          context: reason,
        });
        retryingIdRef.current = null;
        setRetryingId(null);
        resolve();
      }, 900);
    });
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          icon={Webhook}
          label="Events today"
          value="18.492"
          note="Xendit + seller events"
        />
        <AdminMetric
          icon={CheckCircle2}
          label="Success rate"
          value="99,72%"
          note="+0,08%"
          tone="success"
        />
        <AdminMetric
          icon={AlertTriangle}
          label="Failed Xendit callbacks"
          value={String(failedCallbacks.length)}
          note="Needs stored-event replay"
          tone="danger"
        />
        <AdminMetric
          icon={Clock3}
          label="Median latency"
          value="92 ms"
          note="p95 840 ms"
        />
      </div>

      <section className={adminPanel + " mt-4 overflow-hidden"}>
        <div className="flex flex-col gap-2 border-b border-[#e5e8ef] p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xs font-black">Failed Xendit callback queue</h2>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              Only signed provider callbacks that did not receive a successful
              response are shown here.
            </p>
          </div>
          <span className="rounded-full bg-[#fff0ee] px-3 py-2 text-[8px] font-extrabold text-[#c9544d] sm:ml-auto">
            {failedCallbacks.length} open
          </span>
        </div>
        {failedCallbacks.length ? (
          <div className="divide-y divide-[#edf0f4]">
            {failedCallbacks.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 p-4 text-[8px] sm:flex-row sm:items-center"
              >
                <button
                  onClick={() => setSelectedId(row.id)}
                  className="min-w-0 text-left sm:w-44"
                >
                  <b className="block truncate font-mono text-[#536fdf]">
                    {row.id}
                  </b>
                  <span className="mt-1 block truncate text-[#7c879d]">
                    {row.event} • {row.order}
                  </span>
                </button>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <StatusPill value={row.http} />
                  <span className="text-[#7c879d]">
                    {row.attempts} attempts • {row.age}
                  </span>
                  <button
                    aria-label={"Retry callback " + row.id}
                    onClick={() => requestRetry(row.id)}
                    disabled={retryingId !== null}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dce1e9] px-3 text-[8px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {retryingId === row.id ? (
                      <RefreshCcw className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    {retryingId === row.id ? "Retrying" : "Retry"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-[9px] text-[#7c879d]">
            All Xendit callbacks have a successful delivery response.
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className={`${adminPanel} min-w-0 overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row sm:items-center">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe3ec] px-3 text-[#7c879d]">
              <Search className="size-4" />
              <input
                placeholder="Search delivery, order, provider..."
                className="min-w-0 flex-1 text-[9px] outline-none"
              />
            </label>
            <select className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[9px] font-bold">
              <option>All sources</option>
              <option>Xendit</option>
              <option>Seller</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#8490a5] uppercase">
                <tr>
                  {[
                    "Delivery",
                    "Source",
                    "Event",
                    "Order",
                    "HTTP",
                    "Source state",
                    "Local state",
                    "Attempts",
                    "Age",
                    "",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "cursor-pointer border-t border-[#e8eaf0] text-[8px]",
                      selectedId === row.id && "bg-[#f1f4ff]",
                    )}
                  >
                    <td className="px-4 py-4 font-mono font-bold text-[#536fdf]">
                      {row.id}
                    </td>
                    <td className="font-bold">{row.source}</td>
                    <td className="font-mono">{row.event}</td>
                    <td className="font-mono">{row.order}</td>
                    <td>
                      <StatusPill value={row.http} />
                    </td>
                    <td>
                      <StatusPill value={sourceStatus(row)} />
                    </td>
                    <td>
                      <StatusPill value={row.orderStatus} />
                    </td>
                    <td>{row.attempts}</td>
                    <td>{row.age}</td>
                    <td>
                      <Eye className="size-3.5 text-[#536fdf]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination} />
        </section>

        <aside className={`${adminPanel} overflow-hidden`}>
          <div className="border-b border-[#e5e8ef] bg-[#11182a] p-5 text-white">
            <p className="font-mono text-[8px] text-[#91a2d2]">{selected.id}</p>
            <h3 className="mt-2 text-sm font-black">{selected.event}</h3>
            <p className="mt-1 text-[8px] text-white/45">
              {selected.source} - order {selected.order}
            </p>
          </div>
          <div className="p-5">
            {selected.kind === "PROVIDER_CALLBACK" &&
              selected.providerStatus === "PAID" &&
              selected.orderStatus === "Pending" && (
                <div className="rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
                  <AlertOctagon className="mr-2 inline size-4" />
                  Settlement mismatch: provider confirms paid while Fersaku
                  order remains pending.
                </div>
              )}
            <div className="mt-4 grid gap-3">
              {(selected.kind === "PROVIDER_CALLBACK"
                ? [
                    ["Provider reference", selected.providerReference],
                    [
                      "Signature validation",
                      selected.signatureValidation === "VERIFIED"
                        ? "Verified - HMAC SHA256"
                        : "Rejected",
                    ],
                    ["Received at", selected.receivedAt],
                    ["Canonical event key", selected.canonicalEventKey],
                    ["Raw payload", selected.rawPayloadRef],
                  ]
                : [
                    ["Endpoint", "https://merchant.example/webhooks"],
                    ["Delivery signature", "Signed outbound payload"],
                    ["Last attempted", "12 Jul 2026, 14:39:22.841"],
                    ["Delivery ID", selected.id],
                    ["Response body", "Redacted and size-bounded"],
                  ]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 border-b border-[#edf0f4] pb-3 text-[8px]"
                >
                  <span className="text-[#7c879d]">{label}</span>
                  <b className="text-right font-mono">{value}</b>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#f5f6f9] p-4">
              <p className="text-[8px] font-extrabold tracking-wider text-[#7c879d] uppercase">
                Payload preview
              </p>
              <pre className="mt-3 overflow-x-auto text-[7px] leading-4 text-[#455064]">
                {selected.kind === "PROVIDER_CALLBACK"
                  ? `{\n  "merchantOrderId": "${selected.order}",\n  "status": "${selected.providerStatus}",\n  "amount": ${selected.amount},\n  "reference": "${selected.providerReference}"\n}`
                  : `{\n  "event": "${selected.event}",\n  "orderId": "${selected.order}",\n  "deliveryId": "${selected.id}"\n}`}
              </pre>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                disabled={
                  (!isFailedXenditCallback(selected) &&
                    !isFailedSellerDelivery(selected)) ||
                  retryingId !== null
                }
                onClick={() => requestRetry(selected.id)}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] text-[8px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryingId === selected.id ? (
                  <RefreshCcw className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {selected.kind === "PROVIDER_CALLBACK"
                  ? retryingId === selected.id
                    ? "Replaying"
                    : "Replay callback"
                  : "Retry seller delivery"}
              </button>
              <button
                disabled={!hasVerifiedForceFulfillEvidence(selected)}
                onClick={() => setForceOpen(true)}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#b9bfca]"
              >
                <Zap className="size-3.5" /> Force-Fulfill
              </button>
            </div>
            <p className="mt-3 text-[7px] leading-4 text-[#8a94a7]">
              Force-Fulfill is available only for a verified
              paid-provider/local-pending mismatch and requires settlement
              evidence bound to the callback reference, order, and amount
              {selected.kind === "PROVIDER_CALLBACK"
                ? ` (${rupiah(selected.amount)}).`
                : "."}
            </p>
          </div>
        </aside>
      </div>

      {forceOpen && hasVerifiedForceFulfillEvidence(selected) && (
        <ForceFulfillDialog
          row={selected}
          onClose={() => setForceOpen(false)}
          onComplete={() => {
            setRows((items) =>
              items.map((item) =>
                item.id === selected.id
                  ? { ...item, orderStatus: "Fulfilled" }
                  : item,
              ),
            );
            setForceOpen(false);
          }}
        />
      )}
      {retryTarget && (
        <ControlDialog
          title={
            retryTarget.kind === "PROVIDER_CALLBACK"
              ? `Retry Xendit callback ${retryTarget.id}`
              : `Retry seller delivery ${retryTarget.id}`
          }
          target={retryTarget.id}
          auditHandledExternally
          onConfirm={(reason) => retryDelivery(retryTarget.id, reason)}
          onClose={() => setRetryTargetId(null)}
        />
      )}
    </>
  );
}
