"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Globe2,
  MousePointerClick,
  ShoppingBag,
  Target,
  TrendingUp,
} from "lucide-react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const sources = [
  {
    source: "twitter.com",
    channel: "Social",
    clicks: 2842,
    sales: 126,
    revenue: "Rp9,95jt",
    campaign: "launch_july",
    color: "#1d9bf0",
  },
  {
    source: "instagram.com",
    channel: "Social",
    clicks: 2314,
    sales: 118,
    revenue: "Rp9,32jt",
    campaign: "reels_prompt",
    color: "#ef5b7d",
  },
  {
    source: "youtube.com",
    channel: "Video",
    clicks: 1426,
    sales: 94,
    revenue: "Rp7,43jt",
    campaign: "tutorial_ai",
    color: "#f05245",
  },
  {
    source: "google.com",
    channel: "Organic",
    clicks: 1103,
    sales: 76,
    revenue: "Rp6,00jt",
    campaign: "organic",
    color: "#4f7df3",
  },
  {
    source: "Direct / none",
    channel: "Direct",
    clicks: 914,
    sales: 61,
    revenue: "Rp4,82jt",
    campaign: "none",
    color: "#6d7a72",
  },
  {
    source: "newsletter.asep.ai",
    channel: "Email",
    clicks: 642,
    sales: 58,
    revenue: "Rp4,58jt",
    campaign: "weekly_28",
    color: "#d79032",
  },
  {
    source: "tiktok.com",
    channel: "Social",
    clicks: 1880,
    sales: 72,
    revenue: "Rp5,68jt",
    campaign: "tiktok_creator",
    color: "#111111",
  },
  {
    source: "linkedin.com",
    channel: "Social",
    clicks: 520,
    sales: 31,
    revenue: "Rp2,45jt",
    campaign: "b2b_launch",
    color: "#0a66c2",
  },
  {
    source: "threads.net",
    channel: "Social",
    clicks: 410,
    sales: 22,
    revenue: "Rp1,74jt",
    campaign: "threads_drop",
    color: "#2a2a2a",
  },
  {
    source: "facebook.com",
    channel: "Social",
    clicks: 980,
    sales: 44,
    revenue: "Rp3,48jt",
    campaign: "fb_ads_soft",
    color: "#1877f2",
  },
  {
    source: "producthunt.com",
    channel: "Organic",
    clicks: 360,
    sales: 29,
    revenue: "Rp2,29jt",
    campaign: "ph_launch",
    color: "#da552f",
  },
  {
    source: "discord.gg",
    channel: "Community",
    clicks: 290,
    sales: 18,
    revenue: "Rp1,42jt",
    campaign: "community_drop",
    color: "#5865f2",
  },
];

export function TrafficAnalytics() {
  const [range, setRange] = useState("30 hari");
  const [channel, setChannel] = useState("Semua channel");
  const filtered = useMemo(
    () =>
      sources.filter(
        (item) => channel === "Semua channel" || item.channel === channel,
      ),
    [channel],
  );
  const { pageRows, pagination } = useClientPagination(filtered);

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
            onChange={(event) => setChannel(event.target.value)}
            className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-bold"
          >
            {[
              "Semua channel",
              "Social",
              "Video",
              "Organic",
              "Direct",
              "Email",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Rentang traffic"
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="hairline h-10 rounded-xl border bg-white px-3 text-[9px] font-bold"
          >
            <option>7 hari</option>
            <option>30 hari</option>
            <option>90 hari</option>
          </select>
        </div>
      </div>

      <div className="grid gap-px bg-[#e4e8e2] sm:grid-cols-4">
        <TrafficMetric
          icon={MousePointerClick}
          label="Attributed clicks"
          value="9.762"
          note={`+21,8% - ${range}`}
        />
        <TrafficMetric
          icon={ShoppingBag}
          label="Attributed sales"
          value="576"
          note="5,90% blended CVR"
        />
        <TrafficMetric
          icon={TrendingUp}
          label="Attributed revenue"
          value="Rp45,49jt"
          note="92% revenue covered"
        />
        <TrafficMetric
          icon={Target}
          label="Best campaign"
          value="tutorial_ai"
          note="YouTube - 6,59% CVR"
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
            {pageRows.map((item) => {
              const conversion = ((item.sales / item.clicks) * 100).toFixed(2);
              return (
                <tr key={item.source} className="hairline border-t text-[10px]">
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
                      className="hairline grid size-8 place-items-center rounded-lg border bg-white"
                      aria-label={`Lihat detail ${item.source}`}
                    >
                      <ArrowUpRight className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
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
