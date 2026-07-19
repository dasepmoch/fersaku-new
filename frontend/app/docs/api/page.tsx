"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronRight, Copy, Search } from "lucide-react";
import { Logo } from "@/components/brand";
import { ApiPlayground } from "@/components/api-playground";

/** Left nav + section anchors — labels match on-page headings. */
const navSections = [
  { id: "mulai-cepat", label: "Mulai cepat" },
  { id: "autentikasi", label: "Autentikasi" },
  { id: "qris-payments", label: "Request schema" },
  { id: "payment-status", label: "Payment status" },
  { id: "idempotency", label: "Idempotency" },
  { id: "webhooks", label: "Webhooks" },
  { id: "api-playground", label: "Playground" },
  { id: "errors", label: "Errors" },
] as const;

/** CreateGatewayPaymentRequest — aligned with backend/api/openapi.yaml */
const fields: [string, string, string, string][] = [
  [
    "merchantReference",
    "string",
    "required",
    "Your unique invoice reference (max 128).",
  ],
  ["amount", "integer", "required", "Whole IDR gross (int64, no decimals)."],
  ["currency", "string", "optional", "IDR only."],
  [
    "description",
    "string",
    "optional",
    "Shown in dashboard and webhooks (max 500).",
  ],
  [
    "customer",
    "object",
    "optional",
    "Opaque customer metadata (reference, email).",
  ],
  ["expiresInMinutes", "integer", "optional", "Between 5 and 60 minutes."],
  [
    "successUrl",
    "string",
    "optional",
    "Browser HTTPS redirect; origin must be allowlisted.",
  ],
  [
    "failureUrl",
    "string",
    "optional",
    "Browser HTTPS redirect; origin must be allowlisted.",
  ],
  [
    "webhookEndpointId",
    "string",
    "optional",
    "ACTIVE same-merchant endpoint id — never a URL.",
  ],
  [
    "metadata",
    "object",
    "optional",
    "Bounded opaque JSON (8KiB, depth 4, 50 keys).",
  ],
];

/** GatewayPaymentIntent sample (envelope: { data, meta }) */
const exampleResponse = `{
  "data": {
    "paymentIntentId": "pi_01KXX78RQQFNQ4FW19Y5GT1Z1J",
    "orderId": "ord_01KXX78RQQFNQ4FW19Y5GT1Z1H",
    "merchantReference": "invoice-2026-0001",
    "status": "PENDING",
    "source": "QRIS_API",
    "paymentMode": "SANDBOX",
    "currency": "IDR",
    "amount": 99000,
    "fee": 3670,
    "merchantNet": 95330,
    "expiresAt": "2026-07-19T13:08:35Z",
    "qrString": "00020101021226...",
    "qrImageUrl": "https://sandbox.duitku.com/...",
    "createdAt": "2026-07-19T12:38:35Z"
  },
  "meta": {
    "requestId": "01KXX78RQQFNQ4FW19Y5GT1Z1K",
    "timestamp": "2026-07-19T12:38:35Z"
  }
}`;

const statusValues = [
  "PENDING",
  "PAID",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "CANCEL_PENDING",
  "EXPIRE_PENDING",
  "UNKNOWN_OUTCOME",
  "REQUIRES_PAYMENT",
] as const;

