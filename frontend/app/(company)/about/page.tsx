import Link from "next/link";
import { ArrowRight, Heart, MapPin, Sparkles, Users } from "lucide-react";
import { ContentPage } from "@/components/content-page";

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="Tentang Fersaku"
      title={
        <>
          Commerce yang terasa <em className="text-[#315d47]">manusiawi.</em>
        </>
      }
      description="Kami membangun infrastruktur jualan digital yang indah, lokal, dan mudah diakses oleh kreator Indonesia."
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <article className="noise rounded-[36px] bg-[#173f2c] p-8 text-white sm:p-12 lg:p-16">
              <Sparkles className="size-6 text-[#d7ff64]" />
              <h2 className="font-display mt-16 max-w-2xl text-5xl leading-[.95] sm:text-7xl">
                Kreator seharusnya fokus membuat karya, bukan merakit checkout.
              </h2>
              <p className="mt-7 max-w-xl text-sm leading-7 text-white/55">
                Fersaku lahir dari keyakinan sederhana: menjual produk digital
                di Indonesia harus semudah membagikan sebuah link.
              </p>
            </article>
            <div className="grid gap-5">
              <article className="rounded-[30px] bg-[#d7ff64] p-7">
                <MapPin className="size-5" />
                <b className="mt-12 block text-3xl">Indonesia-first</b>
                <p className="mt-3 text-xs leading-6 text-[#53643f]">
                  QRIS, Rupiah, bank lokal, dan bahasa yang akrab sejak hari
                  pertama.
                </p>
              </article>
              <article className="rounded-[30px] bg-[#ffb69d] p-7">
                <Heart className="size-5" />
                <b className="mt-12 block text-3xl">Creator-obsessed</b>
                <p className="mt-3 text-xs leading-6 text-[#694b40]">
                  Setiap detail dinilai dari dampaknya terhadap kreator dan
                  pembelinya.
                </p>
              </article>
            </div>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {[
              ["2026", "Fersaku dimulai"],
              ["1.284", "Toko mock aktif"],
              ["34", "Kota kreator"],
            ].map((x) => (
              <div
                key={x[0]}
                className="hairline shadow-card rounded-[26px] border bg-white p-7"
              >
                <b className="font-display text-5xl">{x[0]}</b>
                <p className="mt-2 text-xs text-[#718078]">{x[1]}</p>
              </div>
            ))}
          </div>
          <div className="mt-20 text-center">
            <Users className="mx-auto size-6" />
            <h2 className="font-display mt-5 text-5xl">Bangun bersama kami.</h2>
            <p className="mt-3 text-sm text-[#718078]">
              Kami mencari orang-orang yang peduli pada craft dan dampak.
            </p>
            <Link
              href="/careers"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#173f2c] px-6 py-3 text-xs font-extrabold text-white"
            >
              Lihat posisi terbuka <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
