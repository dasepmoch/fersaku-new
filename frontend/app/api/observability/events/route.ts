import { NextResponse } from "next/server";

/**
 * GAP-07 — same-origin intake for redacted client observability events.
 * Accepts bounded JSON batches; never echoes or stores secrets.
 * Server logs a single structured line per event (redacted fields only).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_EVENTS = 40;
const MAX_BODY_BYTES = 48_000;

type InEvent = {
  kind?: string;
  ts?: string;
  releaseId?: string;
  surface?: string;
  source?: string;
  redactedError?: Record<string, unknown>;
  context?: Record<string, unknown>;
  metric?: { name?: string; value?: number };
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Drop keys that must never be re-logged even if a buggy client sends them. */
const FORBIDDEN = /password|secret|token|authorization|cookie|signature|account|kyc|email|card|cvv|bearer/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[DEPTH]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 256) return value.slice(0, 256);
    if (value.includes("@") && value.includes(".")) return "[REDACTED]";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  return "[DROPPED]";
}

export async function POST(request: Request) {
  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventsRaw = isPlainObject(body) ? body.events : null;
  if (!Array.isArray(eventsRaw)) {
    return NextResponse.json({ ok: false, error: "events_required" }, { status: 400 });
  }

  const events = eventsRaw.slice(0, MAX_EVENTS) as InEvent[];
  let accepted = 0;
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const kind = e.kind === "metric" ? "metric" : "error";
    const line = {
      msg: "client_observability",
      kind,
      ts: typeof e.ts === "string" ? e.ts : undefined,
      releaseId: typeof e.releaseId === "string" ? e.releaseId.slice(0, 64) : undefined,
      surface: typeof e.surface === "string" ? e.surface.slice(0, 64) : undefined,
      source: typeof e.source === "string" ? e.source.slice(0, 64) : undefined,
      redactedError: scrub(e.redactedError),
      context: scrub(e.context),
      metric:
        kind === "metric" && e.metric
          ? {
              name:
                typeof e.metric.name === "string"
                  ? e.metric.name.slice(0, 96)
                  : "unknown",
              value:
                typeof e.metric.value === "number" && Number.isFinite(e.metric.value)
                  ? e.metric.value
                  : 0,
            }
          : undefined,
    };
    // Structured log for operators (no secrets by construction).
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(line));
    accepted += 1;
  }

  return NextResponse.json(
    { ok: true, accepted },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
