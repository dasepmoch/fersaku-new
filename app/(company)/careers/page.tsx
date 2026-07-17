import { ArrowUpRight, Briefcase, MapPin } from "lucide-react";
import { ContentPage } from "@/components/content-page";

/** PUB-230: static careers listing; role CTAs are real mailto apply links. */
const CAREERS_APPLY_MAIL = "careers@fersaku.id";

const roles = [
  ["Senior Product Designer", "Product", "Jakarta / Remote"],
  ["Frontend Engineer", "Engineering", "Indonesia / Remote"],
  ["Risk Operations Lead", "Operations", "Jakarta"],
  ["Creator Success Manager", "Customer", "Bandung / Remote"],
] as const;

export default function CareersPage() {
  return (
    <ContentPage
      eyebrow="Careers"
      title={
        <>
          Kerja bagus. Dampak <em className="text-[#315d47]">besar.</em>
        </>
      }
      description="Bergabung dengan tim kecil yang membangun cara baru kreator Indonesia mendapatkan penghasilan."
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[960px]">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Remote-friendly", "Fokus pada output, bukan kursi."],
              ["Deep craft", "Kami peduli pada detail kecil."],
              ["Meaningful equity", "Bangun dan miliki bersama."],
            ].map((x) => (
              <div
                key={x[0]}
                className="hairline shadow-card rounded-[26px] border bg-white p-6"
              >
                <b className="text-sm">{x[0]}</b>
                <p className="mt-2 text-xs leading-5 text-[#718078]">{x[1]}</p>
              </div>
            ))}
          </div>
          <h2 className="font-display mt-16 text-5xl">Posisi terbuka</h2>
          <div className="mt-7 grid gap-3">
            {roles.map((r) => {
              const subject = encodeURIComponent(`Application: ${r[0]}`);
              const href = `mailto:${CAREERS_APPLY_MAIL}?subject=${subject}`;
              return (
                <a
                  key={r[0]}
                  href={href}
                  className="group hairline shadow-card flex items-center rounded-2xl border bg-white p-5 text-left transition hover:-translate-y-0.5"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-[#e9ff9b]">
                    <Briefcase className="size-4" />
                  </span>
                  <div className="ml-4">
                    <b className="block text-sm">{r[0]}</b>
                    <span className="mt-1 flex items-center gap-1 text-[9px] text-[#718078]">
                      <MapPin className="size-3" />
                      {r[1]} • {r[2]}
                    </span>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