export default function DocsPage() {
  const [activeId, setActiveId] = useState<string>("mulai-cepat");

  useEffect(() => {
    const ids = navSections.map((s) => s.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    elements.forEach((el) => observer.observe(el));

    const onHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && ids.includes(hash as (typeof ids)[number])) setActiveId(hash);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#fbfaf6]">
      <header className="hairline sticky top-0 z-30 flex h-16 items-center border-b bg-[#fbfaf6]/90 px-5 backdrop-blur-xl lg:px-8">
        <Logo />
        <span className="ml-3 rounded-md bg-[#e8ebe4] px-2 py-1 text-[10px] font-extrabold">
          DOCS
        </span>
        <div className="hairline ml-auto hidden items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs text-[#7a867f] sm:flex">
          <Search className="size-3.5" /> Cari dokumentasi{" "}
          <kbd className="hairline ml-5 rounded border px-1.5">⌘K</kbd>
        </div>
        <Link href="/dashboard" className="ml-4 text-xs font-bold">
          Dashboard
        </Link>
      </header>
      <div className="mx-auto grid max-w-[1420px] lg:grid-cols-[220px_1fr_220px]">
        <aside className="hairline sticky top-16 hidden max-h-[calc(100vh-64px)] min-h-[calc(100vh-64px)] overflow-y-auto border-r p-6 lg:block">
          <p className="text-[10px] font-extrabold tracking-wider text-[#8a958e] uppercase">
            Dokumentasi API
          </p>
          <nav className="mt-4 grid gap-1" aria-label="Dokumentasi API">
            {navSections.map((s) => {
              const active = activeId === s.id;
              return (
                <a
                  href={`#${s.id}`}
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    active
                      ? "bg-[#e9ff9b] text-[#173f2c]"
                      : "text-[#68756d] hover:bg-[#f0f1ec]"
                  }`}
                  aria-current={active ? "location" : undefined}
                >
                  {s.label}
                </a>
              );
            })}
          </nav>
          <p className="mt-8 text-[10px] font-extrabold tracking-wider text-[#8a958e] uppercase">
            Referensi
          </p>
          <nav className="mt-3 grid gap-1">
            <Link
              href="/docs/api"
              className="rounded-lg bg-[#e9ff9b] px-3 py-2 text-xs font-semibold text-[#173f2c]"
            >
              QRIS Gateway API
            </Link>
            <Link
              href="/api"
              className="rounded-lg px-3 py-2 text-xs font-semibold text-[#68756d] hover:bg-[#f0f1ec]"
            >
              QRIS product page
            </Link>
            <Link
              href="/help"
              className="rounded-lg px-3 py-2 text-xs font-semibold text-[#68756d] hover:bg-[#f0f1ec]"
            >
              Help center
            </Link>
          </nav>
        </aside>
        <article className="min-w-0 px-5 py-12 sm:px-10 lg:px-12">
          <div className="mx-auto max-w-[900px]">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#7a867f]">
              <Link href="/docs" className="hover:text-[#173f2c]">
                API reference
              </Link>
              <ChevronRight className="size-3" /> Payments
            </div>
            <h1
              id="mulai-cepat"
              className="font-display mt-5 scroll-mt-24 text-6xl tracking-[-.04em]"
            >
              Create a QRIS payment
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[#647169]">
              Creates an independent QRIS payment intent via the merchant API
              key and returns dynamic QRIS data. This gateway does not create
              products, inventory, or storefront orders for you.
            </p>
            <div className="hairline mt-8 flex flex-wrap gap-3 border-b pb-8">
              <span className="rounded-lg bg-[#bdf8d0] px-3 py-2 text-[11px] font-extrabold text-[#194b34]">
                POST
              </span>
              <code className="rounded-lg bg-[#eef0eb] px-3 py-2 text-[11px]">
                /v1/gateway/payment-intents
              </code>
            </div>
            <ApiPlayground />
            <h2
              id="autentikasi"
              className="mt-10 scroll-mt-24 text-xl font-extrabold"
            >
              Authentication
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Pass your secret merchant API key as a Bearer token. Use{" "}
              <code className="rounded bg-[#eef0eb] px-1.5 py-0.5 text-[11px]">
                fsk_test_…
              </code>{" "}
              (sandbox) while developing. Live keys require active QRIS API KYC
              capability. Never put keys in query strings, cookies, or frontend
              env.
            </p>
            <CodeBlock code="Authorization: Bearer fsk_test_your_key" />
            <CodeBlock code="Idempotency-Key: inv-2026-0001-create" />
            <h2
              id="qris-payments"
              className="mt-10 scroll-mt-24 text-xl font-extrabold"
            >
              Request schema
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Body for{" "}
              <code className="text-[11px]">
                POST /v1/gateway/payment-intents
              </code>
              . Field names match the OpenAPI{" "}
              <code className="text-[11px]">CreateGatewayPaymentRequest</code>{" "}
              contract. Sending <code className="text-[11px]">webhookUrl</code>{" "}
              is always rejected — use{" "}
              <code className="text-[11px]">webhookEndpointId</code> only.
            </p>
            <div className="hairline mt-4 overflow-hidden rounded-2xl border bg-white">
              {fields.map((row, i) => (
                <div
                  key={row[0]}
                  className={`grid gap-1 px-4 py-4 text-xs sm:grid-cols-[160px_100px_1fr] ${i ? "hairline border-t" : ""}`}
                >
                  <code className="font-bold text-[#245e42]">{row[0]}</code>
                  <span>
                    {row[1]}{" "}
                    <small className="block text-[#a0644c]">{row[2]}</small>
                  </span>
                  <span className="text-[#6e7b73]">{row[3]}</span>
                </div>
              ))}
            </div>
            <h2
              id="payment-status"
              className="mt-10 scroll-mt-24 text-xl font-extrabold"
            >
              Payment status
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Poll{" "}
              <code className="text-[11px]">
                GET /v1/gateway/payment-intents/{"{paymentIntentId}"}
              </code>{" "}
              or subscribe to signed webhooks. Status values are
              server-authoritative; never treat client timers as paid.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {statusValues.map((s) => (
                <code
                  key={s}
                  className="rounded-lg bg-[#eef0eb] px-2.5 py-1.5 text-[10px] font-bold text-[#245e42]"
                >
                  {s}
                </code>
              ))}
            </div>
            <h2
              id="idempotency"
              className="mt-10 scroll-mt-24 text-xl font-extrabold"
            >
              Idempotency
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Send a unique <code className="text-[11px]">Idempotency-Key</code>{" "}
              header on create. Same key and body return the same intent (HTTP
              200 replay). A changed body with the same key conflicts.
            </p>
            <h2
              id="webhooks"
              className="mt-10 scroll-mt-24 text-xl font-extrabold"
            >
              Webhooks
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Register HTTPS endpoints under your store webhooks API
              (SSRF-safe). Pass the endpoint id as{" "}
              <code className="text-[11px]">webhookEndpointId</code> on create —
              never a raw URL. Delivery is signed and retryable; verify
              signatures before updating merchant state. Inbound provider
              callbacks (Duitku/Xendit) are server-side only.
            </p>
            <h2 className="mt-10 text-xl font-extrabold">Example response</h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Success envelope:{" "}
              <code className="text-[11px]">{"{ data, meta }"}</code>. Create
              returns <code className="text-[11px]">201</code> (or{" "}
              <code className="text-[11px]">200</code> on idempotent replay).
            </p>
            <CodeBlock code={exampleResponse} />
            <h2
              id="errors"
              className="mt-10 scroll-mt-24 text-xl font-extrabold"
            >
              Errors
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Errors use a consistent problem payload with a machine-readable
              code. Invalid JSON and validation failures return 400; missing or
              invalid API keys return 401; LIVE without KYC capability returns
              403 (
              <code className="text-[11px]">KYC_REQUIRED_FOR_LIVE_API</code>
              ).
            </p>
            <CodeBlock
              code={`{\n  "problem": {\n    "code": "VALIDATION_FAILED",\n    "message": "Request validation failed",\n    "requestId": "01KXX…"\n  }\n}`}
            />
          </div>
        </article>
        <aside className="sticky top-16 hidden max-h-[calc(100vh-64px)] overflow-y-auto p-6 xl:block">
          <p className="text-[10px] font-extrabold tracking-wider text-[#8a958e] uppercase">
            Di halaman ini
          </p>
          <div className="mt-4 grid gap-3 text-xs text-[#6f7b74]">
            {navSections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActiveId(s.id)}
                className={
                  activeId === s.id
                    ? "font-bold text-[#173f2c]"
                    : "hover:text-[#173f2c]"
                }
              >
                {s.label}
              </a>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group shadow-card relative mt-4 overflow-x-auto rounded-2xl bg-[#14241c] p-5 text-white">
      <button
        type="button"
        className="absolute top-3 right-3 rounded-lg border border-white/10 bg-white/5 p-2 text-white/50"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <pre className="text-[11px] leading-6 text-white/72">
        <code>{code}</code>
      </pre>
    </div>
  );
}
