import { NextResponse } from "next/server";

/**
 * Liveness for the Next.js process (load balancer / container healthcheck).
 * Does not probe backend dependencies — API readiness is on Go /health/ready.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const releaseId =
    process.env.NEXT_PUBLIC_RELEASE_ID?.trim() ||
    process.env.RELEASE_ID?.trim() ||
    "unknown";
  return NextResponse.json(
    {
      status: "ok",
      service: "fersaku-frontend",
      releaseId,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
