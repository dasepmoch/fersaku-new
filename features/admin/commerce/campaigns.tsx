"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  Eye,
  Mail,
  Megaphone,
  Plus,
  RefreshCcw,
  Send,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
type Campaign = {
  id: string;
  title: string;
  audience: string;
  channels: string[];
  status: string;
  sent: string;
  openRate: string;
  created: string;
};
const campaignSeed: Campaign[] = [
  {
    id: "CMP-240712",
    title: "Duitku maintenance terjadwal",
    audience: "Semua Seller",
    channels: ["In-App", "Email"],
    status: "Live",
    sent: "1.284",
    openRate: "92,4%",
    created: "12 Jul, 14:20",
  },
  {
    id: "CMP-240705",
    title: "Panduan optimasi conversion storefront",
    audience: "Seller Aktif",
    channels: ["Email"],
    status: "Completed",
    sent: "684",
    openRate: "68,1%",
    created: "5 Jul, 09:00",
  },
  {
    id: "CMP-240701",
    title: "Pembaruan Ketentuan Layanan Juli 2026",
    audience: "Semua Seller",
    channels: ["Email", "In-App"],
    status: "Completed",
    sent: "1.271",
    openRate: "96,8%",
    created: "1 Jul, 08:00",
  },
  {
    id: "CMP-240628",
    title: "Tips frekuensi restock digital",
    audience: "Seller Aktif",
    channels: ["In-App"],
    status: "Completed",
    sent: "512",
    openRate: "74,2%",
    created: "28 Jun, 11:00",
  },
  {
    id: "CMP-240620",
    title: "QRIS fee update Juni 2026",
    audience: "Semua Seller",
    channels: ["Email"],
    status: "Completed",
    sent: "1.250",
    openRate: "88,0%",
    created: "20 Jun, 09:30",
  },
  {
    id: "CMP-240610",
    title: "Onboarding checklist seller baru",
    audience: "Seller Restricted",
    channels: ["Email", "In-App"],
    status: "Paused",
    sent: "96",
    openRate: "41,5%",
    created: "10 Jun, 16:00",
  },
];
export function CampaignsAnnouncements() {
  const [campaigns, setCampaigns] = useState(campaignSeed);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    null,
  );
  const [composer, setComposer] = useState(false);
  const [published, setPublished] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [healthRefreshed, setHealthRefreshed] = useState(false);
  const { pageRows, pagination } = useClientPagination(campaigns);
  const [audience, setAudience] = useState("Semua Seller");
  const [channels, setChannels] = useState(["Email", "In-App Banner"]);
  const [kind, setKind] = useState("warning");
  const [title, setTitle] = useState("Duitku sedang maintenance singkat");
  const [message, setMessage] = useState(
    "Pembayaran QRIS mungkin mengalami keterlambatan selama pemeliharaan. Transaksi yang sudah dibayar tetap aman dan akan direkonsiliasi otomatis.",
  );
  const [ctaLabel, setCtaLabel] = useState("Lihat status sistem");
  const [ctaUrl, setCtaUrl] = useState("/status");
  const [mandatory, setMandatory] = useState(false);

  const toggleChannel = (channel: string) => {
    setChannels((items) =>
      items.includes(channel)
        ? items.filter((item) => item !== channel)
        : [...items, channel],
    );
  };

  const publish = () => {
    const next: Campaign = {
      id: `CMP-${Date.now().toString().slice(-6)}`,
      title,
      audience,
      channels: channels.map((item) => item.replace(" Banner", "")),
      status: channels.includes("In-App Banner") ? "Live" : "Queued",
      sent: "0",
      openRate: "-",
      created: "Baru saja",
    };
    setCampaigns((items) => [next, ...items]);
    if (channels.includes("In-App Banner")) {
      localStorage.setItem(
        "fersaku-admin-announcement",
        JSON.stringify({
          title,
          message,
          ctaLabel,
          ctaUrl,
          kind,
          mandatory,
          createdAt: new Date().toISOString(),
        }),
      );
      window.dispatchEvent(new Event("fersaku-announcement-updated"));
    }
    setPublished(true);
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpsMetric
          icon={Megaphone}
          label="Active broadcasts"
          value="2"
          note="1 emergency, 1 compliance"
          tone="warning"
        />
        <OpsMetric
          icon={Mail}
          label="Emails this month"
          value="18.420"
          note="71,8% open rate"
        />
        <OpsMetric
          icon={BellRing}
          label="In-app delivered"
          value="12.480"
          note="94,2% open rate"
          tone="success"
        />
        <OpsMetric
          icon={Users}
          label="Reachable sellers"
          value="1.284"
          note="96 restricted accounts"
        />
      </div>

      <section className={`${panel} mt-4 overflow-hidden`}>
        <div className="relative overflow-hidden bg-[#11182a] p-6 text-white sm:p-7">
          <div className="absolute -top-24 -right-16 size-64 rounded-full bg-[#f1b84b]/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="grid size-14 place-items-center rounded-[18px] bg-[#f1b84b] text-[#392805]">
              <Megaphone className="size-7" />
            </span>
            <div>
              <p className="text-[8px] font-extrabold tracking-[.18em] text-[#f1c96f] uppercase">
                Seller communication control
              </p>
              <h2 className="mt-2 text-xl font-black">
                Campaigns & Announcements
              </h2>
              <p className="mt-2 max-w-2xl text-[9px] leading-5 text-white/50">
                Emergency notices, seller education, feature launches, and
                mandatory compliance updates across audited channels.
              </p>
            </div>
            <button
              onClick={() => {
                setComposer(true);
                setPublished(false);
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[8px] font-extrabold text-[#11182a] sm:ml-auto"
            >
              <Plus className="size-3.5" /> Create campaign
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#7c879d] uppercase">
              <tr>
                {[
                  "Campaign",
                  "Audience",
                  "Channels",
                  "Status",
                  "Recipients",
                  "Open/read",
                  "Created",
                  "",
                ].map((label) => (
                  <th key={label} className="px-5 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="border-t border-[#e8eaf0] text-[9px]"
                >
                  <td className="px-5 py-4">
                    <b className="block">{campaign.title}</b>
                    <span className="mt-1 block font-mono text-[7px] text-[#7c879d]">
                      {campaign.id}
                    </span>
                  </td>
                  <td>{campaign.audience}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {campaign.channels.map((channel) => (
                        <span
                          key={channel}
                          className="rounded-lg bg-[#eef1f6] px-2 py-1 text-[7px] font-bold"
                        >
                          {channel}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Status value={campaign.status} />
                  </td>
                  <td>{campaign.sent}</td>
                  <td>{campaign.openRate}</td>
                  <td>{campaign.created}</td>
                  <td>
                    <button
                      onClick={() => setSelectedCampaign(campaign)}
                      aria-label={`Inspect ${campaign.title}`}
                      className="grid size-8 place-items-center rounded-lg border border-[#dce1e9]"
                    >
                      <Eye className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>

      <section className={`${panel} mt-4 p-5`}>
        <div className="flex items-center">
          <div>
            <h3 className="text-xs font-black">Delivery health</h3>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              Channel provider and consent readiness.
            </p>
          </div>
          <button
            onClick={() => {
              setHealthRefreshed(true);
              setTimeout(() => setHealthRefreshed(false), 1800);
            }}
            className="ml-auto flex h-9 items-center gap-2 rounded-xl border border-[#dce1e9] px-3 text-[8px] font-extrabold"
          >
            {healthRefreshed ? (
              <Check className="size-3.5" />
            ) : (
              <RefreshCcw className="size-3.5" />
            )}{" "}
            {healthRefreshed ? "Health refreshed" : "Refresh health"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ChannelHealth
            icon={Mail}
            name="Transactional email"
            provider="Resend"
            status="Operational"
            note="HTML + text fallback"
          />
          <ChannelHealth
            icon={BellRing}
            name="In-app announcements"
            provider="Fersaku config"
            status="Operational"
            note="Instant seller dashboard delivery"
          />
        </div>
      </section>

      {composer && (
        <div className="fixed inset-0 z-[190] overflow-y-auto bg-[#080d1b]/75 p-4 backdrop-blur-sm">
          <div className="mx-auto my-6 grid w-full max-w-6xl gap-4 lg:grid-cols-[1fr_420px]">
            <section className="rounded-[26px] bg-white p-6 text-[#131827] shadow-2xl">
              <div className="flex items-start">
                <span className="grid size-11 place-items-center rounded-xl bg-[#fff2cf] text-[#a36c15]">
                  <Megaphone className="size-5" />
                </span>
                <div className="ml-3">
                  <p className="text-[7px] font-extrabold tracking-[.16em] text-[#7c879d] uppercase">
                    Campaign composer
                  </p>
                  <h2 className="mt-1 text-lg font-black">
                    Create seller announcement
                  </h2>
                </div>
                <button onClick={() => setComposer(false)} className="ml-auto">
                  <X className="size-4" />
                </button>
              </div>
              {published ? (
                <div className="mt-8 rounded-[24px] bg-[#e7f6ec] p-7 text-center text-[#238150]">
                  <CheckCircle2 className="mx-auto size-8" />
                  <h3 className="mt-4 text-lg font-black">
                    Campaign published and audited.
                  </h3>
                  <p className="mt-2 text-[9px] leading-5">
                    Channel jobs were queued. The in-app banner is now available
                    to targeted seller dashboards.
                  </p>
                  <button
                    onClick={() => setComposer(false)}
                    className="mt-5 h-10 rounded-xl bg-[#218a52] px-5 text-[8px] font-extrabold text-white"
                  >
                    Close composer
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Field label="Audience">
                      <select
                        value={audience}
                        onChange={(event) => setAudience(event.target.value)}
                        className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px]"
                      >
                        <option>Semua Seller</option>
                        <option>Seller Aktif - GMV &gt; Rp1 juta/bulan</option>
                        <option>Seller Restricted</option>
                        <option>QRIS API Applicants</option>
                      </select>
                    </Field>
                    <Field label="Banner priority">
                      <select
                        value={kind}
                        onChange={(event) => setKind(event.target.value)}
                        className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px]"
                      >
                        <option value="info">Information - blue</option>
                        <option value="warning">Maintenance - yellow</option>
                        <option value="critical">Emergency - red</option>
                        <option value="compliance">Compliance - navy</option>
                      </select>
                    </Field>
                  </div>
                  <div className="mt-5">
                    <p className="text-[8px] font-extrabold">
                      Delivery channels
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {[
                        ["Email", Mail],
                        ["In-App Banner", BellRing],
                      ].map(([channel, Icon]) => (
                        <button
                          key={channel as string}
                          onClick={() => toggleChannel(channel as string)}
                          className={cn(
                            "flex h-11 items-center gap-2 rounded-xl border px-3 text-[8px] font-extrabold",
                            channels.includes(channel as string)
                              ? "border-[#5b7cfa] bg-[#eef2ff] text-[#536fdf]"
                              : "border-[#dce1e9]",
                          )}
                        >
                          <Icon className="size-4" />
                          {channel as string}
                          {channels.includes(channel as string) && (
                            <Check className="ml-auto size-3.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4">
                    <Field label="Title">
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px]"
                      />
                    </Field>
                    <Field label="Message - Markdown supported">
                      <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        rows={6}
                        className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] leading-5"
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="CTA label">
                        <input
                          value={ctaLabel}
                          onChange={(event) => setCtaLabel(event.target.value)}
                          className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px]"
                        />
                      </Field>
                      <Field label="CTA URL">
                        <input
                          value={ctaUrl}
                          onChange={(event) => setCtaUrl(event.target.value)}
                          className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[9px]"
                        />
                      </Field>
                    </div>
                  </div>
                  <label className="mt-5 flex gap-3 rounded-xl bg-[#f5f6f9] p-4 text-[8px] leading-4">
                    <input
                      type="checkbox"
                      checked={mandatory}
                      onChange={(event) => setMandatory(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Mandatory compliance acknowledgement. Banner cannot be
                      dismissed until the seller confirms it.
                    </span>
                  </label>
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => {
                        setTestSent(true);
                        setTimeout(() => setTestSent(false), 1800);
                      }}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] px-4 text-[8px] font-extrabold"
                    >
                      {testSent ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      {testSent ? "Test delivered" : "Send test to me"}
                    </button>
                    <button
                      disabled={
                        !title.trim() ||
                        !message.trim() ||
                        channels.length === 0
                      }
                      onClick={publish}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#11182a] px-5 text-[8px] font-extrabold text-white disabled:bg-[#aeb5c2] sm:ml-auto"
                    >
                      <Megaphone className="size-3.5" /> Publish campaign now
                    </button>
                  </div>
                </>
              )}
            </section>
            <aside className="rounded-[26px] bg-[#f3f5f9] p-5 text-[#131827] shadow-2xl">
              <p className="text-[7px] font-extrabold tracking-[.16em] text-[#7c879d] uppercase">
                Live preview
              </p>
              <h3 className="mt-2 text-sm font-black">
                Seller dashboard banner
              </h3>
              <AnnouncementPreview
                kind={kind}
                title={title}
                message={message}
                ctaLabel={ctaLabel}
              />
              <div className="mt-5 rounded-2xl border border-[#dfe3ec] bg-white p-5">
                <Mail className="size-5 text-[#5b7cfa]" />
                <p className="mt-4 text-[8px] font-extrabold text-[#7c879d] uppercase">
                  Email preview
                </p>
                <h4 className="mt-2 text-sm font-black">
                  {title || "Campaign title"}
                </h4>
                <p className="mt-3 text-[9px] leading-5 whitespace-pre-line text-[#667188]">
                  {message || "Message body"}
                </p>
                <button className="mt-4 h-9 rounded-xl bg-[#11182a] px-4 text-[8px] font-extrabold text-white">
                  {ctaLabel || "Open Fersaku"}
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}
      {selectedCampaign && (
        <OpsModal
          icon={Megaphone}
          eyebrow="Campaign delivery record"
          title={selectedCampaign.title}
          onClose={() => setSelectedCampaign(null)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Campaign ID", selectedCampaign.id],
              ["Audience", selectedCampaign.audience],
              ["Status", selectedCampaign.status],
              ["Recipients", selectedCampaign.sent],
              ["Open / read", selectedCampaign.openRate],
              ["Created", selectedCampaign.created],
            ].map(([label, value]) => (
              <DataFact key={label} label={label} value={value} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-[#f5f6f9] p-4">
            <p className="text-[8px] font-extrabold text-[#7c879d] uppercase">
              Delivery channels
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCampaign.channels.map((channel) => (
                <span
                  key={channel}
                  className="rounded-lg bg-[#edf1ff] px-3 py-2 text-[8px] font-extrabold text-[#536fdf]"
                >
                  {channel}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => {
              setCampaigns((items) =>
                items.map((item) =>
                  item.id === selectedCampaign.id
                    ? {
                        ...item,
                        status: item.status === "Paused" ? "Live" : "Paused",
                      }
                    : item,
                ),
              );
              setSelectedCampaign(null);
            }}
            className="mt-5 h-10 w-full rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
          >
            {selectedCampaign.status === "Paused"
              ? "Resume campaign & audit"
              : "Pause campaign & audit"}
          </button>
        </OpsModal>
      )}
    </>
  );
}
function AnnouncementPreview({
  kind,
  title,
  message,
  ctaLabel,
}: {
  kind: string;
  title: string;
  message: string;
  ctaLabel: string;
}) {
  const style =
    kind === "critical"
      ? "border-[#e65750] bg-[#fff0ee] text-[#8e3833]"
      : kind === "compliance"
        ? "border-[#8da0d6] bg-[#eef2ff] text-[#344b83]"
        : kind === "info"
          ? "border-[#9bb8ef] bg-[#edf4ff] text-[#365887]"
          : "border-[#e4c363] bg-[#fff8df] text-[#755b1b]";
  return (
    <div className={cn("mt-4 rounded-2xl border p-4", style)}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <b className="text-[9px]">{title || "Announcement title"}</b>
          <p className="mt-1 text-[8px] leading-4 opacity-80">
            {message || "Announcement message"}
          </p>
          {ctaLabel && (
            <button className="mt-3 rounded-lg [background-color:#11182a] bg-current px-3 py-2 text-[7px] font-extrabold text-white">
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function ChannelHealth({
  icon: Icon,
  name,
  provider,
  status,
  note,
}: {
  icon: LucideIcon;
  name: string;
  provider: string;
  status: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e1e5ed] p-4">
      <div className="flex items-center">
        <Icon className="size-4 text-[#536fdf]" />
        <span className="ml-auto size-2 rounded-full bg-[#2da467]" />
      </div>
      <b className="mt-4 block text-[9px]">{name}</b>
      <span className="mt-1 block text-[7px] text-[#7c879d]">
        {provider} - {note}
      </span>
      <span className="mt-3 inline-flex rounded-lg bg-[#e7f6ec] px-2 py-1 text-[7px] font-extrabold text-[#238150]">
        {status}
      </span>
    </div>
  );
}
function OpsMetric({
  icon: Icon,
  label,
  value,
  note,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const color =
    tone === "danger"
      ? "bg-[#fff0ee] text-[#c9544d]"
      : tone === "warning"
        ? "bg-[#fff5df] text-[#ad741f]"
        : tone === "success"
          ? "bg-[#e7f6ec] text-[#238150]"
          : "bg-[#edf1fb] text-[#536fdf]";
  return (
    <div className={`${panel} p-5`}>
      <span className={cn("grid size-10 place-items-center rounded-xl", color)}>
        <Icon className="size-4" />
      </span>
      <p className="mt-5 text-[8px] font-extrabold tracking-[.12em] text-[#7c879d] uppercase">
        {label}
      </p>
      <b className="mt-1 block text-xl tracking-[-.04em]">{value}</b>
      <span className="mt-1 block text-[8px] text-[#7c879d]">{note}</span>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const good = [
    "Live",
    "Completed",
    "Resolved",
    "PAID",
    "COMPLETED",
    "Available",
    "Released",
  ].includes(value);
  const warning = [
    "Queued",
    "Open",
    "Review",
    "PENDING",
    "PROCESSING",
    "Held",
    "Evidence review",
    "Seller response",
    "New",
  ].includes(value);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[7px] font-extrabold",
        good
          ? "bg-[#e7f6ec] text-[#238150]"
          : warning
            ? "bg-[#fff5df] text-[#9b6a1f]"
            : "bg-[#fff0ee] text-[#c9544d]",
      )}
    >
      {value}
    </span>
  );
}
function DataFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f5f6f9] p-3">
      <span className="text-[7px] text-[#7c879d]">{label}</span>
      <b className="mt-1 block text-[9px]">{value}</b>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-[8px] font-extrabold">
      {label}
      {children}
    </label>
  );
}
function OpsModal({
  icon: Icon,
  eyebrow,
  title,
  onClose,
  children,
  danger = false,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/75 p-4 backdrop-blur-sm">
      <section className="my-6 w-full max-w-2xl rounded-[26px] bg-white p-6 text-[#131827] shadow-2xl">
        <div className="flex items-start">
          <span
            className={cn(
              "grid size-12 place-items-center rounded-2xl",
              danger
                ? "bg-[#fff0ee] text-[#c9544d]"
                : "bg-[#edf1fb] text-[#536fdf]",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="ml-4">
            <p className="text-[7px] font-extrabold tracking-[.18em] text-[#7c879d] uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-black">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
