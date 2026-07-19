"use client";

import {
  Check,
  Copy,
  LoaderCircle,
  Play,
  RotateCcw,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getDomainSource } from "@/shared/data/domain-source";

/**
 * PUB-230 — documentation sandbox exemption (not production payment authority).
 * mock/prototype: deterministic labeled no-network response only.
 * api/disabled: Send is DISABLED; never render timer/fake IDs as live network.
 * Domain key: publicCatalog (public docs surface; no separate playground domain).
 */
const PLAYGROUND_SEND_DISABLED_TITLE =
  "API playground sandbox is out of scope for launch (PUB-230 deferred)";

const presets: Record<string, string> = {
  "POST /v1/gateway/payment-intents":
    '{\n  "merchantReference": "invoice-2026-0001",\n  "amount": 99000,\n  "currency": "IDR",\n  "description": "Invoice #0001",\n  "expiresInMinutes": 15,\n  "metadata": { "customerId": "cust_opaque" }\n}',
  "GET /v1/gateway/payment-intents/qris_mock_2Yc91p": "{}",
  "POST /v1/gateway/payment-intents/qris_mock_2Yc91p/cancel": "{}",
  "GET /v1/gateway/events/evt_mock_01": "{}",
};

export function ApiPlayground() {
  const [endpoint, setEndpoint] = useState(Object.keys(presets)[0]);
  const [body, setBody] = useState(presets[endpoint]);
  const [tab, setTab] = useState("Body");
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<null | {
    status: number;
    duration: number;
    body: string;
  }>(null);
  const [copied, setCopied] = useState(false);

  const publicSource = (() => {
    try {
      return getDomainSource("publicCatalog");
    } catch {
      return "api";
    }
  })();
  // Mock may keep deterministic prototype timer; API/disabled must not fake live.
  const playgroundSendEnabled = publicSource === "mock";

  const send = () => {
    if (!playgroundSendEnabled) return;
    setSending(true);
    setResponse(null);
    setTimeout(() => {
      let parsed = true;
      try {
        JSON.parse(body);
      } catch {
        parsed = false;
      }
      setSending(false);
      setResponse(
        parsed
          ? {
              status: endpoint.startsWith("POST") ? 201 : 200,
              duration: 128,
              body: JSON.stringify(
                {
                  paymentIntentId: "qris_mock_2Yc91p",
                  status: endpoint.endsWith("/cancel")
                    ? "CANCELLED"
                    : "PENDING",
                  paymentMode: "SANDBOX",
                  createdAt: new Date().toISOString(),
                },
                null,
                2,
              ),
            }
          : {
              status: 400,
              duration: 42,
              body: JSON.stringify(
                {
                  error: {
                    code: "invalid_json",
                    message: "Request body contains invalid JSON.",
                  },
                },
                null,
                2,
              ),
            },
      );
    }, 850);
  };
  return (
    <section
      id="api-playground"
      className="hairline shadow-float my-10 overflow-hidden rounded-[28px] border bg-[#0f1914] text-white"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[#d7ff64] text-[#173f2c]">
            <Terminal className="size-4" />
          </span>
          <div>
            <b className="block text-[10px]">Live API Playground</b>
            <span className="text-[8px] text-white/35">
              Frontend mock • no network request
            </span>
          </div>
        </div>
        <select
          value={endpoint}
          onChange={(e) => {
            setEndpoint(e.target.value);
            setBody(presets[e.target.value]);
            setResponse(null);
          }}
          className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] text-white sm:ml-auto"
        >
          {Object.keys(presets).map((x) => (
            <option key={x} className="bg-[#0f1914]">
              {x}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={send}
          disabled={!playgroundSendEnabled || sending}
          title={
            playgroundSendEnabled ? undefined : PLAYGROUND_SEND_DISABLED_TITLE
          }
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#d7ff64] px-4 text-[9px] font-extrabold text-[#173f2c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Play className="size-3.5 fill-current" />
          )}
          {sending ? "Sending..." : "Send request"}
        </button>
      </div>
      <div className="grid lg:grid-cols-2">
        <div className="border-b border-white/10 lg:border-r lg:border-b-0">
          <div className="flex gap-4 border-b border-white/10 px-4">
            {["Body", "cURL", "JavaScript"].map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTab(x)}
                className={cn(
                  "border-b-2 py-3 text-[8px] font-extrabold",
                  tab === x
                    ? "border-[#d7ff64] text-[#d7ff64]"
                    : "border-transparent text-white/35",
                )}
              >
                {x}
              </button>
            ))}
          </div>
          {tab === "Body" ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={15}
              spellCheck={false}
              className="w-full resize-none bg-transparent p-5 font-mono text-[10px] leading-5 text-[#c9f7d9] outline-none"
            />
          ) : (
            <pre className="min-h-[340px] overflow-auto p-5 text-[9px] leading-5 text-[#c9f7d9]">
              <code>
                {tab === "cURL"
                  ? `curl -X ${endpoint.split(" ")[0]} https://api.fersaku.id${endpoint.split(" ")[1]} \\\n  -H "Authorization: Bearer sk_test_xxx" \\\n  -H "Idempotency-Key: invoice-2026-0001" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/\n/g, "")}'`
                  : `const response = await fetch("https://api.fersaku.id${endpoint.split(" ")[1]}", {\n  method: "${endpoint.split(" ")[0]}",\n  headers: {\n    Authorization: "Bearer sk_test_xxx",\n    "Idempotency-Key": "invoice-2026-0001"\n  },\n  body: JSON.stringify(${body})\n});`}
              </code>
            </pre>
          )}
        </div>
        <div>
          <div className="flex h-[45px] items-center border-b border-white/10 px-4">
            <b className="text-[8px] tracking-[.14em] text-white/40 uppercase">
              Response
            </b>
            {response && (
              <>
                <span
                  className={cn(
                    "ml-3 rounded-full px-2 py-1 text-[7px] font-extrabold",
                    response.status < 300
                      ? "bg-[#1e6d48] text-[#bdf8d0]"
                      : "bg-[#7a3327] text-[#ffd1c5]",
                  )}
                >
                  {response.status}{" "}
                  {response.status < 300 ? "Created" : "Bad Request"}
                </span>
                <span className="ml-2 text-[7px] text-white/35">
                  {response.duration} ms
                </span>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                if (response) navigator.clipboard?.writeText(response.body);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="ml-auto grid size-8 place-items-center rounded-lg border border-white/10 text-white/45"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          </div>
          {response ? (
            <div className="p-5">
              <div className="mb-4 grid grid-cols-[90px_1fr] gap-2 text-[7px] text-white/40">
                <span>content-type</span>
                <code>application/json</code>
                <span>x-request-id</span>
                <code>req_mock_01J2V9</code>
              </div>
              <pre className="overflow-auto rounded-xl bg-black/20 p-4 text-[10px] leading-5 text-[#c9defd]">
                {response.body}
              </pre>
            </div>
          ) : (
            <div className="grid min-h-[340px] place-items-center p-6 text-center">
              <div>
                <RotateCcw className="mx-auto size-6 text-white/20" />
                <b className="mt-4 block text-[10px] text-white/55">
                  Ready to send
                </b>
                <p className="mt-2 text-[8px] leading-4 text-white/30">
                  Edit the request, then send it to receive a deterministic mock
                  response.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
