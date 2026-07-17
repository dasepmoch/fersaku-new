/**
 * ADM-390 — server-issued impersonation start/terminate adapters.
 * API path: cookie session is authority; never persist raw token/session ID as client authority.
 * Mock path: local prototype session only (sessionStorage + URL binding).
 */

import { apiRequest } from "@/shared/api/http-client";
import { setCsrfToken } from "@/shared/api/csrf";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  impersonationStartEnvelopeSchema,
  impersonationTerminateEnvelopeSchema,
  type ImpersonationStartDataDto,
  type ImpersonationTerminateDataDto,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { bootstrapSession } from "@/shared/auth/session-store";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";
import {
  clearImpersonationSession,
  createImpersonationSession,
  mapServerStartToSession,
  persistImpersonationSession,
  toWireImpersonationScope,
  type ImpersonationScope,
  type ImpersonationSession,
  type ImpersonationTargetType,
} from "./session";

export type StartImpersonationInput = {
  targetId: string;
  targetName: string;
  targetEmail?: string;
  targetType: ImpersonationTargetType;
  scope: ImpersonationScope;
  reason: string;
  /** Ticket / incident ref; defaults from reason prefix when omitted. */
  ticket?: string;
  ttlMinutes: 15 | 30 | 60;
  mfaCode?: string;
  idempotencyKey?: string;
  actor?: string;
};

export type StartImpersonationResult = {
  mode: "mock" | "api";
  session: ImpersonationSession;
  /** Safe internal destination (no session id / token in URL on API path). */
  redirectPath: string;
  requestId: string;
  /** Present only on API start for diagnostics — never a raw cookie value. */
  serverSessionId?: string;
};

export type EndImpersonationInput = {
  /** Impersonation row id (server) or mock sessionId. */
  sessionId: string;
  targetType?: ImpersonationTargetType;
  targetId?: string;
  reason?: string;
  actor?: string;
};

export type EndImpersonationResult = {
  mode: "mock" | "api";
  redirectPath: string;
  status: string;
  requestId: string;
};

function isImpersonationMock(): boolean {
  return shouldUseMockFixtures("adminWrite");
}

export function isImpersonationApi(): boolean {
  try {
    return getDomainSource("adminWrite") === "api";
  } catch {
    return false;
  }
}

function extractTicket(reason: string, ticket?: string): string {
  const explicit = ticket?.trim();
  if (explicit) return explicit.slice(0, 120);
  const m = reason.match(/\b([A-Z]{2,10}-\d{2,})\b/);
  if (m?.[1]) return m[1];
  return reason.trim().slice(0, 64);
}

function safeSellerLanding(): string {
  return "/dashboard";
}

function returnPath(
  session: Pick<ImpersonationSession, "targetType" | "targetId">,
) {
  return session.targetType === "user"
    ? "/admin/users"
    : `/admin/merchants/${encodeURIComponent(session.targetId)}`;
}

function mockRedirectPath(session: ImpersonationSession): string {
  return `${safeSellerLanding()}?impersonate=${encodeURIComponent(session.targetId)}&session=${encodeURIComponent(session.sessionId)}`;
}

/**
 * Start impersonation. Mock: local session + URL. API: server cookie + bootstrap claims.
 */
