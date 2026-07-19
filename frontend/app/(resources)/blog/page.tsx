import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { ContentPage } from "@/components/content-page";
import { posts } from "@/lib/content-data";
export default function BlogPage() {
  return (
    <ContentPage
      eyebrow="Fersaku Journal"
      title={
        <>
          Ide untuk menjual dengan{" "}
          <em className="text-[#315d47]">lebih baik.</em>
        </>
      }
      description="Tulisan tentang product craft, creator economy, pembayaran Indonesia, dan membangun bisnis digital yang sehat."
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[1180px]">
          <Link
            href={`/blog/${posts[0].slug}`}
            className="group hairline shadow-card grid overflow-hidden rounded-[34px] border bg-white lg:grid-cols-2"
          >
            <div
              className="noise min-h-[320px] p-8"
              style={{ backgroundColor: posts[0].color }}
            >
              <span className="text-[10px] font-extrabold tracking-[.15em] uppercase">
                Featured story
              </span>
              <span className="font-display mt-40 block text-7xl">QR.</span>
            </div>
            <div className="flex flex-col p-8 sm:p-12">
              <span className="text-[10px] font-extrabold tracking-wider text-[#315d47] uppercase">
                {posts[0].category}
              </span>
              <h2 className="font-display mt-7 text-5xl leading-[.98]">
                {posts[0].title}
              </h2>
              <p className="mt-5 text-xs leading-6 text-[#718078]">
                Prinsip, eksperimen, dan detail kecil yang membuat pembayaran
                terasa singkat dan meyakinkan.
              </p>
              <div className="mt-auto flex items-center pt-10 text-[10px] font-bold text-[#718078]">
                <Clock3 className="mr-2 size-3.5" />
                {posts[0].read}
                <ArrowUpRight className="ml-auto size-4 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
              </div>
            </div>
          </Link>
          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.slice(1).map((p, i) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group hairline shadow-card rounded-[28px] border bg-white p-3 transition hover:-translate-y-1"
              >
                <div
                  className="noise aspect-[1.5] rounded-[20px] p-5"
                  style={{ backgroundColor: p.color }}
                >
                  <span className="font-display text-5xl">0{i + 2}</span>
                </div>
                <div className="p-3 pb-4">
                  <span className="text-[9px] font-extrabold tracking-wider text-[#315d47] uppercase">
                    {p.category}
                  </span>
                  <h3 className="mt-3 text-sm leading-5 font-extrabold">
                    {p.title}
                  </h3>
                  <p className="mt-4 text-[9px] text-[#7a867f]">
                    {p.date} • {p.read}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
