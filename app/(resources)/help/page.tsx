import Link from "next/link";
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

export default function HelpPage() {
  const cats = [
    [Store, "Memulai toko", "7 artikel"],
    [Package, "Produk & delivery", "12 artikel"],
    [CreditCard, "QRIS & pesanan", "9 artikel"],
    [WalletCards, "Saldo & penarikan", "8 artikel"],
    [Code2, "API & webhook", "14 artikel"],
    [BookOpen, "Akun & keamanan", "6 artikel"],
  ];
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
              placeholder="Cari panduan, topik, atau error..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <kbd className="rounded-lg bg-[#eef0eb] px-2 py-1 text-[9px]">
              ⌘K
            </kbd>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map(([Icon, t, n]) => (
              <button
                key={t as string}
                className="group hairline shadow-card rounded-[26px] border bg-white p-6 text-left transition hover:-translate-y-1"
              >
                <Icon className="size-5 text-[#315d47]" />
                <b className="mt-10 block text-sm">{t as string}</b>
                <span className="mt-2 flex items-center text-[9px] text-[#718078]">
                  {n as string}
                  <ArrowRight className="ml-auto size-3.5 transition group-hover:translate-x-1" />
                </span>
              </button>
            ))}
          </div>
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