export async function startImpersonation(
  input: StartImpersonationInput,
  signal?: AbortSignal,
): Promise<StartImpersonationResult> {
  const reason = input.reason.trim();
  if (!input.targetId?.trim() || !input.targetName?.trim()) {
    throw new Error("target required");
  }
  if (reason.length < 12 || reason.length > 500) {
    throw new Error("Reason must be 12–500 characters");
  }
  if (![15, 30, 60].includes(input.ttlMinutes)) {
    throw new Error("ttlMinutes must be 15, 30, or 60");
  }

  const ticket = extractTicket(reason, input.ticket);
  const idempotencyKey = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (isImpersonationMock()) {
    const session = createImpersonationSession({
      targetId: input.targetId.trim(),
      targetName: input.targetName.trim(),
      targetEmail: input.targetEmail,
      targetType: input.targetType,
      scope: input.scope,
      reason,
      ttlMinutes: input.ttlMinutes,
      actor: input.actor,
    });
    if (!session || !persistImpersonationSession(session)) {
      throw new Error("Could not create mock impersonation session");
    }
    appendClientAuditEvent({
      actor: session.actor,
      action: "impersonation.started",
      target: session.targetId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("fersaku-impersonation-updated"));
    }
    return {
      mode: "mock",
      session,
      redirectPath: mockRedirectPath(session),
      requestId: `mock_imp_start_${session.sessionId}`,
    };
  }

  const wireScope = toWireImpersonationScope(input.scope);
  const path =
    input.targetType === "user"
      ? `/v1/admin/users/${encodeURIComponent(input.targetId.trim())}/impersonation`
      : `/v1/admin/merchants/${encodeURIComponent(input.targetId.trim())}/impersonation`;

  const response = await apiRequest<
    {
      data: ImpersonationStartDataDto;
      meta: { requestId: string; timestamp: string };
    },
    {
      scope: "READ_ONLY" | "SUPPORT_WRITE";
      reason: string;
      ticket: string;
      ttlMinutes: 15 | 30 | 60;
      mfaCode?: string;
      idempotencyKey: string;
    }
  >(path, {
    method: "POST",
    schema: impersonationStartEnvelopeSchema,
    body: {
      scope: wireScope,
      reason,
      ticket,
      ttlMinutes: input.ttlMinutes,
      idempotencyKey,
      ...(input.mfaCode?.trim() ? { mfaCode: input.mfaCode.trim() } : {}),
    },
    signal,
    idempotencyKey,
    auditReason: reason,
    requireRecentMfa: true,
    ...(input.mfaCode?.trim()
      ? { recentMfaProof: input.mfaCode.trim() }
      : {}),
  });

  // Derived session cookie is HttpOnly; apply rotated CSRF only (never raw cookie).
  setCsrfToken(response.data.csrfToken);

  const session = mapServerStartToSession(response.data, {
    targetId: input.targetId.trim(),
    targetName: input.targetName.trim(),
    targetEmail: input.targetEmail,
    targetType: input.targetType,
    uiScope: input.scope,
    reason,
    ttlMinutes: input.ttlMinutes,
    actor: input.actor ?? response.data.actorAdminId,
  });

  // Do not persist server authority in sessionStorage; claims come from bootstrap.
  clearImpersonationSession();

  await bootstrapSession({ force: true });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fersaku-impersonation-updated"));
  }

  return {
    mode: "api",
    session,
    redirectPath: safeSellerLanding(),
    requestId: response.meta.requestId,
    serverSessionId: response.data.sessionId,
  };
}

/**
 * End impersonation. API: terminate derived session then re-bootstrap.
 * Mock: clear local session.
 */
export async function endImpersonation(
  input: EndImpersonationInput,
  signal?: AbortSignal,
): Promise<EndImpersonationResult> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) throw new Error("sessionId required");

  const redirectPath =
    input.targetId && input.targetType
      ? returnPath({
          targetType: input.targetType,
          targetId: input.targetId,
        })
      : input.targetId
        ? returnPath({
            targetType: input.targetType ?? "user",
            targetId: input.targetId,
          })
        : "/admin/users";

  if (isImpersonationMock()) {
    appendClientAuditEvent({
      actor: input.actor ?? "admin@fersaku.id",
      action: "impersonation.ended",
      target: input.targetId ?? sessionId,
      ip: "mock-admin-session",
      result: "Success",
      context: input.reason?.trim() || "ended",
    });
    clearImpersonationSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("fersaku-impersonation-updated"));
    }
    return {
      mode: "mock",
      redirectPath,
      status: "TERMINATED",
      requestId: `mock_imp_end_${sessionId}`,
    };
  }

  const response = await apiRequest<
    {
      data: ImpersonationTerminateDataDto;
      meta: { requestId: string; timestamp: string };
    },
    { reason?: string }
  >(`/v1/admin/impersonation/${encodeURIComponent(sessionId)}/terminate`, {
    method: "POST",
    schema: impersonationTerminateEnvelopeSchema,
    body: {
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    },
    signal,
  });

  clearImpersonationSession();

  // Force bootstrap clears private cache when impersonation identity drops.
  await bootstrapSession({ force: true });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fersaku-impersonation-updated"));
  }

  return {
    mode: "api",
    redirectPath,
    status: response.data.status,
    requestId: response.meta.requestId,
  };
}
