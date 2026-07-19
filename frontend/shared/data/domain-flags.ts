/**
 * QLT-400 — per-domain flags / canary / kill-switch evaluation layers.
 * Builds on INT-025 typed registry (mock | api | disabled).
 * Production never falls back to mock business data when flag is off.
 *
 * Precedence (highest wins):
 *   emergency kill → canary/allowlist → server overrides → bootstrap default
 * Live stage rewrites residual mock → disabled (never fixtures).
 */

import type { AppStage } from "@/shared/config/env";
import {
  DATA_DOMAINS,
  type DataDomain,
  type DomainSource,
  type DomainSourceMap,
  type DomainSourceSnapshot,
  DomainSourceConfigError,
  assertProductionDomainSources,
  evaluateDomainSources,
} from "@/shared/data/domain-source";

/** Public-safe emergency audit record (no raw user/tenant PII). */
export type EmergencyKillSwitch = {
  domain: DataDomain;
  /** Target source; kill switch uses "disabled". */
  source: DomainSource;
  /** Config/evaluation version for telemetry + propagation. */
  version: string;
  /** Operator/actor id (pseudonymous ok; never email/phone). */
  actor: string;
  reason: string;
  /** ISO expiry; when past, control is ignored. */
  expiresAt?: string;
  /** Propagation SLO budget in ms (parent default 30s). */
  propagationSloMs?: number;
};

export type DomainCanaryAllowlist = {
  domain: DataDomain;
  /** When true and subject is listed (or percentage hits), force api. */
  source?: DomainSource;
  /** Opaque subject hashes / cohort tokens — not emails. */
  subjectAllowlist?: readonly string[];
  /**
   * 0–100 canary percentage for subjects not on allowlist.
   * Deterministic hash of subjectKey; 0 = off, 100 = all.
   */
  percent?: number;
};

export type DomainFlagsEvaluationInput = {
  stage?: AppStage;
  bootstrapSource?: "mock" | "api";
  /** Server-owned per-domain defaults (DOMAIN_SOURCE_OVERRIDES). */
  overrides?: Partial<Record<DataDomain, DomainSource>>;
  /** Canary / allowlist layer (below emergency). */
  canary?: readonly DomainCanaryAllowlist[];
  /** Emergency kill switches (highest precedence when active). */
  emergency?: readonly EmergencyKillSwitch[];
  /** Opaque subject key for canary/allowlist (session/cohort hash). */
  subjectKey?: string;
  version?: string;
  releaseId?: string;
  rejectMock?: boolean;
  /** Clock for expiry tests (ms since epoch). */
  nowMs?: number;
};

export const DEFAULT_KILL_SWITCH_PROPAGATION_SLO_MS = 30_000;

function isDataDomain(value: string): value is DataDomain {
  return (DATA_DOMAINS as readonly string[]).includes(value);
}

function isDomainSource(value: string): value is DomainSource {
  return value === "mock" || value === "api" || value === "disabled";
}

/** Stable 0–99 bucket for canary percent (no crypto dependency). */
export function canaryBucket(subjectKey: string, domain: DataDomain): number {
  const input = `${domain}:${subjectKey}`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0) % 100;
}

export function isEmergencyActive(
  control: EmergencyKillSwitch,
  nowMs: number = Date.now(),
): boolean {
  if (!isDataDomain(control.domain)) return false;
  if (!isDomainSource(control.source)) return false;
  if (!control.version || !control.actor || !control.reason) return false;
  if (control.expiresAt) {
    const exp = Date.parse(control.expiresAt);
    if (!Number.isFinite(exp) || exp <= nowMs) return false;
  }
  return true;
}

/**
 * Resolve canary/allowlist source for one domain, or undefined if not selected.
 * Allowlist membership wins over percent; percent uses deterministic bucket.
 */
export function resolveCanarySource(
  domain: DataDomain,
  canary: readonly DomainCanaryAllowlist[] | undefined,
  subjectKey: string | undefined,
): DomainSource | undefined {
  if (!canary?.length) return undefined;
  const entry = canary.find((c) => c.domain === domain);
  if (!entry) return undefined;
  const target: DomainSource = entry.source ?? "api";
  if (subjectKey && entry.subjectAllowlist?.includes(subjectKey)) {
    return target;
  }
  const percent = entry.percent ?? 0;
  if (percent <= 0 || !subjectKey) return undefined;
  if (percent >= 100) return target;
  if (canaryBucket(subjectKey, domain) < percent) return target;
  return undefined;
}

/**
 * Full QLT-400 evaluation with emergency > canary > override > bootstrap.
 * Live/production still rewrites residual mock → disabled.
 */
