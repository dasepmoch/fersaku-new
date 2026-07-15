"use client";

import { LoaderCircle, Send, Webhook, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

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
function Field({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="grid gap-2 text-[9px] font-bold">
      {label}
      <select className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-normal">
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
export function WebhookLab() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; latency: number }>(
    null,
  );
  const [event, setEvent] = useState("order.paid");
  const [payload, setPayload] = useState(
    '{\n  "id": "ord_mock_240712",\n  "event": "order.paid",\n  "amount": 79000,\n  "currency": "IDR"\n}',
  );
  const send = () => {
    setSending(true);
    setResult(null);
    setTimeout(() => {
      setSending(false);
      setResult({
        ok: event !== "payment.failed",
        latency: event === "payment.failed" ? 1842 : 86,
      });
    }, 900);
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
              https://asep.ai/api/webhooks/fersaku
            </code>
          </div>
          <span className="w-fit rounded-full bg-[#e5f5e6] px-2.5 py-1.5 text-[9px] font-extrabold text-[#2e714f]">
            Active
          </span>
          <button
            onClick={() => setOpen(true)}
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
          {[
            ["order.paid", "200 OK", "84 ms"],
            ["delivery.fulfilled", "200 OK", "112 ms"],
            ["payment.qris.created", "500 Error", "1.8 s"],
          ].map((row) => (
            <div
              key={row[0]}
              className="hairline grid grid-cols-[1fr_auto_auto] gap-4 border-t px-5 py-4 text-[10px]"
            >
              <code className="font-bold">{row[0]}</code>
              <b
                className={
                  row[1].startsWith("200") ? "text-[#2e714f]" : "text-[#b2573c]"
                }
              >
                {row[1]}
              </b>
              <span className="w-12 text-right text-[#718078]">{row[2]}</span>
            </div>
          ))}
        </div>
      </section>
      {open && (
        <Modal
          title="Webhook test console"
          description="Kirim payload mock ke endpoint terdaftar dan lihat response seperti integrasi production."
          onClose={() => setOpen(false)}
        >
          <div className="grid gap-4">
            <Field
              label="Endpoint"
              options={[
                "Production — asep.ai/api/webhooks/fersaku",
                "Staging — staging.asep.ai/hooks",
              ]}
            />
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
            {result && (
              <div
                className={cn(
                  "rounded-2xl border p-4",
                  result.ok
                    ? "border-[#b8ddbb] bg-[#edf8ee]"
                    : "border-[#efc2b5] bg-[#fff0eb]",
                )}
              >
                <div className="flex items-center">
                  <b className="text-xs">
                    HTTP {result.ok ? "200 OK" : "500 Internal Server Error"}
                  </b>
                  <span className="ml-auto text-[9px]">
                    {result.latency} ms
                  </span>
                </div>
                <pre className="mt-3 overflow-x-auto text-[9px]">
                  {result.ok
                    ? '{ "received": true, "delivery": "accepted" }'
                    : '{ "error": "test endpoint rejected payload" }'}
                </pre>
              </div>
            )}
            <button
              onClick={send}
              disabled={sending}
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
