/**
 * PUB-220 mappers — never invent operational/green, uptime %, or incidents.
 * GET /v1/status proves API process identity only.
 */

import type { StatusDataDto } from "@/shared/api/schemas";
import {
  PUBLIC_STATUS_SERVICE_NAMES,
  type PublicPlatformStatusView,
  type PublicStatusKind,
  type PublicStatusServiceRow,
} from "./contracts";

export function formatUptimeSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s process uptime`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m process uptime`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h process uptime`;
  const d = Math.floor(h / 24);
  return `${d}d process uptime`;
}

function row(
  name: string,
  kind: PublicStatusKind,
  label: string,
  secondary = "",
): PublicStatusServiceRow {
  return { name, label, kind, secondary };
}

/**
 * Map sanitized status DTO → public page view.
 * Only "API & webhooks" may reflect process reachability; other surfaces stay
 * not_reported until a real public aggregate exists.
 */
export function mapStatusDtoToPublicView(
  dto: StatusDataDto,
  source: "api" | "mock",
): PublicPlatformStatusView {
  const processSecondary = formatUptimeSeconds(dto.uptimeSeconds);
  const services: PublicStatusServiceRow[] = PUBLIC_STATUS_SERVICE_NAMES.map(
    (name) => {
      if (name === "API & webhooks") {
        return row(name, "ok", "Reachable", processSecondary);
      }
      return row(name, "not_reported", "Not reported");
    },
  );

  return {
    mode: "informational",
    overallKind: "unknown",
    heroEmphasis: "informasional.",
    headline: "Status page is informational",
    detail:
      source === "api"
        ? `API process reachable · ${dto.service} ${dto.version} · ${dto.appEnv}`
        : `Prototype signal · ${dto.service} ${dto.version} · ${dto.appEnv}`,
    description:
      "Halaman ini menampilkan sinyal proses API yang disanitasi. Tidak ada agregat operasional multi-layanan, persentase uptime, atau feed insiden publik pada rilis ini.",
    services,
    incidents: [],
    incidentsEmptyLabel:
      "No public incident history is published. This accordion is static informational content only.",
    source,
    apiService: dto.service,
    apiVersion: dto.version,
    appEnv: dto.appEnv,
  };
}

/** Transport/schema failure — never default to operational green. */
export function mapUnavailablePublicStatus(): PublicPlatformStatusView {
  const services: PublicStatusServiceRow[] = PUBLIC_STATUS_SERVICE_NAMES.map(
    (name) => row(name, "unknown", "Unavailable"),
  );

  return {
    mode: "informational",
    overallKind: "unknown",
    heroEmphasis: "tidak tersedia.",
    headline: "Status signal unavailable",
    detail: "Could not load sanitized API status. Not showing operational green.",
    description:
      "Sinyal status publik tidak dapat dimuat. Halaman ini tidak menampilkan klaim operasional, uptime, atau insiden palsu.",
    services,
    incidents: [],
    incidentsEmptyLabel:
      "No public incident history is published. This accordion is static informational content only.",
    source: "unavailable",
  };
}

/** Dot class for existing chrome — green only when kind is ok. */
export function publicStatusDotClass(kind: PublicStatusKind): string {
  switch (kind) {
    case "ok":
      return "bg-[#35a765]";
    case "degraded":
      return "bg-[#d4a017]";
    case "down":
      return "bg-[#c44b4b]";
    default:
      return "bg-[#9aa3ad]";
  }
}

/** Status label text class — green only when kind is ok. */
export function publicStatusLabelClass(kind: PublicStatusKind): string {
  switch (kind) {
    case "ok":
      return "text-[#2b7b4d]";
    case "degraded":
      return "text-[#9a7b12]";
    case "down":
      return "text-[#a33b3b]";
    default:
      return "text-[#5c667a]";
  }
}

/** Banner chrome classes for overall kind. */
export function publicStatusBannerClasses(kind: PublicStatusKind): {
  border: string;
  bg: string;
  iconBg: string;
  iconText: string;
  titleText: string;
  detailText: string;
  activityText: string;
} {
  if (kind === "ok") {
    return {
      border: "border-[#bfe0ca]",
      bg: "bg-[#edf8f1]",
      iconBg: "bg-[#d5f0df]",
      iconText: "text-[#277c4c]",
      titleText: "text-[#275f40]",
      detailText: "text-[#668172]",
      activityText: "text-[#2f9a5c]",
    };
  }
  if (kind === "degraded") {
    return {
      border: "border-[#e8d9a8]",
      bg: "bg-[#fbf6e8]",
      iconBg: "bg-[#f3e6c0]",
      iconText: "text-[#8a6d10]",
      titleText: "text-[#6b5510]",
      detailText: "text-[#7a7158]",
      activityText: "text-[#9a7b12]",
    };
  }
  if (kind === "down") {
    return {
      border: "border-[#e8b8b8]",
      bg: "bg-[#fbf0f0]",
      iconBg: "bg-[#f3d4d4]",
      iconText: "text-[#a33b3b]",
      titleText: "text-[#7a2e2e]",
      detailText: "text-[#7a5858]",
      activityText: "text-[#c44b4b]",
    };
  }
  // unknown / not_reported / unavailable — neutral, never green
  return {
    border: "border-[#d5d9e0]",
    bg: "bg-[#f3f4f7]",
    iconBg: "bg-[#e8eaef]",
    iconText: "text-[#5c667a]",
    titleText: "text-[#3d4554]",
    detailText: "text-[#6b7380]",
    activityText: "text-[#7a8494]",
  };
}
