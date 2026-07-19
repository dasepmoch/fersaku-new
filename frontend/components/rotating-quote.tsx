"use client";

import { Quote, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const collections = {
  creator: [
    [
      "Karya yang baik pantas mendapatkan pengalaman membeli yang sama baiknya.",
      "Fersaku principle",
    ],
    [
      "Jangan biarkan kerumitan checkout mengecilkan keberanian untuk mulai menjual.",
      "Creator note",
    ],
    [
      "Produk digital bukan file. Ia adalah pengetahuan yang diberi bentuk.",
      "Fersaku Journal",
    ],
    [
      "Toko terbaik terasa seperti perpanjangan tangan dari pembuatnya.",
      "Design principle",
    ],
    [
      "Mulai kecil, kirim dengan baik, lalu dengarkan pembelimu.",
      "Creator playbook",
    ],
  ],
  buyer: [
    [
      "Sesuatu yang kamu beli seharusnya mudah ditemukan kembali.",
      "Buyer promise",
    ],
    [
      "Akses yang tenang adalah bagian dari produk yang baik.",
      "Fersaku principle",
    ],
    [
      "Koleksi digitalmu adalah perpustakaan, bukan tumpukan email.",
      "Buyer Portal",
    ],
    [
      "Kepercayaan tumbuh ketika setiap detail transaksi bisa dilihat dengan jelas.",
      "Commerce note",
    ],
  ],
  seller: [
    [
      "Angka menunjukkan apa yang terjadi. Percakapan menunjukkan mengapa.",
      "Seller insight",
    ],
    [
      "Stok yang rapi adalah janji bahwa setiap pembeli menerima miliknya.",
      "Inventory principle",
    ],
    ["Balasan yang tulus mengubah ulasan menjadi hubungan.", "Creator success"],
    [
      "Pertumbuhan yang sehat selalu meninggalkan jejak yang bisa diaudit.",
      "Operations note",
    ],
  ],
  admin: [
    [
      "Kontrol penuh berarti setiap tindakan kuat juga harus dapat dipertanggungjawabkan.",
      "Operations principle",
    ],
    [
      "Kecepatan tanpa audit adalah risiko. Audit tanpa konteks hanyalah kebisingan.",
      "Risk note",
    ],
    [
      "Sistem yang aman membuat tindakan benar menjadi mudah dan tindakan berbahaya menjadi jelas.",
      "Security principle",
    ],
    [
      "Impersonation adalah alat observasi, bukan pengganti identitas.",
      "Access policy",
    ],
  ],
};

export function RotatingQuote({
  surface = "creator",
  compact = false,
  className = "",
}: {
  surface?: keyof typeof collections;
  compact?: boolean;
  className?: string;
}) {
  const quotes = useMemo(() => collections[surface], [surface]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % quotes.length),
      6200,
    );
    return () => clearInterval(timer);
  }, [quotes.length]);
  const [quote, author] = quotes[index];
  const dark = surface === "admin";
  return (
    <div
      className={`${compact ? "rounded-2xl p-4" : "rounded-[30px] p-7 sm:p-9"} relative overflow-hidden border ${dark ? "border-[#28334e] bg-[#11182a] text-white" : "hairline bg-white"} ${className}`}
    >
      <div className="absolute -top-10 -right-8 size-32 rounded-full border border-current opacity-[.06]" />
      <div key={index} className="animate-rise flex items-start gap-4">
        <span
          className={`grid shrink-0 place-items-center rounded-xl ${compact ? "size-8" : "size-10"} ${dark ? "bg-[#202b48] text-[#809bff]" : "bg-[#d7ff64] text-[#173f2c]"}`}
        >
          <Quote className={compact ? "size-3.5" : "size-4"} />
        </span>
        <div>
          <p
            className={`${compact ? "text-[10px] leading-5" : "font-display text-2xl leading-tight sm:text-3xl"}`}
          >
            “{quote}”
          </p>
          <p
            className={`mt-2 flex items-center gap-1.5 text-[8px] font-extrabold tracking-[.12em] uppercase ${dark ? "text-[#8090b5]" : "text-[#718078]"}`}
          >
            <Sparkles className="size-3" />
            {author}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-1">
        {quotes.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Quote ${i + 1}`}
            className={`h-1 rounded-full transition-all ${i === index ? `w-5 ${dark ? "bg-[#809bff]" : "bg-[#173f2c]"}` : `w-1 ${dark ? "bg-white/20" : "bg-black/15"}`}`}
          />
        ))}
      </div>
    </div>
  );
}
