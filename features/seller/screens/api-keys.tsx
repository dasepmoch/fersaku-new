"use client";

import { sellerCard } from "@/features/seller/ui";

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { useState } from "react";

const FIXED_API_KEY = "sk_live_frs_8Mzv2Kp91xL0Qe7H4nR2";
const FIXED_WEBHOOK_SECRET = "whsec_frs_9Kp2Lm4Qx7Vz1Ab3Cd5Ef";

function ApiKeys() {
  return (
    <>
      <div className="rounded-[24px] border border-[#c3dca9] bg-[#eef7df] p-5 sm:flex sm:items-center">
        <span className="grid size-10 place-items-center rounded-xl bg-[#d7ff64]">
          <KeyRound className="size-4" />
        </span>
        <div className="mt-3 sm:mt-0 sm:ml-4">
          <h3 className="text-sm font-extrabold">
            Satu API key & webhook secret per akun
          </h3>
          <p className="mt-1 text-xs text-[#627157]">
            Credential disediakan Fersaku secara otomatis. Tidak bisa dibuat
            atau diganti sendiri.
          </p>
        </div>
        <Link
          href="/docs/api"
          className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold sm:mt-0 sm:ml-auto"
        >
          Baca docs <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <section className={`${sellerCard} mt-4 overflow-hidden`}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#e8f0e4] text-[#315d47]">
              <KeyRound className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">API key</h2>
              <p className="mt-1 text-[10px] text-[#7d8982]">
                Secret key untuk autentikasi request QRIS API.
              </p>
            </div>
          </div>
          <SecretRow value={FIXED_API_KEY} label="API key" />
        </div>
        <div className="hairline border-t p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#ebe4ff] text-[#5b4a9a]">
              <Webhook className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">Webhook secret</h2>
              <p className="mt-1 text-[10px] text-[#7d8982]">
                Dipakai untuk memverifikasi signature event webhook.
              </p>
            </div>
          </div>
          <SecretRow value={FIXED_WEBHOOK_SECRET} label="Webhook secret" />
        </div>
        <div className="border-t border-[#e5e9e2] bg-[#f3f4ef] px-5 py-4">
          <p className="text-[10px] leading-5 text-[#5f6b64]">
            Butuh mengganti API key atau webhook secret? Hubungi admin Fersaku
            di{" "}
            <a
              href="mailto:support@fersaku.id"
              className="font-extrabold text-[#315d47] underline decoration-[#315d47]/30 underline-offset-2"
            >
              support@fersaku.id
            </a>
            . Seller tidak dapat membuat, merotasi, atau menghapus credential
            sendiri.
          </p>
        </div>
      </section>

      <section className="mt-4 rounded-[24px] border border-[#b9c9f5] bg-[#eef2ff] p-5 sm:flex sm:items-start">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#dfe7ff] text-[#536fdf]">
          <ShieldCheck className="size-4" />
        </span>
        <div className="mt-3 sm:mt-0 sm:ml-4">
          <h3 className="text-sm font-extrabold">Keamanan credential</h3>
          <p className="mt-1 max-w-2xl text-[10px] leading-5 text-[#65718b]">
            Jangan pernah mengekspos API key atau webhook secret di frontend,
            repositori publik, atau log client. Simpan hanya di server / secret
            manager kamu.
          </p>
        </div>
      </section>
    </>
  );
}

function SecretRow({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-4">
      <div className="hairline flex items-center gap-2 rounded-xl border bg-white p-3">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-[#1c2a22]">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="hairline inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-[#f7f8f4] px-3 text-[9px] font-extrabold text-[#315d47]"
          aria-label={`Salin ${label}`}
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Disalin
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Salin
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export { ApiKeys as SellerApiKeysScreen };
