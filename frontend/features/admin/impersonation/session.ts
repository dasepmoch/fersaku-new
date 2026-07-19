"use client";

import { z } from "zod";
import type { ImpersonationMeta } from "@/shared/auth/session-model";
import type { ImpersonationStartDataDto } from "@/shared/api/schemas";

export const IMPERSONATION_STORAGE_KEY = "fersaku-impersonation-session-v1";
export const IMPERSONATION_SCOPES = ["read-only", "support-write"] as const;
export const IMPERSONATION_TTLS = [15, 30, 60] as const;
export const WIRE_IMPERSONATION_SCOPES = ["READ_ONLY", "SUPPORT_WRITE"] as const;

export type ImpersonationScope = (typeof IMPERSONATION_SCOPES)[number];
export type WireImpersonationScope = (typeof WIRE_IMPERSONATION_SCOPES)[number];
export type ImpersonationTargetType = "merchant" | "user";

export const impersonationSessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(8),
  targetId: z.string().min(1),
  targetName: z.string().min(1),
  targetEmail: z.string().email().optional(),
  targetType: z.enum(["merchant", "user"]),
  scope: z.enum(IMPERSONATION_SCOPES),
  reason: z.string().min(12).max(500),
  ttlMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  startedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  actor: z.string().min(1),
  /** true when session was mapped from server claims/start (not local authority). */
  serverIssued: z.boolean().optional(),
});

export type ImpersonationSession = z.infer<typeof impersonationSessionSchema>;

/** Map UI scope ↔ wire scope (READ_ONLY / SUPPORT_WRITE). */
export function toWireImpersonationScope(
  scope: ImpersonationScope,
): WireImpersonationScope {
  return scope === "support-write" ? "SUPPORT_WRITE" : "READ_ONLY";
}

export function fromWireImpersonationScope(
  scope: string | null | undefined,
): ImpersonationScope | null {
  if (!scope) return null;
  const u = scope.trim().toUpperCase().replace(/-/g, "_");
  if (u === "READ_ONLY" || u === "READONLY" || scope === "read-only") {
    return "read-only";
  }
  if (
    u === "SUPPORT_WRITE" ||
    u === "SUPPORTWRITE" ||
    scope === "support-write"
  ) {
    return "support-write";
  }
  return null;
}

/**
 * Map session bootstrap impersonation meta → banner/policy session view.
 * Server claims are authority; no URL/storage required.
 */
export function mapClaimsImpersonationToSession(
  meta: ImpersonationMeta | null | undefined,
  extras?: {
    targetName?: string;
    targetEmail?: string;
    targetType?: ImpersonationTargetType;
    targetId?: string;
    reason?: string;
    actor?: string;
  },
): ImpersonationSession | null {
  if (!meta?.active || !meta.id) return null;
  const scope = fromWireImpersonationScope(meta.scope) ?? "read-only";
  const expiresAt = meta.expiresAt?.trim();
  if (!expiresAt) return null;
  const now = new Date();
  const exp = new Date(expiresAt);
  if (!Number.isFinite(exp.getTime()) || exp.getTime() <= now.getTime()) {
    return null;
  }
  const ttlMs = exp.getTime() - now.getTime();
  const ttlMinutesRaw = Math.ceil(ttlMs / 60_000);
  const ttlMinutes = ([15, 30, 60] as const).includes(
    ttlMinutesRaw as 15 | 30 | 60,
  )
    ? (ttlMinutesRaw as 15 | 30 | 60)
    : ttlMinutesRaw <= 15
      ? 15
      : ttlMinutesRaw <= 30
        ? 30
        : 60;
  const targetId =
    extras?.targetId?.trim() ||
    // Subject is the effective target on derived session; caller may pass claims.subjectId.
    "target";
  const emailCandidate = extras?.targetEmail?.trim();
  const emailOk =
    emailCandidate &&
    emailCandidate.includes("@") &&
    emailCandidate.length < 320
      ? emailCandidate
      : undefined;
  const parsed = impersonationSessionSchema.safeParse({
    version: 1,
    sessionId: meta.id,
    targetId,
    targetName: extras?.targetName?.trim() || targetId,
    ...(emailOk ? { targetEmail: emailOk } : {}),
    targetType: extras?.targetType ?? "user",
    scope,
    reason:
      extras?.reason?.trim() && extras.reason.trim().length >= 12
        ? extras.reason.trim()
        : "Server-issued support impersonation",
    ttlMinutes,
    startedAt: now.toISOString(),
    expiresAt: exp.toISOString(),
    actor: extras?.actor?.trim() || meta.actorId || "admin",
    serverIssued: true,
  });
  return parsed.success ? parsed.data : null;
}

