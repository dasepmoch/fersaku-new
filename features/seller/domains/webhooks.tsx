"use client";

import { LoaderCircle, Send, Webhook, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useSellerStoreId } from "@/shared/seller/current-store";
import {
  endpointSelectLabel,
  useSellerWebhookDeliveries,
  useSellerWebhooks,
  useTestSellerWebhook,
} from "@/features/seller/webhooks";

const card = "rounded-[22px] border hairline bg-[#fbfaf7] shadow-card";
function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[#07110c]/65 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="hairline max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] border bg-[#fbfaf7] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start gap-4">
          <div>
            <h2 className="text-lg font-extrabold">{title}</h2>
            <p className="mt-1 text-[10px] leading-5 text-[#718078]">
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="hairline ml-auto grid size-9 place-items-center rounded-xl border bg-white"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
export function WebhookLab() {
  const storeId = useSellerStoreId();
  const endpointsQuery = useSellerWebhooks(storeId);
  const deliveriesQuery = useSellerWebhookDeliveries(storeId);
  const testMutation = useTestSellerWebhook(storeId);

  const endpoints = endpointsQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];

  const primary = endpoints[0];
  const [open, setOpen] = useState(false);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>("");
  const [event, setEvent] = useState("order.paid");
  const [payload, setPayload] = useState(
    '{\n  "id": "ord_mock_240712",\n  "event": "order.paid",\n  "amount": 79000,\n  "currency": "IDR"\n}',
  );

  const effectiveEndpointId =
    selectedEndpointId || primary?.id || endpoints[0]?.id || "";

  const endpointOptions = useMemo(
    () =>
      endpoints.length > 0
        ? endpoints.map((ep) => ({
            id: ep.id,
            label: endpointSelectLabel(ep),
          }))
        : [
            {
              id: "",
              label: "Production — asep.ai/api/webhooks/fersaku",
            },
          ],
    [endpoints],
  );

  const displayUrl =
    primary?.url ?? "https://asep.ai/api/webhooks/fersaku";
  const statusLabel = primary?.statusLabel ?? "Active";
  const isActive =
    !primary ||
    primary.status === "ACTIVE" ||
    statusLabel.toLowerCase() === "active";

  const tableRows = useMemo(() => {
    if (deliveries.length > 0) {
      return deliveries.slice(0, 12).map((d) => ({
        key: d.deliveryId,
        event: d.eventType,
        response: d.responseLabel,
        latency: d.latencyLabel,
        ok: d.responseLabel.startsWith("200"),
      }));
    }
    return [
      {
        key: "seed-1",
        event: "order.paid",
        response: "200 OK",
        latency: "84 ms",
        ok: true,
      },
      {
        key: "seed-2",
        event: "delivery.fulfilled",
        response: "200 OK",
        latency: "112 ms",
        ok: true,
      },
      {
        key: "seed-3",
        event: "payment.qris.created",
        response: "500 Error",
        latency: "1.8 s",
        ok: false,
      },
    ];
  }, [deliveries]);

  const testResult = testMutation.data
    ? {
        ok: (testMutation.data.lastHttpStatus ?? 0) >= 200 &&
          (testMutation.data.lastHttpStatus ?? 0) < 300,
        latency: testMutation.data.lastLatencyMs ?? 0,
        statusLabel: testMutation.data.responseLabel,
        body: testMutation.data.status === "DELIVERED" ||
        ((testMutation.data.lastHttpStatus ?? 0) >= 200 &&
          (testMutation.data.lastHttpStatus ?? 0) < 300)
          ? '{ "received": true, "delivery": "accepted" }'
          : '{ "error": "test endpoint rejected payload" }',
      }
    : null;

  const sending = testMutation.isPending;

  const send = () => {
    if (!effectiveEndpointId) return;
    testMutation.mutate(effectiveEndpointId);
  };

  return (
    <>
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-11 place-items-center rounded-xl bg-[#d5c8ff]">
            <Webhook className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold">Production endpoint</h2>
            <code className="mt-1 block text-[9px] text-[#718078]">
              {displayUrl}
            </code>
          </div>
          <span
            className={cn(
              "w-fit rounded-full px-2.5 py-1.5 text-[9px] font-extrabold",
              isActive
                ? "bg-[#e5f5e6] text-[#2e714f]"
                : "bg-[#f3f0e8] text-[#718078]",
            )}
          >
            {statusLabel}
          </span>
          <button
            onClick={() => {
              setSelectedEndpointId(primary?.id ?? endpoints[0]?.id ?? "");
              setOpen(true);
              testMutation.reset();
            }}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#173f2c] px-4 text-[10px] font-extrabold text-white sm:ml-auto"
          >
            <Send className="size-4" /> Send test webhook
          </button>
        </div>
        <div className="hairline border-t">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 text-[8px] font-extrabold tracking-wider text-[#718078] uppercase">
            <span>Event</span>
            <span>Response</span>
            <span>Latency</span>
          </div>
          {tableRows.map((row) => (
            <div
              key={row.key}
              className="hairline grid grid-cols-[1fr_auto_auto] gap-4 border-t px-5 py-4 text-[10px]"
            >
              <code className="font-bold">{row.event}</code>
              <b
                className={
                  row.ok ? "text-[#2e714f]" : "text-[#b2573c]"
                }
              >
                {row.response}
              </b>
              <span className="w-12 text-right text-[#718078]">
                {row.latency}
              </span>
            </div>
          ))}
        </div>
      </section>
      {open && (
        <Modal
          title="Webhook test console"
          description="Kirim payload mock ke endpoint terdaftar dan lihat response seperti integrasi production."
          onClose={() => {
            setOpen(false);
            testMutation.reset();
          }}
        >
          <div className="grid gap-4">
            <label className="grid gap-2 text-[9px] font-bold">
              Endpoint
              <select
                value={effectiveEndpointId}
                onChange={(e) => setSelectedEndpointId(e.target.value)}
                className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-normal"
              >
                {endpointOptions.map((opt) => (
                  <option key={opt.id || opt.label} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-[9px] font-bold">
              Event
              <select
                value={event}
                onChange={(e) => {
                  setEvent(e.target.value);
                  setPayload(
                    `{\n  "id": "evt_mock_240712",\n  "event": "${e.target.value}",\n  "livemode": false\n}`,
                  );
                }}
                className="hairline h-11 rounded-xl border bg-white px-3"
              >
                <option>order.paid</option>
                <option>delivery.fulfilled</option>
                <option>payment.failed</option>
                <option>withdrawal.completed</option>
              </select>
            </label>
            <label className="grid gap-2 text-[9px] font-bold">
              JSON payload
              <textarea
                rows={9}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                className="hairline rounded-xl border bg-[#111a16] p-4 font-mono text-[10px] leading-5 text-[#c9f7d9] outline-none"
              />
            </label>
            {testResult && (
              <div
                className={cn(
                  "rounded-2xl border p-4",
                  testResult.ok
                    ? "border-[#b8ddbb] bg-[#edf8ee]"
                    : "border-[#efc2b5] bg-[#fff0eb]",
                )}
              >
                <div className="flex items-center">
                  <b className="text-xs">
                    HTTP{" "}
                    {testResult.ok
                      ? "200 OK"
                      : testResult.statusLabel ||
                        "500 Internal Server Error"}
                  </b>
                  <span className="ml-auto text-[9px]">
                    {testResult.latency} ms
                  </span>
                </div>
                <pre className="mt-3 overflow-x-auto text-[9px]">
                  {testResult.body}
                </pre>
              </div>
            )}
            <button
              onClick={send}
              disabled={sending || !effectiveEndpointId}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white"
            >
              {sending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {sending ? "Sending signed request..." : "Send request"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
