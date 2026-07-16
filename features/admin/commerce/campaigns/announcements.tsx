"use client";

import { adminPanel, ControlDialog } from "@/features/admin/ui";

import { useState } from "react";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import {
  ChannelHealth,
  DataFact,
  Field,
  OpsMetric,
  OpsModal,
  Status,
} from "./pieces";
import { AnnouncementPreview } from "./preview";

import { type Campaign, campaignSeed } from "./data";
import { writeVersionedStorage } from "@/shared/storage/versioned-storage";

type CampaignControl =
  { kind: "publish" } | { kind: "toggle"; campaign: Campaign };

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
  const [title, setTitle] = useState("Xendit sedang maintenance singkat");
  const [message, setMessage] = useState(
    "Pembayaran QRIS mungkin mengalami keterlambatan selama pemeliharaan. Transaksi yang sudah dibayar tetap aman dan status akan diperbarui otomatis setelah callback Xendit terverifikasi.",
  );
  const [ctaLabel, setCtaLabel] = useState("Lihat status sistem");
  const [ctaUrl, setCtaUrl] = useState("/status");
  const [mandatory, setMandatory] = useState(false);
  const [recentMfaConfirmed, setRecentMfaConfirmed] = useState(false);
  const [control, setControl] = useState<CampaignControl | null>(null);
  const requiresRecentMfa = kind === "critical" || kind === "compliance";

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
    if (channels.includes("In-App Banner")) {
      const persisted = writeVersionedStorage({
        key: "fersaku-admin-announcement",
        version: 1,
        data: {
          title,
          message,
          ctaLabel,
          ctaUrl,
          kind,
          mandatory,
          createdAt: new Date().toISOString(),
        },
      });
      if (!persisted) throw new Error("Unable to persist announcement");
      window.dispatchEvent(new Event("fersaku-announcement-updated"));
    }
    setCampaigns((items) => [next, ...items]);
    setPublished(true);
  };

  const confirmControl = () => {
    if (!control) return;
    if (control.kind === "publish") {
      if (requiresRecentMfa && !recentMfaConfirmed) {
        throw new Error("Recent MFA confirmation is required");
      }
      publish();
      return;
    }
    setCampaigns((items) =>
      items.map((item) =>
        item.id === control.campaign.id
          ? {
              ...item,
              status: item.status === "Paused" ? "Live" : "Paused",
            }
          : item,
      ),
    );
  };

  const closeControl = () => {
    const reopenComposer = control?.kind === "publish";
    setControl(null);
    if (reopenComposer) setComposer(true);
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

      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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
                setRecentMfaConfirmed(false);
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

      <section className={`${adminPanel} mt-4 p-5`}>
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
                  {requiresRecentMfa && (
                    <label className="mt-3 flex gap-3 rounded-xl border border-[#efd39a] bg-[#fff8e9] p-4 text-[8px] leading-4 text-[#806f4f]">
                      <input
                        type="checkbox"
                        checked={recentMfaConfirmed}
                        onChange={(event) =>
                          setRecentMfaConfirmed(event.target.checked)
                        }
                        className="mt-0.5"
                      />
                      <span>
                        Mock recent-MFA check completed for this critical or
                        compliance publication.
                      </span>
                    </label>
                  )}
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
                        channels.length === 0 ||
                        (requiresRecentMfa && !recentMfaConfirmed)
                      }
                      onClick={() => {
                        setComposer(false);
                        setControl({ kind: "publish" });
                      }}
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
              setControl({ kind: "toggle", campaign: selectedCampaign });
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
      {control && (
        <ControlDialog
          title={
            control.kind === "publish"
              ? `Publish ${kind} campaign`
              : control.campaign.status === "Paused"
                ? "Resume campaign"
                : "Pause campaign"
          }
          target={
            control.kind === "publish" ? "new-campaign" : control.campaign.id
          }
          danger={
            (control.kind === "publish" && requiresRecentMfa) ||
            (control.kind === "toggle" && control.campaign.status !== "Paused")
          }
          onClose={closeControl}
          onConfirm={confirmControl}
        />
      )}
    </>
  );
}
