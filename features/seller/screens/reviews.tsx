"use client";

import { CheckCircle2, Filter, Search, Star } from "lucide-react";
import { useState } from "react";
import { ratingSummary, reviews } from "@/lib/reviews-mock-data";

const card = "rounded-[22px] border hairline bg-[#fbfaf7] shadow-card";
function SellerReviews() {
  const [items, setItems] = useState(
    reviews.filter((review) => review.seller === "Asep AI Tools"),
  );
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const saveReply = (id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, sellerReply: reply } : item,
      ),
    );
    setReplying(null);
    setReply("");
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat
          label="Rating rata-rata"
          value={String(ratingSummary.average)}
          note={`${ratingSummary.total} ulasan`}
        />
        <MiniStat label="5 bintang" value="82,8%" note="154 pembeli" />
        <MiniStat
          label="Menunggu balasan"
          value={String(items.filter((i) => !i.sellerReply).length)}
          note="Respons meningkatkan trust"
        />
        <MiniStat
          label="Verified purchase"
          value="100%"
          note="Tidak ada ulasan tamu"
        />
      </div>
      <section className={`${card} mt-4 overflow-hidden`}>
        <div className="hairline flex flex-col gap-3 border-b p-4 sm:flex-row">
          <SearchBox placeholder="Cari ulasan atau pembeli..." />
          <div className="flex gap-2 sm:ml-auto">
            <FilterButton />
            <select className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-bold">
              <option>Semua rating</option>
              <option>5 bintang</option>
              <option>4 bintang</option>
              <option>3 atau kurang</option>
            </select>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl bg-[#173f2c] p-6 text-white">
            <p className="text-[8px] font-bold tracking-wider text-white/45 uppercase">
              Rating tokomu
            </p>
            <div className="mt-4 flex items-end gap-3">
              <b className="font-display text-6xl">4.8</b>
              <div className="pb-2">
                <div className="flex text-[#ffe69a]">
                  {[1, 2, 3, 4, 5].map((x) => (
                    <Star key={x} className="size-3.5 fill-current" />
                  ))}
                </div>
                <span className="mt-1 block text-[8px] text-white/45">
                  186 verified reviews
                </span>
              </div>
            </div>
            <div className="mt-6 grid gap-2">
              {[5, 4, 3, 2, 1].map((score) => (
                <div key={score} className="flex items-center gap-2 text-[8px]">
                  <span>{score}</span>
                  <div className="h-1 flex-1 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#d7ff64]"
                      style={{
                        width: `${(ratingSummary.distribution[score as keyof typeof ratingSummary.distribution] / ratingSummary.total) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-white/45">
                    {
                      ratingSummary.distribution[
                        score as keyof typeof ratingSummary.distribution
                      ]
                    }
                  </span>
                </div>
              ))}
            </div>
          </aside>
          <div className="grid gap-3">
            {items.map((review) => (
              <article
                key={review.id}
                className="hairline rounded-2xl border bg-white p-5"
              >
                <div className="flex items-start">
                  <span className="grid size-9 place-items-center rounded-full bg-[#e8ebe4] text-[8px] font-black">
                    {review.initials}
                  </span>
                  <div className="ml-3">
                    <div className="flex items-center gap-2">
                      <b className="text-[9px]">{review.buyer}</b>
                      <CheckCircle2 className="size-3 text-[#2e714f]" />
                    </div>
                    <div className="mt-1 flex text-[#e8a72e]">
                      {[1, 2, 3, 4, 5].map((x) => (
                        <Star
                          key={x}
                          className={`size-3 ${x <= review.rating ? "fill-current" : "opacity-20"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="ml-auto text-[8px] text-[#718078]">
                    {review.createdAt}
                  </span>
                </div>
                <h3 className="mt-4 text-[11px] font-extrabold">
                  {review.title}
                </h3>
                <p className="mt-2 text-[9px] leading-5 text-[#718078]">
                  {review.body}
                </p>
                {review.sellerReply && (
                  <div className="mt-4 rounded-xl bg-[#eef3e9] p-3">
                    <b className="text-[8px] text-[#315d47]">Balasanmu</b>
                    <p className="mt-1 text-[8px] leading-4 text-[#65736b]">
                      {review.sellerReply}
                    </p>
                  </div>
                )}
                {replying === review.id ? (
                  <div className="mt-4">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      placeholder="Tulis balasan publik..."
                      className="hairline w-full resize-none rounded-xl border p-3 text-[9px] outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => setReplying(null)}
                        className="hairline rounded-lg border px-3 py-2 text-[8px] font-bold"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => saveReply(review.id)}
                        className="rounded-lg bg-[#173f2c] px-3 py-2 text-[8px] font-extrabold text-white"
                      >
                        Publikasikan balasan
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setReplying(review.id)}
                      className="hairline rounded-lg border px-3 py-2 text-[8px] font-bold"
                    >
                      {review.sellerReply ? "Edit balasan" : "Balas ulasan"}
                    </button>
                    <button
                      onClick={() =>
                        setItems((current) =>
                          current.filter((item) => item.id !== review.id),
                        )
                      }
                      className="hairline rounded-lg border px-3 py-2 text-[8px] font-bold text-[#a44f3b]"
                    >
                      Laporkan ke admin
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="hairline flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border bg-white px-3 text-[10px] text-[#829087]">
      <Search className="size-3.5" />
      <input
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none"
      />
    </div>
  );
}
function FilterButton() {
  return (
    <button className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold">
      <Filter className="size-3.5" /> Filter
    </button>
  );
}
function MiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-[9px] font-extrabold tracking-wider text-[#7d8982] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-[9px] text-[#7d8982]">{note}</p>
    </div>
  );
}

export { SellerReviews as SellerReviewsScreen };