export function evaluateDomainFlags(
  input: DomainFlagsEvaluationInput = {},
): DomainSourceSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const stage = input.stage ?? "prototype";
  const rejectMock = input.rejectMock ?? stage === "live";

  // Layer base: bootstrap + server overrides (INT-025).
  const layeredOverrides: Partial<Record<DataDomain, DomainSource>> = {
    ...input.overrides,
  };

  // Canary / allowlist (below emergency).
  for (const domain of DATA_DOMAINS) {
    const canarySource = resolveCanarySource(
      domain,
      input.canary,
      input.subjectKey,
    );
    if (canarySource !== undefined) {
      layeredOverrides[domain] = canarySource;
    }
  }

  // Emergency kill (highest).
  if (input.emergency) {
    for (const control of input.emergency) {
      if (!isEmergencyActive(control, nowMs)) continue;
      layeredOverrides[control.domain] = control.source;
    }
  }

  return evaluateDomainSources({
    stage,
    bootstrapSource: input.bootstrapSource,
    overrides: layeredOverrides,
    version: input.version,
    releaseId: input.releaseId,
    rejectMock,
  });
}

/** Public-safe audit event for emergency apply (no raw tenant/user). */
export type EmergencyAuditEvent = {
  kind: "domain_emergency_kill";
  domain: DataDomain;
  source: DomainSource;
  version: string;
  actor: string;
  reason: string;
  releaseId: string;
  expiresAt?: string;
  propagationSloMs: number;
  at: string;
};

export function buildEmergencyAuditEvent(
  control: EmergencyKillSwitch,
  releaseId: string,
  atMs: number = Date.now(),
): EmergencyAuditEvent {
  if (!isEmergencyActive(control, atMs)) {
    throw new DomainSourceConfigError(
      `Emergency control for ${control.domain} is inactive or incomplete.`,
    );
  }
  return {
    kind: "domain_emergency_kill",
    domain: control.domain,
    source: control.source,
    version: control.version,
    actor: control.actor,
    reason: control.reason,
    releaseId,
    expiresAt: control.expiresAt,
    propagationSloMs:
      control.propagationSloMs ?? DEFAULT_KILL_SWITCH_PROPAGATION_SLO_MS,
    at: new Date(atMs).toISOString(),
  };
}

/**
 * Public-safe telemetry bag: domain, effective source, config version, release.
 * Never includes raw user/tenant identifiers.
 */
export function buildDomainSourceTelemetry(
  snapshot: DomainSourceSnapshot,
  domain: DataDomain,
): {
  domain: DataDomain;
  source: DomainSource;
  configVersion: string;
  releaseId: string;
  stage: AppStage;
} {
  if (!(DATA_DOMAINS as readonly string[]).includes(domain)) {
    throw new DomainSourceConfigError(`Unknown DataDomain: ${String(domain)}`);
  }
  return {
    domain,
    source: snapshot.domains[domain],
    configVersion: snapshot.version,
    releaseId: snapshot.releaseId,
    stage: snapshot.stage,
  };
}

/** Segment for query keys when source affects cached payload shape. */
export function domainSourceKeySegment(
  domain: DataDomain,
  source: DomainSource,
  configVersion: string,
): { domain: DataDomain; source: DomainSource; v: string } {
  return { domain, source, v: configVersion };
}

/** Compare two maps; list domains whose effective source changed. */
export function domainsWithSourceChange(
  previous: DomainSourceMap | DomainSourceSnapshot,
  next: DomainSourceMap | DomainSourceSnapshot,
): DataDomain[] {
  const prevMap = "domains" in previous ? previous.domains : previous;
  const nextMap = "domains" in next ? next.domains : next;
  const changed: DataDomain[] = [];
  for (const domain of DATA_DOMAINS) {
    if (prevMap[domain] !== nextMap[domain]) {
      changed.push(domain);
    }
  }
  return changed;
}

/**
 * Query-key roots that may hold data for a DataDomain.
 * Used only for cancel/remove on source change — not for auth tenant isolation.
 */
export const DOMAIN_QUERY_ROOTS: Readonly<
  Record<DataDomain, readonly string[]>
> = {
  publicCatalog: ["public", "catalog", "featured", "store", "product"],
  auth: ["auth", "session", "me"],
  checkout: ["checkout", "commerce"],
  buyer: ["buyer"],
  sellerCatalog: ["seller"],
  sellerOperations: ["seller"],
  sellerFinance: ["seller"],
  adminRead: ["admin"],
  adminWrite: ["admin"],
};

export function queryKeyTouchesDomain(
  queryKey: readonly unknown[],
  domain: DataDomain,
): boolean {
  const roots = DOMAIN_QUERY_ROOTS[domain];
  if (!roots) return false;
  const flat = queryKey
    .filter((p): p is string => typeof p === "string")
    .map((s) => s.toLowerCase());
  // Explicit source segment from domainSourceKeySegment
  for (let i = 0; i < queryKey.length; i += 1) {
    const part = queryKey[i];
    if (
      part &&
      typeof part === "object" &&
      !Array.isArray(part) &&
      "domain" in part &&
      (part as { domain?: string }).domain === domain
    ) {
      return true;
    }
  }
  return roots.some((root) => flat.includes(root.toLowerCase()));
}

