import Link from "next/link";
import { ChevronRight, Copy, Search } from "lucide-react";
import { Logo } from "@/components/brand";
import { ApiPlayground } from "@/components/api-playground";

const sections = [
  "Mulai cepat",
  "Autentikasi",
  "QRIS payments",
  "Checkout sessions",
  "Orders",
  "Webhooks",
  "Errors",
];
const fields = [
  ["amount", "integer", "required", "Amount in IDR, without decimals."],
  ["description", "string", "required", "Shown in dashboard and webhooks."],
  ["customer", "object", "required", "Customer name and email."],
  ["expires_in_minutes", "integer", "optional", "Between 5 and 60 minutes."],
  ["metadata", "object", "optional", "Your own reference data."],
];

export default function DocsPage() {
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
        <aside className="hairline hidden min-h-[calc(100vh-64px)] border-r p-6 lg:block">
          <p className="text-[10px] font-extrabold tracking-wider text-[#8a958e] uppercase">
            Dokumentasi API
          </p>
          <nav className="mt-4 grid gap-1">
            {sections.map((x, i) => (
              <a
                href={`#${x.toLowerCase().replaceAll(" ", "-")}`}
                key={x}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${i === 2 ? "bg-[#e9ff9b] text-[#173f2c]" : "text-[#68756d] hover:bg-[#f0f1ec]"}`}
              >
                {x}
              </a>
            ))}
          </nav>
        </aside>
        <article className="min-w-0 px-5 py-12 sm:px-10 lg:px-12">
          <div className="mx-auto max-w-[900px]">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#7a867f]">
              API reference <ChevronRight className="size-3" /> Payments
            </div>
            <h1 className="font-display mt-5 text-6xl tracking-[-.04em]">
              Create a QRIS payment
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[#647169]">
              Creates a payment intent and returns dynamic QRIS data. Explore
              the request safely in the live frontend playground before
              integrating a backend.
            </p>
            <div className="hairline mt-8 flex gap-3 border-b pb-8">
              <span className="rounded-lg bg-[#bdf8d0] px-3 py-2 text-[11px] font-extrabold text-[#194b34]">
                POST
              </span>
              <code className="rounded-lg bg-[#eef0eb] px-3 py-2 text-[11px]">
                /v1/qris/payments
              </code>
            </div>
            <ApiPlayground />
            <h2 id="autentikasi" className="mt-10 text-xl font-extrabold">
              Authentication
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66736c]">
              Pass your secret API key in the Authorization header. Use test
              keys while developing.
            </p>
            <CodeBlock code="Authorization: Bearer sk_test_your_key" />
            <h2 id="qris-payments" className="mt-10 text-xl font-extrabold">
              Request schema
            </h2>
            <div className="hairline mt-4 overflow-hidden rounded-2xl border bg-white">
              {fields.map((row, i) => (
                <div
                  key={row[0]}
                  className={`grid gap-1 px-4 py-4 text-xs sm:grid-cols-[140px_100px_1fr] ${i ? "hairline border-t" : ""}`}
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
            <h2 className="mt-10 text-xl font-extrabold">Example response</h2>
            <CodeBlock
              code={
                '{\n  "id": "qris_2Yc91p",\n  "status": "pending",\n  "amount": 99000,\n  "currency": "IDR",\n  "qr_image_url": "https://...",\n  "expires_at": "2026-07-12T12:30:00.000Z"\n}'
              }
            />
          </div>
        </article>
        <aside className="hidden p-6 xl:block">
          <p className="text-[10px] font-extrabold tracking-wider text-[#8a958e] uppercase">
            Di halaman ini
          </p>
          <div className="mt-4 grid gap-3 text-xs text-[#6f7b74]">
            <a href="#autentikasi">Authentication</a>
            <a href="#qris-payments">Request</a>
            <a href="#">Playground</a>
            <a href="#">Errors</a>
          </div>
        </aside>
      </div>
    </main>
  );
}
function CodeBlock({ code }: { code: string }) {
  return (
    <div className="group shadow-card relative mt-4 overflow-x-auto rounded-2xl bg-[#14241c] p-5 text-white">
      <button
        className="absolute top-3 right-3 rounded-lg border border-white/10 bg-white/5 p-2 text-white/50"
        aria-label="Copy"
      >
        <Copy className="size-3.5" />
      </button>
      <pre className="text-[11px] leading-6 text-white/72">
        <code>{code}</code>
      </pre>
    </div>
  );
}
