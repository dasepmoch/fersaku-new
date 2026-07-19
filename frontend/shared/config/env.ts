export type DataSource = "mock" | "api";
export type AppStage = "prototype" | "live";

/** Local docker-compose host mapping (container :8080 → host :18080). */
export const DEFAULT_API_INTERNAL_URL = "http://127.0.0.1:18080";

/**
 * Browser topology mode (INT-030).
 * - same-origin: relative `/v1` via Next rewrites (official)
 * - absolute: deprecated escape hatch via NEXT_PUBLIC_API_URL (cross-origin)
 */
export type BrowserApiTopology = "same-origin" | "absolute";

function readDataSource(): DataSource {
  const value = process.env.NEXT_PUBLIC_DATA_SOURCE || "mock";
  if (value === "mock" || value === "api") return value;
  throw new Error(
    `Invalid NEXT_PUBLIC_DATA_SOURCE=${value}. Expected "mock" or "api".`,
  );
}

function readAppStage(): AppStage {
  const value = process.env.NEXT_PUBLIC_APP_STAGE || "prototype";
  if (value === "prototype" || value === "live") return value;
  throw new Error(
    `Invalid NEXT_PUBLIC_APP_STAGE=${value}. Expected "prototype" or "live".`,
  );
}

function isServerRuntime() {
  return typeof window === "undefined";
}

function normalizeBaseUrl(raw: string, label: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    const path =
      url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}`;
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL.`);
  }
}

function isPlaceholderInternalUrl(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("example.test") ||
    lower.includes("example.com") ||
    lower === "mock" ||
    lower === "fake" ||
    /\/\/(mock|fake)([./:]|$)/.test(lower)
  );
}

/**
 * Public (browser-safe) env. Never put secrets or API_INTERNAL_URL here.
 *
 * NEXT_PUBLIC_API_URL is deprecated for browser same-origin topology.
 * Prefer relative `/v1` + Next rewrites; leave NEXT_PUBLIC_API_URL empty.
 */
export const publicEnv = {
  get dataSource(): DataSource {
    return readDataSource();
  },
  get appStage(): AppStage {
    return readAppStage();
  },
  /**
   * @deprecated INT-030 — browser should use same-origin relative `/v1`.
   * Only set for temporary cross-origin debugging; never for internal SSR.
   */
  get apiUrl(): string | undefined {
    return process.env.NEXT_PUBLIC_API_URL || undefined;
  },
  get mockScenario(): string {
    return process.env.NEXT_PUBLIC_MOCK_SCENARIO || "default";
  },
};

export function getBrowserApiTopology(): BrowserApiTopology {
  const raw = publicEnv.apiUrl?.trim();
  if (!raw) return "same-origin";
  return "absolute";
}

/**
 * Browser HTTP client base URL.
 * Same-origin mode returns "" so callers build relative `/v1/...` paths.
 * Absolute mode (deprecated) returns the configured public API origin/base.
 */
export function getBrowserApiBaseUrl(): string {
  const topology = getBrowserApiTopology();
  if (topology === "same-origin") return "";

  const apiUrl = publicEnv.apiUrl;
  if (!apiUrl) return "";
  return normalizeBaseUrl(apiUrl, "NEXT_PUBLIC_API_URL");
}

/**
 * @deprecated Prefer getBrowserApiBaseUrl() + same-origin rewrites.
 * Kept for transitional callers; same-origin returns empty string.
 */
export function requireApiBaseUrl(): string {
  return getBrowserApiBaseUrl();
}

/**
 * Server-only internal API base for SSR fetch and Next rewrites.
 * Never expose via NEXT_PUBLIC_* or publicEnv.
 */
export function getApiInternalUrl(): string {
  if (!isServerRuntime()) {
    throw new Error(
      "API_INTERNAL_URL is server-only and must not be read in the browser.",
    );
  }

  const raw = process.env.API_INTERNAL_URL?.trim();
  if (raw) {
    if (isPlaceholderInternalUrl(raw) && publicEnv.appStage === "live") {
      throw new Error(
        "API_INTERNAL_URL must not be a mock/placeholder URL when NEXT_PUBLIC_APP_STAGE=live.",
      );
    }
    return normalizeBaseUrl(raw, "API_INTERNAL_URL");
  }

  if (publicEnv.appStage === "live") {
    throw new Error(
      "API_INTERNAL_URL is required when NEXT_PUBLIC_APP_STAGE=live.",
    );
  }

  return DEFAULT_API_INTERNAL_URL;
}

/**
 * Strict server validation for live/api deployments.
 * Empty or placeholder internal URL is rejected on live.
 */
export function requireApiInternalUrl(): string {
  if (!isServerRuntime()) {
    throw new Error(
      "API_INTERNAL_URL is server-only and must not be read in the browser.",
    );
  }

  const raw = process.env.API_INTERNAL_URL?.trim();
  if (!raw) {
    throw new Error(
      "API_INTERNAL_URL is required for API data-source or live stage (server-only).",
    );
  }
  if (isPlaceholderInternalUrl(raw)) {
    throw new Error(
      "API_INTERNAL_URL must not be a mock/placeholder URL in API/live mode.",
    );
  }
  return normalizeBaseUrl(raw, "API_INTERNAL_URL");
}

/**
 * Target origin used by next.config rewrites for `/v1/*` → Go API.
 * Prefer API_INTERNAL_URL; fall back to local compose host port.
 */
export function resolveApiProxyTarget(): string {
  const raw =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.API_PROXY_TARGET?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      throw new Error(
        "API_INTERNAL_URL / API_PROXY_TARGET must be an absolute http(s) URL.",
      );
    }
  }
  return new URL(DEFAULT_API_INTERNAL_URL).origin;
}

export function assertSafePublicEnvironment() {
  if (publicEnv.appStage === "live" && publicEnv.dataSource !== "api") {
    throw new Error(
      'Live deployments must use NEXT_PUBLIC_DATA_SOURCE="api". Mock mode is prototype-only.',
    );
  }

  if (publicEnv.apiUrl?.trim()) {
    normalizeBaseUrl(publicEnv.apiUrl, "NEXT_PUBLIC_API_URL");
  }

  if (!isServerRuntime()) return;

  if (publicEnv.appStage === "live") {
    requireApiInternalUrl();
  } else if (publicEnv.dataSource === "api") {
    const raw = process.env.API_INTERNAL_URL?.trim();
    if (raw) {
      if (isPlaceholderInternalUrl(raw)) {
        throw new Error(
          "API_INTERNAL_URL must not be a mock/placeholder URL in API mode.",
        );
      }
      normalizeBaseUrl(raw, "API_INTERNAL_URL");
    }
  }
}
