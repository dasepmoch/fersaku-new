import { NextResponse } from "next/server";
import { readObservabilityModeFromProcess } from "@/shared/observability/mode";

/**
 * Liveness for the Next.js process (load balancer / container healthcheck).
 * Does not probe backend dependencies — API readiness is on Go /health/ready.
 * Exposes observability reporter mode for GAP-07 diagnostics (no secrets).
 *
 * Uses server-side env vars only — NOT NEXT_PUBLIC_* (INT-025: presentation
 * screens must not read data-source flags; this is a server route, not a screen).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const releaseId = process.env.RELEASE_ID?.trim() || "unknown";
  const observabilityMode = readObservabilityModeFromProcess();
  const appStage = process.env.APP_STAGE || "prototype";
  // Live stage with noop/disabled is an explicit non-prod-style mode (must be visible).
  const observabilityReady =
    observabilityMode === "sink" || appStage !== "live";

  return NextResponse.json(
    {
      status: "ok",
      service: "fersaku-frontend",
      releaseId,
      observability: {
        mode: observabilityMode,
        ready: observabilityReady,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
