/**
 * PUB-220 — public platform status view models.
 * Launch disposition: non-live informational page.
 * GET /v1/status is sanitized process identity only — not a multi-service
 * operational aggregate, uptime SLA, or incident feed.
 */

/** Public row/overall kinds. Never paint green unless kind is `ok`. */
export type PublicStatusKind =
  "ok" | "degraded" | "down" | "unknown" | "not_reported";

/**
 * Page mode. Launch is always informational (no marketed live multi-service
 * status). Full operational aggregate would require a dedicated public status
 * provider (future INT-180 / status provider).
 */
export type PublicStatusPageMode = "informational";

export type PublicStatusServiceRow = {
  name: string;
  /** Truthful status label for existing chrome. */
  label: string;
  kind: PublicStatusKind;
  /**
   * Optional secondary column. Never invent uptime percentages.
   * Empty when not reported.
   */
  secondary: string;
};

export type PublicStatusIncident = {
  date: string;
  title: string;
  summary: string;
};

export type PublicPlatformStatusView = {
  mode: PublicStatusPageMode;
  overallKind: PublicStatusKind;
  /** Hero emphasis fragment (existing <em> slot). */
  heroEmphasis: string;
  /** Banner bold line. */
  headline: string;
  /** Banner detail / last-checked style line — never invent recency. */
  detail: string;
  /** Page description under hero. */
  description: string;
  services: PublicStatusServiceRow[];
  /**
   * Public incident list. Empty at launch — no incident feed on GET /v1/status.
   * Accordion remains STATIC; do not invent history.
   */
  incidents: PublicStatusIncident[];
  /** Static empty-incident copy when incidents.length === 0. */
  incidentsEmptyLabel: string;
  source: "api" | "mock" | "unavailable";
  /** Sanitized process identity when available (no topology/secrets). */
  apiService?: string;
  apiVersion?: string;
  appEnv?: string;
};

/** Service names matching existing /status chrome order (no redesign). */
export const PUBLIC_STATUS_SERVICE_NAMES = [
  "Web application",
  "Hosted storefronts",
  "QRIS payments",
  "Seller withdrawals",
  "Digital delivery",
  "API & webhooks",
] as const;

export type PublicStatusServiceName =
  (typeof PUBLIC_STATUS_SERVICE_NAMES)[number];