/** Map start API data → view session (for redirect/banner; not storage authority). */
export function mapServerStartToSession(
  data: ImpersonationStartDataDto,
  input: {
    targetId: string;
    targetName: string;
    targetEmail?: string;
    targetType: ImpersonationTargetType;
    uiScope: ImpersonationScope;
    reason: string;
    ttlMinutes: 15 | 30 | 60;
    actor?: string;
  },
): ImpersonationSession {
  const banner = data.banner;
  const scope =
    fromWireImpersonationScope(banner?.scope ?? data.scope) ?? input.uiScope;
  const expiresAt = banner?.expiresAt ?? data.expiresAt;
  const startedAt = banner?.startedAt ?? new Date().toISOString();
  const sessionId = banner?.sessionId ?? data.sessionId;
  const targetId = banner?.targetUserId ?? data.targetUserId ?? input.targetId;
  const parsed = impersonationSessionSchema.safeParse({
    version: 1,
    sessionId,
    targetId:
      input.targetType === "merchant" ? input.targetId : targetId,
    targetName: banner?.targetName?.trim() || input.targetName,
    ...(banner?.targetEmail || input.targetEmail
      ? { targetEmail: banner?.targetEmail || input.targetEmail }
      : {}),
    targetType: input.targetType,
    scope,
    reason: (banner?.reason || input.reason).trim(),
    ttlMinutes: input.ttlMinutes,
    startedAt:
      typeof startedAt === "string" && startedAt.includes("T")
        ? new Date(startedAt).toISOString()
        : new Date().toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    actor: banner?.actorAdminId || data.actorAdminId || input.actor || "admin",
    serverIssued: true,
  });
  if (!parsed.success) {
    // Fail closed to a minimal valid view from known wire fields.
    return {
      version: 1,
      sessionId: data.sessionId,
      targetId: input.targetId,
      targetName: input.targetName,
      targetType: input.targetType,
      scope: input.uiScope,
      reason: input.reason.trim(),
      ttlMinutes: input.ttlMinutes,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(data.expiresAt).toISOString(),
      actor: data.actorAdminId,
      serverIssued: true,
    };
  }
  return parsed.data;
}

function sessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function isValidImpersonationReason(reason: string) {
  return reason.trim().length >= 12 && reason.trim().length <= 500;
}

export function isAllowedImpersonationTtl(
  ttl: number,
): ttl is (typeof IMPERSONATION_TTLS)[number] {
  return IMPERSONATION_TTLS.includes(
    ttl as (typeof IMPERSONATION_TTLS)[number],
  );
}

export function createImpersonationSession(input: {
  targetId: string;
  targetName: string;
  targetEmail?: string;
  targetType?: ImpersonationTargetType;
  scope: ImpersonationScope;
  reason: string;
  ttlMinutes: number;
  actor?: string;
  now?: Date;
}): ImpersonationSession | null {
  const reason = input.reason.trim();
  if (!input.targetId || !input.targetName) return null;
  if (!isValidImpersonationReason(reason)) return null;
  if (!isAllowedImpersonationTtl(input.ttlMinutes)) return null;
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60 * 1000);
  const parsed = impersonationSessionSchema.safeParse({
    version: 1,
    sessionId: createSessionId(),
    targetId: input.targetId,
    targetName: input.targetName,
    ...(input.targetEmail ? { targetEmail: input.targetEmail } : {}),
    targetType: input.targetType ?? "merchant",
    scope: input.scope,
    reason,
    ttlMinutes: input.ttlMinutes,
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    actor: input.actor ?? "admin@fersaku.id",
  });
  return parsed.success ? parsed.data : null;
}

export function persistImpersonationSession(session: ImpersonationSession) {
  const storage = sessionStorage();
  if (!storage) return false;
  try {
    storage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function readImpersonationSession() {
  const storage = sessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = impersonationSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isImpersonationSessionActive(
  session: ImpersonationSession,
  now: number | Date = Date.now(),
) {
  const timestamp = now instanceof Date ? now.getTime() : now;
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > timestamp;
}

export function readActiveImpersonationSession(input: {
  sessionId: string | null;
  targetId: string | null;
}) {
  if (!input.sessionId || !input.targetId) return null;
  const session = readImpersonationSession();
  if (!session) return null;
  if (
    session.sessionId !== input.sessionId ||
    session.targetId !== input.targetId
  ) {
    return null;
  }
  return isImpersonationSessionActive(session) ? session : null;
}

export function clearImpersonationSession() {
  const storage = sessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(IMPERSONATION_STORAGE_KEY);
  } catch {
    // Storage can be disabled by the browser; query cleanup still proceeds.
  }
}
