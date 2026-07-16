"use client";

import { z } from "zod";

export const IMPERSONATION_STORAGE_KEY = "fersaku-impersonation-session-v1";
export const IMPERSONATION_SCOPES = ["read-only", "support-write"] as const;
export const IMPERSONATION_TTLS = [15, 30, 60] as const;

export type ImpersonationScope = (typeof IMPERSONATION_SCOPES)[number];
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
});

export type ImpersonationSession = z.infer<typeof impersonationSessionSchema>;

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
