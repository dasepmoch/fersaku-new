/**
 * INT-120 — optional SSR session read via INT-110 serverApiRequest.
 * Server Components / layouts can await this before private render.
 *
 * Does not store CSRF (browser owns INT-130 memory after hydrate).
 */

import "server-only";

import { serverApiRequest } from "@/shared/api/server-http-client";
import {
  authSessionEnvelopeSchema,
  type AuthSessionDataDto,
} from "@/shared/api/schemas";
import { ApiError } from "@/shared/api/api-error";
import { getDomainSource } from "@/shared/data/domain-source";
import {
  createMockClaims,
  mapAuthSessionToClaims,
  type SessionClaims,
  type SessionSurface,
} from "./session-model";
import { decideRouteGuard } from "./guards";
import type { SessionSnapshot } from "./session-model";
import { redirect } from "next/navigation";
import { buildLoginHref, loginPathForSurface } from "./return-to";

export type ServerSessionResult =
  | { ok: true; claims: SessionClaims }
  | { ok: false; kind: "anonymous" | "expired" | "error" | "mock"; code?: string };

/**
 * Read current session on the server. Mock domain returns prototype claims.
 */
export async function readServerSession(options?: {
  mockSurface?: SessionSurface;
}): Promise<ServerSessionResult> {
  let source: "mock" | "api" | "disabled";
  try {
    source = getDomainSource("auth");
  } catch {
    source = "mock";
  }

  if (source === "disabled") {
    return { ok: false, kind: "anonymous", code: "DOMAIN_DISABLED" };
  }

  if (source === "mock") {
    const surface = options?.mockSurface ?? "buyer";
    return { ok: true, claims: createMockClaims(surface) };
  }

  try {
    const envelope = await serverApiRequest<{
      data: AuthSessionDataDto;
      meta: { requestId: string; timestamp: string };
    }>("/v1/auth/session", {
      method: "GET",
      schema: authSessionEnvelopeSchema,
      privacy: "private",
    });
    const claims = mapAuthSessionToClaims(envelope.data, "api");
    if (!claims) {
      return { ok: false, kind: "error", code: "SESSION_CLAIMS_INVALID" };
    }
    return { ok: true, claims };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return {
          ok: false,
          kind:
            error.code === "AUTH_SESSION_EXPIRED" ? "expired" : "anonymous",
          code: error.code,
        };
      }
      return { ok: false, kind: "error", code: error.code };
    }
    return { ok: false, kind: "error", code: "NETWORK_ERROR" };
  }
}

function toSnapshot(result: ServerSessionResult): SessionSnapshot {
  if (result.ok) {
    return {
      status: "authenticated",
      claims: result.claims,
      errorCode: null,
    };
  }
  return {
    status: result.kind === "expired" ? "expired" : "anonymous",
    claims: null,
    errorCode: result.code ?? null,
  };
}

/**
 * Fail-closed private layout helper: redirect when session missing/wrong surface.
 */
export async function requireServerSession(
  surface: SessionSurface,
  options?: { pathname?: string; search?: string },
): Promise<SessionClaims> {
  const result = await readServerSession({ mockSurface: surface });
  const pathname = options?.pathname ?? homeFallback(surface);
  const snapshot = toSnapshot(result);
  const decision = decideRouteGuard({
    pathname,
    search: options?.search,
    snapshot,
    requiredSurface: surface,
  });

  if (decision.action === "redirect") {
    redirect(decision.href);
  }
  if (decision.action === "wait") {
    // Server has no loading state — treat as missing.
    redirect(buildLoginHref(surface, pathname));
  }
  if (!result.ok) {
    redirect(loginPathForSurface(surface));
  }
  return result.claims;
}

function homeFallback(surface: SessionSurface): string {
  if (surface === "admin") return "/admin";
  if (surface === "seller") return "/dashboard";
  return "/account/purchases";
}
