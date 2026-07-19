/**
 * CHK-150 — browser invoice adapters (ownership + public verify).
 * Private invoice: session cookie only (no guest capability exchange advertised).
 * Public verify: GET path code or POST body token — never logs raw token.
 */

import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  invoiceEnvelopeSchema,
  publicInvoiceVerifyEnvelopeSchema,
  type InvoiceDto,
  type PublicInvoiceVerifyDto,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type { InvoiceProjection, InvoiceVerifyResult } from "./contracts";
import {
  buildMockInvoiceProjection,
  buildMockInvoiceVerify,
  mapInvoiceDto,
  mapPublicInvoiceVerifyDto,
} from "./mappers";

export type GetInvoiceOptions = {
  signal?: AbortSignal;
};

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

/** Buyer purchase domain gate. */
export function isBuyerInvoiceApiDomain(): boolean {
  return getDomainSource("buyer") === "api";
}

/** Order/checkout invoice domain gate. */
export function isOrderInvoiceApiDomain(): boolean {
  return getDomainSource("checkout") === "api";
}

/** Public verify uses checkout domain (same public surface as order). */
export function isInvoiceVerifyApiDomain(): boolean {
  return getDomainSource("checkout") === "api";
}

/**
 * Buyer-owned invoice: GET /v1/buyer/purchases/{orderId}/invoice
 * Foreign → null (safe 404). 401 rethrows for login-gate.
 */
export async function getBuyerInvoice(
  orderId: string,
  options?: GetInvoiceOptions,
): Promise<InvoiceProjection | null> {
  const id = orderId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("buyer")) {
    return buildMockInvoiceProjection({ orderId: id, surface: "buyer" });
  }

  try {
    const response = await apiRequest<{ data: InvoiceDto }>(
      `/v1/buyer/purchases/${encodeURIComponent(id)}/invoice`,
      {
        schema: invoiceEnvelopeSchema,
        method: "GET",
        signal: options?.signal,
      },
    );
    return mapInvoiceDto(response.data, { surface: "buyer" });
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Order-scoped invoice (session owner/seller/admin): GET /v1/orders/{orderId}/invoice
 * No guest capability header advertised — unauthenticated guests must login-gate.
 */
export async function getOrderInvoice(
  orderId: string,
  options?: GetInvoiceOptions,
): Promise<InvoiceProjection | null> {
  const id = orderId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("checkout")) {
    return buildMockInvoiceProjection({ orderId: id, surface: "order" });
  }

  try {
    const response = await apiRequest<{ data: InvoiceDto }>(
      `/v1/orders/${encodeURIComponent(id)}/invoice`,
      {
        schema: invoiceEnvelopeSchema,
        method: "GET",
        signal: options?.signal,
      },
    );
    return mapInvoiceDto(response.data, { surface: "order" });
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Public verify by path code: GET /v1/invoices/verify/{code}
 * Invalid → { valid: false }. Never fabricates valid invoice.
 * Token is path segment for BE public code — do not log.
 */
export async function verifyInvoiceByCode(
  code: string,
  options?: GetInvoiceOptions,
): Promise<InvoiceVerifyResult> {
  const raw = code.trim();
  if (!raw) return { valid: false };

  if (shouldUseMockFixtures("checkout")) {
    return buildMockInvoiceVerify(raw);
  }

  try {
    const response = await apiRequest<{ data: PublicInvoiceVerifyDto }>(
      `/v1/invoices/verify/${encodeURIComponent(raw)}`,
      {
        schema: publicInvoiceVerifyEnvelopeSchema,
        method: "GET",
        signal: options?.signal,
      },
    );
    return mapPublicInvoiceVerifyDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return { valid: false };
    throw error;
  }
}

/**
 * Public verify POST body (preferred when token must not hit access logs):
 * POST /v1/public/invoices/verify { token }
 */
export async function verifyInvoiceByTokenBody(
  token: string,
  options?: GetInvoiceOptions,
): Promise<InvoiceVerifyResult> {
  const raw = token.trim();
  if (!raw) return { valid: false };

  if (shouldUseMockFixtures("checkout")) {
    return buildMockInvoiceVerify(raw);
  }

  try {
    const response = await apiRequest<
      { data: PublicInvoiceVerifyDto },
      { token: string }
    >(`/v1/public/invoices/verify`, {
      schema: publicInvoiceVerifyEnvelopeSchema,
      method: "POST",
      body: { token: raw },
      signal: options?.signal,
    });
    return mapPublicInvoiceVerifyDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return { valid: false };
    throw error;
  }
}
