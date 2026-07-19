/**
 * ADM-300 — admin payment list/detail + mismatch evidence (payments.read).
 * List foundation from ADM-120; detail + mismatches + source filter here.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminPaymentEnvelopeSchema,
  adminPaymentListEnvelopeSchema,
  adminPaymentMismatchListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminBoundedList,
  AdminListFilters,
  AdminPaymentIntent,
  AdminPaymentMismatch,
} from "./contracts";
import {
  adminListQueryParams,
  mapAdminListPage,
  mapAdminPaymentDto,
  mapAdminPaymentMismatchDto,
  normalizeAdminListFilters,
} from "./mappers";
import { mockPayments } from "./mock";
import { demoPaymentMismatches } from "@/features/admin/operations/payment-mismatch";

type ListEnvelope = z.infer<typeof adminPaymentListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof adminPaymentEnvelopeSchema>;
type MismatchEnvelope = z.infer<typeof adminPaymentMismatchListEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export function demoPayments(): AdminPaymentIntent[] {
  return mockPayments();
}

export function demoPaymentMismatchRows(): AdminPaymentMismatch[] {
  return demoPaymentMismatches.map((m) => ({
    id: m.id,
    paymentIntentId: m.paymentIntentId,
    orderId: m.orderId,
    merchant: m.merchant,
    amount: m.amount,
    provider: m.provider,
    providerStatus: m.providerStatus,
    localStatus: m.localStatus,
    age: m.age,
    attempts: m.attempts,
    observedAt: m.observedAt,
  }));
}

function mockPaymentPage(
  filters: AdminListFilters = {},
): AdminBoundedList<AdminPaymentIntent> {
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
  );
  let rows = demoPayments();
  if (filters.source?.trim()) {
    const source = filters.source.trim();
    // BE rejects MIXED on payments list; mock mirrors fail-closed empty.
    if (source === "MIXED") {
      rows = [];
    } else {
      rows = rows.filter((p) => p.source === source);
    }
  }
  if (filters.status?.trim()) {
    const status = filters.status.trim().toLowerCase();
    rows = rows.filter((p) => p.status.toLowerCase() === status);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.providerRef.toLowerCase().includes(q) ||
        p.merchant.toLowerCase().includes(q),
    );
  }
  return {
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
    nextCursor: null,
    asOf: MOCK_AS_OF,
    totalCount: rows.length,
  };
}

export async function listPayments(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminPaymentIntent[]> {
  const page = await listPaymentsPage(filters, signal);
  return page.items;
}

export async function listPaymentsPage(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBoundedList<AdminPaymentIntent>> {
  if (shouldUseMockFixtures("adminRead")) return mockPaymentPage(filters);

  const normalized = normalizeAdminListFilters(filters);
  // Never send MIXED to BE (400); empty result instead.
  if (normalized.source === "MIXED") {
    return {
      items: [],
      hasMore: false,
      nextCursor: null,
      asOf: new Date().toISOString(),
      totalCount: 0,
    };
  }

  const response = await apiRequest<ListEnvelope>("/v1/admin/payments", {
    schema: adminPaymentListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit:
        (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  return mapAdminListPage(response.data, response.meta, mapAdminPaymentDto);
}

export async function getPayment(
  paymentIntentId: string,
  signal?: AbortSignal,
): Promise<AdminPaymentIntent | null> {
  if (!paymentIntentId) return null;
  if (shouldUseMockFixtures("adminRead")) {
    return demoPayments().find((p) => p.id === paymentIntentId) || null;
  }

  const response = await apiRequest<DetailEnvelope>(
    `/v1/admin/payments/${encodeURIComponent(paymentIntentId)}`,
    {
      schema: adminPaymentEnvelopeSchema,
      signal,
    },
  );
  return mapAdminPaymentDto(response.data);
}

/**
 * GET /v1/admin/payment-mismatches — read-only evidence (payments.read).
 * Empty list is success (aligned state).
 */
export async function listPaymentMismatches(
  signal?: AbortSignal,
): Promise<AdminPaymentMismatch[]> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoPaymentMismatchRows();
  }

  const response = await apiRequest<MismatchEnvelope>(
    "/v1/admin/payment-mismatches",
    {
      schema: adminPaymentMismatchListEnvelopeSchema,
      query: { limit: ADMIN_LIST_DEFAULT_LIMIT },
      signal,
    },
  );
  return (response.data.items ?? []).map(mapAdminPaymentMismatchDto);
}
