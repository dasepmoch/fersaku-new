/**
 * CHK-150 — SSR invoice reads (cookie forward + no-store) + public verify.
 * Server Components only; do not import from Client Components.
 *
 * Guest: order invoice requires session — 401 login-gates; no capability exchange
 * advertised on invoice GET (CHK-150 disposition).
 */

import "server-only";

import { redirect } from "next/navigation";
import {
  serverApiRequest,
  rethrowForServerComponent,
} from "@/shared/api/server-http-client";
import { ApiError } from "@/shared/api/api-error";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  invoiceEnvelopeSchema,
  publicInvoiceVerifyEnvelopeSchema,
  type InvoiceDto,
  type PublicInvoiceVerifyDto,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import { buildLoginHref } from "@/shared/auth/return-to";
import type { InvoiceProjection, InvoiceVerifyResult } from "./contracts";
import {
  buildMockInvoiceProjection,
  buildMockInvoiceVerify,
  mapInvoiceDto,
  mapPublicInvoiceVerifyDto,
} from "./mappers";

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

function isAuthRequired(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401) return true;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "session_expired";
}

/**
 * SSR buyer invoice: GET /v1/buyer/purchases/{orderId}/invoice
 * 404 → notFound(); 401 → buyer login with safe returnTo.
 */
export async function getBuyerInvoiceServer(
  orderId: string,
): Promise<InvoiceProjection> {
  const id = orderId.trim();
  if (!id) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  if (shouldUseMockFixtures("buyer")) {
    return buildMockInvoiceProjection({ orderId: id, surface: "buyer" });
  }

  const returnPath = `/account/purchases/${encodeURIComponent(id)}/invoice`;

  try {
    const response = await serverApiRequest<{ data: InvoiceDto }, never>(
      `/v1/buyer/purchases/${encodeURIComponent(id)}/invoice`,
      {
        schema: invoiceEnvelopeSchema,
        method: "GET",
        privacy: "private",
      },
    );
    return mapInvoiceDto(response.data, { surface: "buyer" });
  } catch (error) {
    if (isResourceNotFound(error)) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    if (isAuthRequired(error)) {
      redirect(buildLoginHref("buyer", returnPath));
    }
    rethrowForServerComponent(error);
  }
}

/**
 * SSR order invoice: GET /v1/orders/{orderId}/invoice
 * Guest without session → login-gate (buyer login; return under /account only
 * is restricted — use account purchases invoice path for return when possible).
 * Foreign owner → notFound().
 */
export async function getOrderInvoiceServer(
  orderId: string,
): Promise<InvoiceProjection> {
  const id = orderId.trim();
  if (!id) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  if (shouldUseMockFixtures("checkout")) {
    return buildMockInvoiceProjection({ orderId: id, surface: "order" });
  }

  // returnTo must stay under /account for buyer login allowlist.
  const returnPath = `/account/purchases/${encodeURIComponent(id)}/invoice`;

  try {
    const response = await serverApiRequest<{ data: InvoiceDto }, never>(
      `/v1/orders/${encodeURIComponent(id)}/invoice`,
      {
        schema: invoiceEnvelopeSchema,
        method: "GET",
        privacy: "private",
      },
    );
    return mapInvoiceDto(response.data, { surface: "order" });
  } catch (error) {
    if (isResourceNotFound(error)) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    if (isAuthRequired(error)) {
      redirect(buildLoginHref("buyer", returnPath));
    }
    rethrowForServerComponent(error);
  }
}

/**
 * Public SSR verify: GET /v1/invoices/verify/{code}
 * Invalid/404 → { valid: false }. No cookies required.
 * Do not log `code`.
 */
export async function verifyInvoiceServer(
  code: string,
): Promise<InvoiceVerifyResult> {
  const raw = code.trim();
  if (!raw) return { valid: false };

  if (shouldUseMockFixtures("checkout")) {
    return buildMockInvoiceVerify(raw);
  }

  try {
    const response = await serverApiRequest<
      { data: PublicInvoiceVerifyDto },
      never
    >(`/v1/invoices/verify/${encodeURIComponent(raw)}`, {
      schema: publicInvoiceVerifyEnvelopeSchema,
      method: "GET",
      privacy: "public",
      skipCookies: true,
    });
    return mapPublicInvoiceVerifyDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return { valid: false };
    // Fail closed on unexpected errors for public surface — no fabricate valid.
    if (error instanceof ApiError && error.status >= 500) {
      throw error;
    }
    return { valid: false };
  }
}
