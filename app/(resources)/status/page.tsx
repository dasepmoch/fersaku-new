import { Activity, CheckCircle2, Clock3 } from "lucide-react";
import { ContentPage } from "@/components/content-page";

export default function StatusPage() {
  const services = [
    ["Web application", "Operational", "99.99%"],
    ["Hosted storefronts", "Operational", "100%"],
    ["QRIS payments", "Operational", "99.98%"],
    ["Seller withdrawals", "Operational", "99.96%"],
    ["Digital delivery", "Operational", "100%"],
    ["API & webhooks", "Operational", "99.97%"],
  ];
  return (
    <ContentPage
      eyebrow="System status"
      title={
        <>
          Semua sistem <em className="text-[#315d47]">operasional.</em>
        </>
      }
      description="Status real-time untuk aplikasi, payment provider, delivery, payout, dan developer infrastructure."
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[900px]">
          <div className="flex items-center rounded-[26px] border border-[#bfe0ca] bg-[#edf8f1] p-6">
            <span className="grid size-12 place-items-center rounded-full bg-[#d5f0df] text-[#277c4c]">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="ml-4">
              <b className="block text-sm text-[#275f40]">
                All systems operational
              </b>
              <span className="mt-1 block text-[9px] text-[#668172]">
                Last checked less than a minute ago
              </span>
            </div>
            <Activity className="ml-auto size-5 text-[#2f9a5c]" />
          </div>
          <div className="hairline shadow-card mt-5 overflow-hidden rounded-[26px] border bg-white">
            {services.map((s, i) => (
              <div
                key={s[0]}
                className={`flex items-center px-5 py-4 text-xs ${i ? "hairline border-t" : ""}`}
              >
                <span className="size-2 rounded-full bg-[#35a765]" />
                <b className="ml-3">{s[0]}</b>
                <span className="mr-7 ml-auto text-[9px] text-[#718078]">
                  {s[2]} uptime
                </span>
                <span className="text-[9px] font-extrabold text-[#2b7b4d]">
                  {s[1]}
                </span>
              </div>
            ))}
          </div>
          <h2 className="font-display mt-14 text-4xl">Incident history</h2>
          <div className="mt-5 grid gap-3">
            {[
              [
                "10 Jul 2026",
                "Delayed seller webhook deliveries",
                "Resolved in 18 minutes",
              ],
              [
                "28 Jun 2026",
                "Xendit sandbox latency increase",
                "Resolved in 11 minutes",
              ],
              [
                "4 Jun 2026",
                "Dashboard analytics delayed",
                "Resolved in 24 minutes",
              ],
            ].map((x) => (
              <details
                key={x[0]}
                className="hairline shadow-card rounded-2xl border bg-white p-5"
              >
                <summary className="flex cursor-pointer list-none items-center text-xs font-bold">
                  <Clock3 className="mr-3 size-4 text-[#718078]" />
                  {x[1]}
                  <span className="ml-auto text-[9px] font-normal text-[#718078]">
                    {x[0]}
                  </span>
                </summary>
                <p className="mt-4 pl-7 text-[10px] leading-5 text-[#718078]">
                  {x[2]}. No data loss or duplicate payment fulfillment
                  occurred.
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
