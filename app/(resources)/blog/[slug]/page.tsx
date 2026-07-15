import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { Footer } from "@/components/footer";
import { PublicNav } from "@/components/public-nav";
import { posts } from "@/lib/content-data";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) notFound();
  return (
    <main className="min-h-screen bg-[#f8f7f2]">
      <PublicNav />
      <article className="px-5 pt-12 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[860px]">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-[10px] font-extrabold text-[#65736b]"
          >
            <ArrowLeft className="size-3.5" /> Semua artikel
          </Link>
          <div className="mt-10 text-center">
            <span className="text-[10px] font-extrabold tracking-[.15em] text-[#315d47] uppercase">
              {post.category}
            </span>
            <h1 className="font-display mt-6 text-6xl leading-[.92] tracking-[-.04em] sm:text-8xl">
              {post.title}
            </h1>
            <p className="mt-6 flex items-center justify-center gap-2 text-[10px] text-[#718078]">
              <Clock3 className="size-3.5" />
              {post.date} • {post.read}
            </p>
          </div>
          <div
            className="noise mt-12 aspect-[2/1] rounded-[32px] p-8"
            style={{ backgroundColor: post.color }}
          >
            <span className="font-display text-8xl">F.</span>
          </div>
          <div className="prose-fersaku mx-auto mt-12 max-w-[700px]">
            <p>
              Checkout yang baik tidak meminta pembeli berpikir terlalu banyak.
              Ia menghapus pilihan yang tidak relevan, menjelaskan langkah
              berikutnya, dan memberi kepastian bahwa transaksi berjalan aman.
            </p>
            <h2>Mulai dari satu tujuan</h2>
            <p>
              Setiap elemen pada halaman pembayaran harus membantu pembeli
              menyelesaikan transaksi. Nama produk, jumlah yang harus dibayar,
              QR code, waktu kedaluwarsa, dan status pembayaran harus memiliki
              hierarki yang jelas.
            </p>
            <h2>QRIS mengubah pola checkout</h2>
            <p>
              Karena pembeli perlu berpindah ke aplikasi pembayaran, desain
              harus mengantisipasi konteks mobile, instruksi scan, dan polling
              status tanpa membuat pengguna menekan tombol berulang kali.
            </p>
            <h3>Detail yang membangun rasa aman</h3>
            <ul>
              <li>Tampilkan nama seller dan produk dengan jelas.</li>
              <li>Jelaskan aplikasi apa saja yang mendukung QRIS.</li>
              <li>Perlihatkan countdown tanpa menciptakan kepanikan.</li>
              <li>Konfirmasi pembayaran secara otomatis.</li>
            </ul>
            <h2>Kecepatan adalah bagian dari desain</h2>
            <p>
              Latency provider, webhook, dan delivery ikut menentukan
              pengalaman. UI terbaik tetap terasa buruk ketika status terlambat
              atau produk tidak segera terkirim.
            </p>
          </div>
        </div>
      </article>
      <Footer />
    </main>
  );
}
