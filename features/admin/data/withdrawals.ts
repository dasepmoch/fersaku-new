/**
 * ADM-120 — admin withdrawal list/detail read foundation (withdrawals.review).
 * Review commands remain ADM-310.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminWithdrawalEnvelopeSchema,
  adminWithdrawalListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminBoundedList,
  AdminListFilters,
  AdminWithdrawal,
} from "./contracts";
import {
  adminListQueryParams,
  mapAdminListPage,
  mapAdminWithdrawalDto,
  normalizeAdminListFilters,
} from "./mappers";
import { mockWithdrawals } from "./mock";

type ListEnvelope = z.infer<typeof adminWithdrawalListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof adminWithdrawalEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export type WithdrawalReviewTarget = "Processing" | "On hold" | "Rejected";

export function canReviewWithdrawal(
  current: AdminWithdrawal["status"],
  target: WithdrawalReviewTarget,
) {
  if (current === "Pending") return true;
  if (current === "On hold") {
    return target === "Processing" || target === "Rejected";
  }
  return false;
}

export function demoWithdrawals(): AdminWithdrawal[] {
  return mockWithdrawals();
}

function mockWithdrawalPage(
  filters: AdminListFilters = {},
): AdminBoundedList<AdminWithdrawal> {
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
  );
  let rows = demoWithdrawals();
  if (filters.status?.trim()) {
    const status = filters.status.trim().toLowerCase();
    rows = rows.filter((w) => w.status.toLowerCase() === status);
  }
  return {
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
    nextCursor: null,
    asOf: MOCK_AS_OF,
    totalCount: rows.length,
  };
}

export async function listWithdrawals(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminWithdrawal[]> {
  const page = await listWithdrawalsPage(filters, signal);
  return page.items;
}

export async function listWithdrawalsPage(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBoundedList<AdminWithdrawal>> {
  if (shouldUseMockFixtures("adminRead")) return mockWithdrawalPage(filters);

  const normalized = normalizeAdminListFilters(filters);
  const response = await apiRequest<ListEnvelope>("/v1/admin/withdrawals", {
    schema: adminWithdrawalListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit: (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  return mapAdminListPage(response.data, response.meta, mapAdminWithdrawalDto);
}

export async function getWithdrawal(
  withdrawalId: string,
  signal?: AbortSignal,
): Promise<AdminWithdrawal | null> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoWithdrawals().find((w) => w.id === withdrawalId) || null;
  }

  const response = await apiRequest<DetailEnvelope>(
    `/v1/admin/withdrawals/${encodeURIComponent(withdrawalId)}`,
    {
      schema: adminWithdrawalEnvelopeSchema,
      signal,
    },
  );
  return mapAdminWithdrawalDto(response.data);
}
