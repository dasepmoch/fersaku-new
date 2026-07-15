import { Check, Sparkles, Zap } from "lucide-react";
import { ContentPage } from "@/components/content-page";

const changes = [
  {
    date: "12 Jul 2026",
    version: "0.9.0",
    title: "Fersaku Control & permission roles",
    tag: "Major",
    items: [
      "Dedicated platform operations console",
      "Custom staff roles and permission matrix",
      "Withdrawal review and risk investigation flows",
      "Global light and dark appearance modes",
    ],
  },
  {
    date: "5 Jul 2026",
    version: "0.8.2",
    title: "Storefront customization",
    tag: "Improvement",
    items: [
      "New storefront preview",
      "Accent color controls",
      "Improved mobile product grid",
    ],
  },
  {
    date: "28 Jun 2026",
    version: "0.8.0",
    title: "Developer API experience",
    tag: "Major",
    items: [
      "QRIS payment reference",
      "Webhook delivery monitor",
      "Test and live API key states",
    ],
  },
];
export default function ChangelogPage() {
  return (
    <ContentPage
      eyebrow="Changelog"
      title={
        <>
          Fersaku terus menjadi <em className="text-[#315d47]">lebih baik.</em>
        </>
      }
      description="Fitur baru, perbaikan craft, dan perubahan penting pada platform."
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[820px]">
          {changes.map((c, i) => (
            <article
              key={c.version}
              className="relative grid gap-5 pb-14 sm:grid-cols-[140px_1fr]"
            >
              <div>
                <p className="text-[10px] font-extrabold text-[#315d47]">
                  {c.date}
                </p>
                <p className="mt-1 font-mono text-[9px] text-[#718078]">
                  v{c.version}
                </p>
              </div>
              <div className="hairline shadow-card rounded-[28px] border bg-white p-6 sm:p-8">
                <div className="flex items-center">
                  <span
                    className={`grid size-10 place-items-center rounded-xl ${i === 0 ? "bg-[#d7ff64]" : "bg-[#edf0e9]"}`}
                  >
                    {i === 0 ? (
                      <Sparkles className="size-4" />
                    ) : (
                      <Zap className="size-4" />
                    )}
                  </span>
                  <span className="ml-auto rounded-full bg-[#eef1e9] px-3 py-1.5 text-[8px] font-extrabold">
                    {c.tag}
                  </span>
                </div>
                <h2 className="font-display mt-7 text-4xl">{c.title}</h2>
                <div className="mt-5 grid gap-3">
                  {c.items.map((x) => (
                    <div key={x} className="flex items-center gap-3 text-xs">
                      <span className="grid size-5 place-items-center rounded-full bg-[#e9f5e7] text-[#2e714f]">
                        <Check className="size-3" />
                      </span>
                      {x}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </ContentPage>
  );
}
