/**
 * INT-025 — typed per-domain data-source / capability registry.
 * Feature adapters select mock | api | disabled via getDomainSource(domain).
 * Screens must not read env/flags; production/live rejects mock (fail closed).
 * disabled never falls back to mock fixtures.
 * QLT-400: canary/allowlist/emergency layers live in domain-flags.ts;
 * this module remains the typed snapshot + accessor source of truth.
 */

import { publicEnv, type AppStage } from "@/shared/config/env";

/** Effective source for one domain surface. */
export type DomainSource = "mock" | "api" | "disabled";

/**
 * Rollout domains. Money / secret / privileged surfaces are separate so they
 * can be disabled without taking public reads offline.
 */
export type DataDomain =
  | "publicCatalog"
  | "auth"
  | "checkout"
  | "buyer"
  | "sellerCatalog"
  | "sellerOperations"
  | "sellerFinance"
  | "adminRead"
  | "adminWrite";

export const DATA_DOMAINS: readonly DataDomain[] = [
  "publicCatalog",
  "auth",
  "checkout",
  "buyer",
  "sellerCatalog",
  "sellerOperations",
  "sellerFinance",
  "adminRead",
  "adminWrite",
] as const;

export type DomainSourceMap = Readonly<Record<DataDomain, DomainSource>>;

/** Non-sensitive, request-stable snapshot for SSR ↔ client hydration. */
export type DomainSourceSnapshot = {
  /** Config/evaluation version for telemetry and cache keys. */
  version: string;
  /** Release / deploy identifier when known. */
  releaseId: string;
  stage: AppStage;
  domains: DomainSourceMap;
};

export type DomainSourceEvaluationInput = {
  stage?: AppStage;
  /** Legacy global bootstrap (NEXT_PUBLIC_DATA_SOURCE). Not a per-domain rollout. */
  bootstrapSource?: "mock" | "api";
  /** Explicit per-domain overrides (server-owned emergency / canary). */
  overrides?: Partial<Record<DataDomain, DomainSource>>;
  version?: string;
  releaseId?: string;
  /**
   * When true (default for live stage), requested mock is rewritten to disabled
   * and assertProductionDomainSources rejects residual mock.
   */
  rejectMock?: boolean;
};

export class DomainDisabledError extends Error {
  readonly code = "DOMAIN_DISABLED" as const;
  readonly domain: DataDomain;

  constructor(domain: DataDomain, message?: string) {
    super(
      message ||
        `Domain "${domain}" is disabled. Mock fixtures are not used as fallback.`,
    );
    this.name = "DomainDisabledError";
    this.domain = domain;
  }
}

export class DomainSourceConfigError extends Error {
  readonly code = "DOMAIN_SOURCE_CONFIG" as const;

  constructor(message: string) {
    super(message);
    this.name = "DomainSourceConfigError";
  }
}

const DEFAULT_VERSION = "int-025-v1";
const DEFAULT_RELEASE = "local";

function isDataDomain(value: string): value is DataDomain {
  return (DATA_DOMAINS as readonly string[]).includes(value);
}

function isDomainSource(value: string): value is DomainSource {
  return value === "mock" || value === "api" || value === "disabled";
}

/** Pure evaluation — no process.env reads beyond caller-supplied input. */
export function evaluateDomainSources(
  input: DomainSourceEvaluationInput = {},
): DomainSourceSnapshot {
  const stage = input.stage ?? "prototype";
  const rejectMock = input.rejectMock ?? stage === "live";
  const bootstrap = input.bootstrapSource ?? "mock";

  if (bootstrap !== "mock" && bootstrap !== "api") {
    throw new DomainSourceConfigError(
      `Invalid bootstrapSource=${String(bootstrap)}. Expected "mock" or "api".`,
    );
  }

  if (stage === "live" && bootstrap === "mock" && !input.overrides) {
    // Live must not default the whole surface to mock; fail closed at evaluation.
    throw new DomainSourceConfigError(
      'Live stage rejects bootstrap mock. Use api bootstrap or explicit per-domain api|disabled overrides.',
    );
  }

  const base: DomainSource = bootstrap === "api" ? "api" : "mock";
  const domains = {} as Record<DataDomain, DomainSource>;

  for (const domain of DATA_DOMAINS) {
    let source: DomainSource = base;
    const override = input.overrides?.[domain];
    if (override !== undefined) {
      if (!isDomainSource(override)) {
        throw new DomainSourceConfigError(
          `Invalid DomainSource override for ${domain}: ${String(override)}`,
        );
      }
      source = override;
    }

    if (rejectMock && source === "mock") {
      // Production/live: flag-off / residual mock → disabled, never fixtures.
      source = "disabled";
    }

    domains[domain] = source;
  }

  if (rejectMock) {
    assertProductionDomainSources(domains);
  }

  return {
    version: input.version ?? DEFAULT_VERSION,
    releaseId: input.releaseId ?? DEFAULT_RELEASE,
    stage,
    domains,
  };
}