/** Minimal QueryClient surface used for purge (avoids coupling to full RQ API). */
export type DomainCacheClient = {
  cancelQueries: (opts: {
    predicate: (query: { queryKey: readonly unknown[] }) => boolean;
  }) => unknown;
  removeQueries: (opts: {
    predicate: (query: { queryKey: readonly unknown[] }) => boolean;
  }) => unknown;
};

/**
 * Cancel in-flight and remove cached queries for domains whose source changed.
 * Call before installing the next snapshot when effective sources differ.
 */
export function purgeDomainCachesOnSourceChange(
  client: DomainCacheClient,
  previous: DomainSourceMap | DomainSourceSnapshot,
  next: DomainSourceMap | DomainSourceSnapshot,
): DataDomain[] {
  const changed = domainsWithSourceChange(previous, next);
  if (changed.length === 0) return changed;

  const predicate = (query: { queryKey: readonly unknown[] }) =>
    changed.some((domain) => queryKeyTouchesDomain(query.queryKey, domain));

  void client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
  return changed;
}

/**
 * Install helper: if previous snapshot exists and sources differ, purge first.
 * Returns domains purged (empty when no previous or no change).
 */
export function applyDomainSourceChange(
  client: DomainCacheClient | null | undefined,
  previous: DomainSourceSnapshot | null | undefined,
  next: DomainSourceSnapshot,
): DataDomain[] {
  if (next.stage === "live") {
    assertProductionDomainSources(next.domains);
  }
  if (!previous || !client) return [];
  return purgeDomainCachesOnSourceChange(client, previous, next);
}

/**
 * Parse optional DOMAIN_SOURCE_EMERGENCY JSON array of kill switches.
 * Server-owned only — not NEXT_PUBLIC.
 */
export function readServerOwnedEmergencyControls(
  raw: string | undefined = typeof process !== "undefined"
    ? process.env.DOMAIN_SOURCE_EMERGENCY
    : undefined,
): EmergencyKillSwitch[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new DomainSourceConfigError(
      "DOMAIN_SOURCE_EMERGENCY must be valid JSON array of kill-switch objects.",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new DomainSourceConfigError(
      "DOMAIN_SOURCE_EMERGENCY must be a JSON array.",
    );
  }
  const result: EmergencyKillSwitch[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new DomainSourceConfigError(
        "DOMAIN_SOURCE_EMERGENCY entries must be objects.",
      );
    }
    const row = item as Record<string, unknown>;
    const domain = row.domain;
    const source = row.source;
    if (typeof domain !== "string" || !isDataDomain(domain)) {
      throw new DomainSourceConfigError(
        `Unknown DataDomain in DOMAIN_SOURCE_EMERGENCY: ${String(domain)}`,
      );
    }
    if (typeof source !== "string" || !isDomainSource(source)) {
      throw new DomainSourceConfigError(
        `Invalid source in DOMAIN_SOURCE_EMERGENCY for ${domain}`,
      );
    }
    if (
      typeof row.version !== "string" ||
      typeof row.actor !== "string" ||
      typeof row.reason !== "string"
    ) {
      throw new DomainSourceConfigError(
        `Emergency for ${domain} requires version, actor, reason strings.`,
      );
    }
    result.push({
      domain,
      source,
      version: row.version,
      actor: row.actor,
      reason: row.reason,
      expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : undefined,
      propagationSloMs:
        typeof row.propagationSloMs === "number"
          ? row.propagationSloMs
          : undefined,
    });
  }
  return result;
}

/**
 * Parse optional DOMAIN_SOURCE_CANARY JSON array.
 * Server-owned only — not NEXT_PUBLIC.
 */
export function readServerOwnedCanary(
  raw: string | undefined = typeof process !== "undefined"
    ? process.env.DOMAIN_SOURCE_CANARY
    : undefined,
): DomainCanaryAllowlist[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new DomainSourceConfigError(
      "DOMAIN_SOURCE_CANARY must be valid JSON array.",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new DomainSourceConfigError(
      "DOMAIN_SOURCE_CANARY must be a JSON array.",
    );
  }
  const result: DomainCanaryAllowlist[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new DomainSourceConfigError(
        "DOMAIN_SOURCE_CANARY entries must be objects.",
      );
    }
    const row = item as Record<string, unknown>;
    if (typeof row.domain !== "string" || !isDataDomain(row.domain)) {
      throw new DomainSourceConfigError(
        `Unknown DataDomain in DOMAIN_SOURCE_CANARY: ${String(row.domain)}`,
      );
    }
    const source =
      typeof row.source === "string" && isDomainSource(row.source)
        ? row.source
        : "api";
    const subjectAllowlist = Array.isArray(row.subjectAllowlist)
      ? row.subjectAllowlist.filter((s): s is string => typeof s === "string")
      : undefined;
    const percent =
      typeof row.percent === "number" && Number.isFinite(row.percent)
        ? Math.max(0, Math.min(100, row.percent))
        : undefined;
    result.push({
      domain: row.domain,
      source,
      subjectAllowlist,
      percent,
    });
  }
  return result;
}
