"use client";

import { adminPanel, ControlDialog } from "@/features/admin/ui";

import { useMemo, useRef, useState } from "react";
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
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  hasVerifiedForceFulfillEvidence,
  isFailedSellerDelivery,
  isFailedXenditCallback,
  type WebhookRow,
} from "./data";
import { ForceFulfillDialog } from "./force-fulfill-dialog";
import { AdminMetric, StatusPill } from "./pieces";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";
import { isAdminWebhooksApiDomain } from "./api";
import {
  useAdminProviderCallbackReplayEnabled,
  useAdminSellerWebhookRetryEnabled,
  useAdminWebhookConsole,
  useReplayAdminProviderCallbackMutation,
  useRetryAdminSellerWebhookDeliveryMutation,
} from "./hooks";
import { webhookRowKey } from "./mappers";

const sourceStatus = (row: WebhookRow) =>
  row.kind === "PROVIDER_CALLBACK" ? row.providerStatus : row.deliveryStatus;

export function WebhookOperations() {
  const isApi = isAdminWebhooksApiDomain();
  const canReplay = useAdminProviderCallbackReplayEnabled();
  const canRetrySeller = useAdminSellerWebhookRetryEnabled();
  const consoleQuery = useAdminWebhookConsole();
  const replayMutation = useReplayAdminProviderCallbackMutation();
  const retryMutation = useRetryAdminSellerWebhookDeliveryMutation();

  const [localRows, setLocalRows] = useState<WebhookRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "Xendit" | "Seller">(
    "all",
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [retryTargetKey, setRetryTargetKey] = useState<string | null>(null);
  const retryingKeyRef = useRef<string | null>(null);
  const idemRef = useRef<string | null>(null);

  // Mock fixtures live in hooks/api only (INT-170 presentation boundary).
  const baseRows = useMemo(() => {
    if (localRows) return localRows;
    return consoleQuery.data?.rows ?? [];
  }, [localRows, consoleQuery.data?.rows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRows.filter((row) => {
      if (sourceFilter === "Xendit" && row.source !== "Xendit") return false;
      if (sourceFilter === "Seller" && row.source !== "Seller") return false;
      if (!q) return true;
      return `${row.id} ${row.event} ${row.order} ${row.source}`
        .toLowerCase()
        .includes(q);
    });
  }, [baseRows, search, sourceFilter]);

  const selected =
    rows.find((row) => webhookRowKey(row) === selectedKey) ||
    rows[0] ||
    baseRows[0];
  const selectedIdKey = selected ? webhookRowKey(selected) : null;
  const retryTarget = rows.find((row) => webhookRowKey(row) === retryTargetKey);
  const failedCallbacks = baseRows.filter(isFailedXenditCallback);
  const { pageRows, pagination } = useClientPagination(rows);

  const partialError =
    isApi &&
    (consoleQuery.data?.callbackError || consoleQuery.data?.deliveryError)
      ? [consoleQuery.data?.callbackError, consoleQuery.data?.deliveryError]
          .filter(Boolean)
          .join(" · ")
      : null;

  const requestRetry = (row: WebhookRow) => {
    if (
      (!isFailedXenditCallback(row) && !isFailedSellerDelivery(row)) ||
      retryingKeyRef.current
    )
      return;
    if (row.kind === "PROVIDER_CALLBACK" && !canReplay) return;
    if (row.kind === "SELLER_DELIVERY" && !canRetrySeller) return;
    setRetryTargetKey(webhookRowKey(row));
  };

  const retryDelivery = async (row: WebhookRow, reason: string) => {
    if (
      (!isFailedXenditCallback(row) && !isFailedSellerDelivery(row)) ||
      retryingKeyRef.current
    ) {
      throw new Error("Delivery is not eligible for replay");
    }
    const key = webhookRowKey(row);
    retryingKeyRef.current = key;
    setRetryingKey(key);

    try {
      if (isApi) {
        if (!idemRef.current) {
          idemRef.current = createIdempotencyKey();
        }
        if (row.kind === "PROVIDER_CALLBACK") {
          await replayMutation.mutateAsync({
            callbackId: row.id,
            reason,
            idempotencyKey: idemRef.current,
          });
        } else {
          await retryMutation.mutateAsync({
            deliveryId: row.id,
            reason,
            idempotencyKey: idemRef.current,
          });
        }
        idemRef.current = null;
        setLocalRows(null);
        return;
      }

      // Mock path: optimistic local update + client audit.
      setLocalRows((items) => {
        const current = items ?? consoleQuery.data?.rows ?? [];
        return current.map((item) =>
          webhookRowKey(item) !== key
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
        );
      });
      appendClientAuditEvent({
        actor: "admin@fersaku.id",
        action:
          row.kind === "PROVIDER_CALLBACK"
            ? "xendit.callback.retried"
            : "seller.webhook_delivery.retried",
        target: row.id,
        ip: "mock-admin-session",
        result: "Success",
        context: reason,
      });
    } finally {
      retryingKeyRef.current = null;
      setRetryingKey(null);
    }
  };

  const eventsToday =
    isApi && baseRows.length > 0 ? String(baseRows.length) : "18.492";
  const successRate =
    isApi && baseRows.length > 0
      ? `${(
          (100 *
            baseRows.filter((r) => ["200", "202", "204"].includes(r.http))
              .length) /
          baseRows.length
        )
          .toFixed(2)
          .replace(".", ",")} %`
      : "99,72%";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          icon={Webhook}
          label="Events today"
          value={eventsToday}
          note="Xendit + seller events"
        />
        <AdminMetric
          icon={CheckCircle2}
          label="Success rate"
          value={successRate}
          note={isApi ? "From loaded window" : "+0,08%"}
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

      {partialError && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]"
        >
          <AlertTriangle className="mr-2 inline size-3.5" />
          Partial load: {partialError}
        </div>
      )}
      {isApi && consoleQuery.isError && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]"
        >
          <AlertTriangle className="mr-2 inline size-3.5" />
          Webhook console unavailable. Retry or check permissions.
        </div>
      )}

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
            {failedCallbacks.map((row) => {
              const key = webhookRowKey(row);
              return (
                <div
                  key={key}
                  className="flex flex-col gap-3 p-4 text-[8px] sm:flex-row sm:items-center"
                >
                  <button
                    onClick={() => setSelectedKey(key)}
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
                      onClick={() => requestRetry(row)}
                      disabled={retryingKey !== null || (isApi && !canReplay)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dce1e9] px-3 text-[8px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {retryingKey === key ? (
                        <RefreshCcw className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      {retryingKey === key ? "Retrying" : "Retry"}
                    </button>
                  </div>
                </div>
              );
            })}
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 text-[9px] outline-none"
              />
            </label>
            <select
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as "all" | "Xendit" | "Seller")
              }
              className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[9px] font-bold"
            >
              <option value="all">All sources</option>
              <option value="Xendit">Xendit</option>
              <option value="Seller">Seller</option>
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
                {pageRows.map((row) => {
                  const key = webhookRowKey(row);
                  return (
                    <tr
                      key={key}
                      onClick={() => setSelectedKey(key)}
                      className={cn(
                        "cursor-pointer border-t border-[#e8eaf0] text-[8px]",
                        selectedIdKey === key && "bg-[#f1f4ff]",
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
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination} />
        </section>

        <aside className={`${adminPanel} overflow-hidden`}>
          {selected ? (
            <>
              <div className="border-b border-[#e5e8ef] bg-[#11182a] p-5 text-white">
                <p className="font-mono text-[8px] text-[#91a2d2]">
                  {selected.id}
                </p>
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
                        [
                          "Endpoint",
                          selected.endpointHost
                            ? `https://${selected.endpointHost}`
                            : "https://merchant.example/webhooks",
                        ],
                        ["Delivery signature", "Signed outbound payload"],
                        [
                          "Last attempted",
                          selected.age === "now" ? "just now" : selected.age,
                        ],
                        ["Delivery ID", selected.id],
                        [
                          "Response body",
                          selected.payloadHash
                            ? `hash:${selected.payloadHash.slice(0, 16)}…`
                            : "Redacted and size-bounded",
                        ],
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
                      retryingKey !== null ||
                      (selected.kind === "PROVIDER_CALLBACK" &&
                        isApi &&
                        !canReplay) ||
                      (selected.kind === "SELLER_DELIVERY" &&
                        isApi &&
                        !canRetrySeller)
                    }
                    onClick={() => requestRetry(selected)}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] text-[8px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {retryingKey === selectedIdKey ? (
                      <RefreshCcw className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    {selected.kind === "PROVIDER_CALLBACK"
                      ? retryingKey === selectedIdKey
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
            </>
          ) : (
            <div className="p-6 text-center text-[9px] text-[#7c879d]">
              {isApi && consoleQuery.isLoading
                ? "Loading webhook events…"
                : "No webhook events in this window."}
            </div>
          )}
        </aside>
      </div>

      {forceOpen && selected && hasVerifiedForceFulfillEvidence(selected) && (
        <ForceFulfillDialog
          row={selected}
          onClose={() => setForceOpen(false)}
          onComplete={() => {
            if (!isApi) {
              setLocalRows((items) => {
                const current = items ?? consoleQuery.data?.rows ?? [];
                return current.map((item) =>
                  item.id === selected.id
                    ? { ...item, orderStatus: "Fulfilled" }
                    : item,
                );
              });
            } else {
              setLocalRows(null);
            }
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
          requiresRecentMfa={isApi}
          onConfirm={(reason) => retryDelivery(retryTarget, reason)}
          onClose={() => setRetryTargetKey(null)}
        />
      )}
    </>
  );
}