/** Fail closed: production/live snapshot must not contain mock. */
export function assertProductionDomainSources(
  domains: DomainSourceMap | Partial<Record<DataDomain, DomainSource>>,
): void {
  for (const domain of DATA_DOMAINS) {
    const source = domains[domain];
    if (source === "mock") {
      throw new DomainSourceConfigError(
        `Production rejects mock source for domain "${domain}". Use api or disabled.`,
      );
    }
  }
}

/**
 * Bootstrap snapshot from public env (prototype default mock).
 * Live + global mock is already rejected by assertSafePublicEnvironment;
 * evaluation still maps any residual mock overrides to disabled when stage is live.
 */
export function createBootstrapDomainSourceSnapshot(
  overrides?: Partial<Record<DataDomain, DomainSource>>,
): DomainSourceSnapshot {
  return evaluateDomainSources({
    stage: publicEnv.appStage,
    bootstrapSource: publicEnv.dataSource,
    overrides: {
      ...readServerOwnedOverrides(),
      ...overrides,
    },
    version: process.env.DOMAIN_SOURCE_VERSION || DEFAULT_VERSION,
    releaseId:
      process.env.DOMAIN_SOURCE_RELEASE_ID ||
      process.env.NEXT_PUBLIC_RELEASE_ID ||
      DEFAULT_RELEASE,
  });
}

/**
 * Optional server-owned JSON map, e.g. DOMAIN_SOURCE_OVERRIDES={"sellerFinance":"disabled"}.
 * Not NEXT_PUBLIC — emergency control must not rely on client-only flags alone.
 */
export function readServerOwnedOverrides(): Partial<
  Record<DataDomain, DomainSource>
> {
  const raw = process.env.DOMAIN_SOURCE_OVERRIDES;
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new DomainSourceConfigError(
      "DOMAIN_SOURCE_OVERRIDES must be valid JSON object of domain → mock|api|disabled.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DomainSourceConfigError(
      "DOMAIN_SOURCE_OVERRIDES must be a JSON object.",
    );
  }
  const result: Partial<Record<DataDomain, DomainSource>> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!isDataDomain(key)) {
      throw new DomainSourceConfigError(
        `Unknown DataDomain in DOMAIN_SOURCE_OVERRIDES: ${key}`,
      );
    }
    if (typeof value !== "string" || !isDomainSource(value)) {
      throw new DomainSourceConfigError(
        `Invalid source for ${key} in DOMAIN_SOURCE_OVERRIDES: ${String(value)}`,
      );
    }
    result[key] = value;
  }
  return result;
}

/** Public-safe subset for client hydration (no secrets). */
export function toPublicDomainSourceSnapshot(
  snapshot: DomainSourceSnapshot,
): DomainSourceSnapshot {
  return {
    version: snapshot.version,
    releaseId: snapshot.releaseId,
    stage: snapshot.stage,
    domains: { ...snapshot.domains },
  };
}

let activeSnapshot: DomainSourceSnapshot | null = null;

/** Install request-stable snapshot (SSR once, or client hydration). */
export function installDomainSourceSnapshot(
  snapshot: DomainSourceSnapshot,
): void {
  if (snapshot.stage === "live") {
    assertProductionDomainSources(snapshot.domains);
  }
  activeSnapshot = toPublicDomainSourceSnapshot(snapshot);
}

export function clearDomainSourceSnapshot(): void {
  activeSnapshot = null;
}

export function getDomainSourceSnapshot(): DomainSourceSnapshot {
  if (!activeSnapshot) {
    activeSnapshot = createBootstrapDomainSourceSnapshot();
  }
  return activeSnapshot;
}

/** Source of truth for feature adapters. */
export function getDomainSource(domain: DataDomain): DomainSource {
  if (!isDataDomain(domain)) {
    throw new DomainSourceConfigError(`Unknown DataDomain: ${String(domain)}`);
  }
  return getDomainSourceSnapshot().domains[domain];
}

export function isDomainApi(domain: DataDomain): boolean {
  return getDomainSource(domain) === "api";
}

export function isDomainMock(domain: DataDomain): boolean {
  return getDomainSource(domain) === "mock";
}

export function isDomainDisabled(domain: DataDomain): boolean {
  return getDomainSource(domain) === "disabled";
}

/**
 * Adapter helper: mock fixtures only when source is mock; disabled throws;
 * api returns false so caller hits transport.
 */
export function shouldUseMockFixtures(domain: DataDomain): boolean {
  const source = getDomainSource(domain);
  if (source === "disabled") {
    throw new DomainDisabledError(domain);
  }
  return source === "mock";
}

/**
 * Placeholder / query-cache helper: demo data only for mock; never for disabled/api.
 */
export function mockPlaceholderData<T>(
  domain: DataDomain,
  fixtures: T,
): T | undefined {
  return getDomainSource(domain) === "mock" ? fixtures : undefined;
}

/** Run branch by effective source; disabled never invokes mock. */
export async function withDomainSource<T>(
  domain: DataDomain,
  handlers: {
    mock: () => T | Promise<T>;
    api: () => T | Promise<T>;
    disabled?: () => T | Promise<T>;
  },
): Promise<T> {
  const source = getDomainSource(domain);
  if (source === "mock") return handlers.mock();
  if (source === "api") return handlers.api();
  if (handlers.disabled) return handlers.disabled();
  throw new DomainDisabledError(domain);
}
