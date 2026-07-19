import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const isLive = process.env.NEXT_PUBLIC_APP_STAGE === "live";

/** Local docker-compose: host 18080 → container 8080 (INT-030). */
const DEFAULT_API_PROXY_ORIGIN = "http://127.0.0.1:18080";

/**
 * Rewrite target for same-origin browser `/v1/*` → Go API.
 * Server-only env: API_INTERNAL_URL (preferred) or API_PROXY_TARGET.
 * Never use NEXT_PUBLIC_* for the internal proxy destination.
 */
function apiProxyOrigin(): string {
  const raw =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.API_PROXY_TARGET?.trim();
  if (!raw) return DEFAULT_API_PROXY_ORIGIN;
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(
      "API_INTERNAL_URL / API_PROXY_TARGET must be an absolute http(s) URL for /v1 rewrites.",
    );
  }
}

/**
 * CSP connect-src: same-origin topology only needs 'self'.
 * Deprecated NEXT_PUBLIC_API_URL (absolute/cross-origin) may add an extra origin.
 */
function apiConnectSources(): string {
  const sources = new Set<string>(["'self'"]);
  const publicApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicApi) {
    try {
      sources.add(new URL(publicApi).origin);
    } catch {
      // Invalid public URL is rejected at runtime by env contract.
    }
  }
  if (isDevelopment) {
    sources.add("ws://localhost:*");
    sources.add("ws://127.0.0.1:*");
  }
  return [...sources].join(" ");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${apiConnectSources()}`,
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  ...(isLive ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(isLive
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const proxyOrigin = apiProxyOrigin();

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Production container/runtime: self-contained Node server under .next/standalone
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Source maps: never ship browser maps in production images (set GENERATE_SOURCEMAPS=1 only for debug builds).
  productionBrowserSourceMaps: process.env.GENERATE_SOURCEMAPS === "1",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: "/@:storeSlug", destination: "/store/:storeSlug" },
      {
        source: "/@:storeSlug/:productSlug",
        destination: "/store/:storeSlug/:productSlug",
      },
      // INT-030: transparent same-origin proxy browser → Go API.
      // Next does not implement commerce logic; body/response pass through.
      {
        source: "/v1",
        destination: `${proxyOrigin}/v1`,
      },
      {
        source: "/v1/:path*",
        destination: `${proxyOrigin}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
