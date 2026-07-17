/**
 * ADM-120 — admin review list read foundation (reviews.read).
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminReviewListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminBoundedList, AdminListFilters, AdminReview } from "./contracts";
import {
  adminListQueryParams,
  mapAdminListPage,
  mapAdminReviewDto,
  normalizeAdminListFilters,
} from "./mappers";
import { mockReviews } from "./mock";

type ListEnvelope = z.infer<typeof adminReviewListEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export function demoAdminReviews(): AdminReview[] {
  return mockReviews();
}

function mockReviewPage(
  filters: AdminListFilters = {},
): AdminBoundedList<AdminReview> {
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
  );
  const rows = demoAdminReviews();
  return {
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
    nextCursor: null,
    asOf: MOCK_AS_OF,
    totalCount: rows.length,
  };
}

export async function listAdminReviews(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminReview[]> {
  const page = await listAdminReviewsPage(filters, signal);
  return page.items;
}

export async function listAdminReviewsPage(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBoundedList<AdminReview>> {
  if (shouldUseMockFixtures("adminRead")) return mockReviewPage(filters);

  const normalized = normalizeAdminListFilters(filters);
  const response = await apiRequest<ListEnvelope>("/v1/admin/reviews", {
    schema: adminReviewListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit: (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  return mapAdminListPage(response.data, response.meta, mapAdminReviewDto);
}
