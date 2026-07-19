"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Code2,
  CreditCard,
  Package,
  Search,
  Store,
  WalletCards,
} from "lucide-react";
import { ContentPage } from "@/components/content-page";

/** PUB-230: static help index — local filter only; no backend search. */
const HELP_CATEGORIES = [
  {
    id: "memulai-toko",
    Icon: Store,
    title: "Memulai toko",
    count: "7 artikel",
    keywords: "mulai toko storefront onboarding setup",
  },
  {
    id: "produk-delivery",
    Icon: Package,
    title: "Produk & delivery",
    count: "12 artikel",
    keywords: "produk product delivery file digital",
  },
  {
    id: "qris-pesanan",
    Icon: CreditCard,
    title: "QRIS & pesanan",
    count: "9 artikel",
    keywords: "qris pesanan order pembayaran payment",
  },
  {
    id: "saldo-penarikan",
    Icon: WalletCards,
    title: "Saldo & penarikan",
    count: "8 artikel",
    keywords: "saldo balance penarikan withdraw payout",
  },
  {
    id: "api-webhook",
    Icon: Code2,
    title: "API & webhook",
    count: "14 artikel",
    keywords: "api webhook gateway developer",
  },
  {
    id: "akun-keamanan",
    Icon: BookOpen,
    title: "Akun & keamanan",
    count: "6 artikel",
    keywords: "akun account keamanan security mfa",
  },
] as const;

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return HELP_CATEGORIES.filter((cat) => {
      if (activeCategoryId && cat.id !== activeCategoryId) return false;
      if (!normalized) return true;
      const haystack =
        `${cat.title} ${cat.keywords} ${cat.count}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [normalized, activeCategoryId]);

  return (
    <ContentPage
      eyebrow="Help center"
      title={
        <>
          Apa yang bisa kami <em className="text-[#315d47]">bantu?</em>
        </>
      }
      description="Panduan praktis untuk membangun toko, menerima pembayaran, mengirim produk, dan mengelola akun."
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[1000px]">
          <div className="hairline shadow-float mx-auto -mt-8 flex h-14 max-w-2xl items-center gap-3 rounded-2xl border bg-white px-5">
            <Search className="size-5 text-[#718078]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveCategoryId(null);
              }}
              placeholder="Cari panduan, topik, atau error..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="Cari panduan"
            />
            <kbd className="rounded-lg bg-[#eef0eb] px-2 py-1 text-[9px]">
              ⌘K
            </kbd>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(({ id, Icon, title, count }) => (
              <button
                key={id}
                type="button"
                id={id}
                onClick={() => {
                  setActiveCategoryId(id);
                  setQuery(title);
                }}
                className="group hairline shadow-card rounded-[26px] border bg-white p-6 text-left transition hover:-translate-y-1"
              >
                <Icon className="size-5 text-[#315d47]" />
                <b className="mt-10 block text-sm">{title}</b>
                <span className="mt-2 flex items-center text-[9px] text-[#718078]">
                  {count}
                  <ArrowRight className="ml-auto size-3.5 transition group-hover:translate-x-1" />
                </span>
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="mt-8 text-center text-xs text-[#718078]">
              Tidak ada topik yang cocok. Coba kata kunci lain.
            </p>
          ) : null}
          <div className="mt-16 rounded-[30px] bg-[#173f2c] p-8 text-center text-white">
            <h2 className="font-display text-4xl">
              Belum menemukan jawabannya?
            </h2>
            <p className="mt-2 text-xs text-white/50">
              Tim creator success kami siap membantu.
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-flex rounded-full bg-[#d7ff64] px-5 py-3 text-[10px] font-extrabold text-[#173f2c]"
            >
              Hubungi support
            </Link>
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
