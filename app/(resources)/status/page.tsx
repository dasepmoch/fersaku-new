import { Activity, CheckCircle2, Clock3, Info } from "lucide-react";
import { ContentPage } from "@/components/content-page";
import {
  getPublicPlatformStatus,
  publicStatusBannerClasses,
  publicStatusDotClass,
  publicStatusLabelClass,
  PUBLIC_STATUS_REVALIDATE_SECONDS,
  type PublicPlatformStatusView,
} from "@/features/platform-status";

export const revalidate = PUBLIC_STATUS_REVALIDATE_SECONDS;

function BannerIcon({ kind }: { kind: PublicPlatformStatusView["overallKind"] }) {
  if (kind === "ok") {
    return <CheckCircle2 className="size-5" />;
  }
  return <Info className="size-5" />;
}

export default async function StatusPage() {
  const status = await getPublicPlatformStatus();
  const banner = publicStatusBannerClasses(status.overallKind);

  return (
    <ContentPage
      eyebrow="System status"
      title={
        <>
          Status platform <em className="text-[#315d47]">{status.heroEmphasis}</em>
        </>
      }
      description={status.description}
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[900px]">
          <div
            className={`flex items-center rounded-[26px] border ${banner.border} ${banner.bg} p-6`}
          >
            <span
              className={`grid size-12 place-items-center rounded-full ${banner.iconBg} ${banner.iconText}`}
            >
              <BannerIcon kind={status.overallKind} />
            </span>
            <div className="ml-4">
              <b className={`block text-sm ${banner.titleText}`}>
                {status.headline}
              </b>
              <span className={`mt-1 block text-[9px] ${banner.detailText}`}>
                {status.detail}
              </span>
            </div>
            <Activity className={`ml-auto size-5 ${banner.activityText}`} />
          </div>
          <div className="hairline shadow-card mt-5 overflow-hidden rounded-[26px] border bg-white">
            {status.services.map((s, i) => (
              <div
                key={s.name}
                className={`flex items-center px-5 py-4 text-xs ${i ? "hairline border-t" : ""}`}
              >
                <span
                  className={`size-2 rounded-full ${publicStatusDotClass(s.kind)}`}
                />
                <b className="ml-3">{s.name}</b>
                {s.secondary ? (
                  <span className="mr-7 ml-auto text-[9px] text-[#718078]">
                    {s.secondary}
                  </span>
                ) : (
                  <span className="mr-7 ml-auto text-[9px] text-[#718078]">
                    —
                  </span>
                )}
                <span
                  className={`text-[9px] font-extrabold ${publicStatusLabelClass(s.kind)}`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <h2 className="font-display mt-14 text-4xl">Incident history</h2>
          <div className="mt-5 grid gap-3">
            {status.incidents.length === 0 ? (
              <details className="hairline shadow-card rounded-2xl border bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center text-xs font-bold">
                  <Clock3 className="mr-3 size-4 text-[#718078]" />
                  No published incidents
                  <span className="ml-auto text-[9px] font-normal text-[#718078]">
                    —
                  </span>
                </summary>
                <p className="mt-4 pl-7 text-[10px] leading-5 text-[#718078]">
                  {status.incidentsEmptyLabel}
                </p>
              </details>
            ) : (
              status.incidents.map((x) => (
                <details
                  key={`${x.date}-${x.title}`}
                  className="hairline shadow-card rounded-2xl border bg-white p-5"
                >
                  <summary className="flex cursor-pointer list-none items-center text-xs font-bold">
                    <Clock3 className="mr-3 size-4 text-[#718078]" />
                    {x.title}
                    <span className="ml-auto text-[9px] font-normal text-[#718078]">
                      {x.date}
                    </span>
                  </summary>
                  <p className="mt-4 pl-7 text-[10px] leading-5 text-[#718078]">
                    {x.summary}
                  </p>
                </details>
              ))
            )}
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
