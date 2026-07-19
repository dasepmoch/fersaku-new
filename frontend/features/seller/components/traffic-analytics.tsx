"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Globe2,
  MousePointerClick,
  ShoppingBag,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  formatAttributedClicksNote,
  formatBlendedCvrNote,
  formatCountId,
  type TrafficChannelLabel,
  type TrafficRangeLabel,
} from "@/features/seller/analytics";
import { useSellerAnalyticsTraffic } from "@/features/seller/analytics/hooks";
import { isDomainMock } from "@/shared/data/domain-source";
import { compactRupiah } from "@/shared/format/money";
import { useSellerStoreId } from "@/shared/seller/current-store";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const CHANNEL_OPTIONS: TrafficChannelLabel[] = [
  "Semua channel",
  "Social",
  "Video",
  "Organic",
  "Direct",
  "Email",
];

const RANGE_OPTIONS: TrafficRangeLabel[] = ["7 hari", "30 hari", "90 hari"];

export function TrafficAnalytics() {
  const storeId = useSellerStoreId();
  const [range, setRange] = useState<TrafficRangeLabel>("30 hari");
  const [channel, setChannel] = useState<TrafficChannelLabel>("Semua channel");

  const trafficQuery = useSellerAnalyticsTraffic(storeId, range, channel);
  const traffic = trafficQuery.data;
  const failed = trafficQuery.isError && !traffic;
  const mockMode = isDomainMock("sellerOperations");

  // Video has no wire channel: filter client-side for Video label presentation.
  const rows =
    channel === "Video" && traffic
      ? traffic.rows.filter((item) => item.channelLabel === "Video")
      : (traffic?.rows ?? []);

  const metrics = traffic?.metrics;
  const { pageRows, pagination } = useClientPagination(rows);

  const clicksNote = failed
    ? "Gagal memuat"
    : mockMode
      ? formatAttributedClicksNote(range, "+21,8%")
      : formatAttributedClicksNote(range);
  const salesNote = failed
    ? "Gagal memuat"
    : metrics
      ? formatBlendedCvrNote(metrics.blendedCvrPercent)
      : "—";
  const revenueNote = failed
    ? "Gagal memuat"
    : mockMode
      ? "92% revenue covered"
      : range;
  const campaignNote = failed
    ? "Gagal memuat"
    : metrics
      ? metrics.bestCampaignNote
      : "—";

  return (
    <section className="hairline shadow-card mt-4 overflow-hidden rounded-[22px] border bg-[#fbfaf7]">
      <div className="hairline flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-[#e8f2df] text-[#315f46]">
            <BarChart3 className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold">Sumber Trafik Terbaik</h2>
            <p className="mt-1 text-[10px] text-[#7b8780]">
              Atribusi referrer dan UTM hingga penjualan terbayar.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Filter channel traffic"
            value={channel}
            onChange={(event) =>
              setChannel(event.target.value as TrafficChannelLabel)
            }
            className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-bold"
          >
            {CHANNEL_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            aria-label="Rentang traffic"
            value={range}
            onChange={(event) =>
              setRange(event.target.value as TrafficRangeLabel)
            }
            className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-bold"
          >
            {RANGE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-px bg-[#e4e8e2] sm:grid-cols-4">
        <TrafficMetric
          icon={MousePointerClick}
          label="Attributed clicks"
          value={
            failed
              ? "—"
              : metrics
                ? formatCountId(metrics.attributedClicks)
                : "—"
          }
          note={clicksNote}
        />
        <TrafficMetric
          icon={ShoppingBag}
          label="Attributed sales"
          value={
            failed
              ? "—"
              : metrics
                ? formatCountId(metrics.attributedSales)
                : "—"
          }
          note={salesNote}
        />
        <TrafficMetric
          icon={TrendingUp}
          label="Attributed revenue"
          value={
            failed
              ? "—"
              : metrics
                ? compactRupiah(metrics.attributedRevenueIdr)
                : "—"
          }
          note={revenueNote}
        />
        <TrafficMetric
          icon={Target}
          label="Best campaign"
          value={failed ? "—" : metrics ? metrics.bestCampaign : "—"}
          note={campaignNote}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="bg-[#f3f4ef] text-[9px] tracking-wider text-[#7f8a83] uppercase">
              <th className="px-5 py-3">Referrer</th>
              <th>Channel</th>
              <th>UTM campaign</th>
              <th>Clicks</th>
              <th>Penjualan</th>
              <th>Conversion</th>
              <th>Revenue</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {failed ? (
              <tr className="hairline border-t text-[10px]">
                <td className="px-5 py-6 text-[#7b8780]" colSpan={8}>
                  Gagal memuat data trafik
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr className="hairline border-t text-[10px]">
                <td className="px-5 py-6 text-[#7b8780]" colSpan={8}>
                  Belum ada data trafik
                </td>
              </tr>
            ) : (
              pageRows.map((item) => {
                const conversion =
                  item.clicks > 0
                    ? ((item.sales / item.clicks) * 100).toFixed(2)
                    : "0.00";
                return (
                  <tr key={item.key} className="hairline border-t text-[10px]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid size-9 place-items-center rounded-xl"
                          style={{
                            backgroundColor: `${item.color}18`,
                            color: item.color,
                          }}
                        >
                          <Globe2 className="size-4" />
                        </span>
                        <b>{item.source}</b>
                      </div>
                    </td>
                    <td>
                      <span className="rounded-full bg-[#edf0ea] px-2 py-1 text-[8px] font-extrabold text-[#607067]">
                        {item.channel}
                      </span>
                    </td>
                    <td>
                      <code className="rounded-lg bg-[#f1f2ee] px-2 py-1 text-[8px]">
                        utm_campaign={item.campaign}
                      </code>
                    </td>
                    <td className="font-bold">
                      {item.clicks.toLocaleString("id-ID")}
                    </td>
                    <td className="font-bold">{item.sales}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#e8ebe6]">
                          <div
                            className="h-full rounded-full bg-[#4b7b5d]"
                            style={{
                              width: `${Math.min(Number(conversion) * 10, 100)}%`,
                            }}
                          />
                        </div>
                        <b>{conversion}%</b>
                      </div>
                    </td>
                    <td className="font-extrabold">{item.revenue}</td>
                    <td>
                      <button
                        type="button"
                        disabled
                        className="hairline grid size-8 place-items-center rounded-lg border bg-white opacity-50"
                        aria-label={`Detail ${item.source} tidak tersedia`}
                        title="Detail tidak tersedia"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TablePagination {...pagination} />
      <div className="hairline border-t bg-[#f6f7f2] px-5 py-4 text-[8px] leading-4 text-[#76827a]">
        Model atribusi: last non-direct click, jendela 30 hari. UTM source,
        medium, campaign, content, dan landing URL disimpan per checkout
        session.
      </div>
    </section>
  );
}

function TrafficMetric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-[#fbfaf7] p-5">
      <Icon className="size-4 text-[#4e725d]" />
      <p className="mt-4 text-[8px] font-extrabold tracking-[.12em] text-[#7b8780] uppercase">
        {label}
      </p>
      <b className="mt-1 block text-lg tracking-[-.03em]">{value}</b>
      <span className="mt-1 block text-[8px] text-[#6d7972]">{note}</span>
    </div>
  );
}
