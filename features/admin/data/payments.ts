/**
 * ADM-120 — admin payment list read foundation (payments.read).
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminPaymentListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminBoundedList,
  AdminListFilters,
  AdminPaymentIntent,
} from "./contracts";
import {
  adminListQueryParams,
  mapAdminListPage,
  mapAdminPaymentDto,
  normalizeAdminListFilters,
} from "./mappers";
import { mockPayments } from "./mock";

type ListEnvelope = z.infer<typeof adminPaymentListEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export function demoPayments(): AdminPaymentIntent[] {
  return mockPayments();
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
    rows = rows.filter((p) => p.source === source);
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
  const response = await apiRequest<ListEnvelope>("/v1/admin/payments", {
    schema: adminPaymentListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit: (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  return mapAdminListPage(response.data, response.meta, mapAdminPaymentDto);
}
