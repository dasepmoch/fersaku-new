/**
 * ADM-200 — admin merchant list/detail read (merchants.read).
 * Builds on ADM-120 foundation: schema/mapper/query keys + bounded list.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminMerchantEnvelopeSchema,
  adminMerchantListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminBoundedList, AdminListFilters, AdminMerchant } from "./contracts";
import {
  adminListQueryParams,
  mapAdminListPage,
  mapAdminMerchantDto,
  normalizeAdminListFilters,
} from "./mappers";
import { mockMerchants } from "./mock";

type ListEnvelope = z.infer<typeof adminMerchantListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof adminMerchantEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export function demoMerchants(): AdminMerchant[] {
  return mockMerchants();
}

function mockMerchantPage(
  filters: AdminListFilters = {},
): AdminBoundedList<AdminMerchant> {
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
  );
  let rows = demoMerchants();
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.owner.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
    );
  }
  if (filters.status?.trim()) {
    const status = filters.status.trim().toLowerCase();
    rows = rows.filter((m) => m.status.toLowerCase() === status);
  }
  return {
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
    nextCursor: null,
    asOf: MOCK_AS_OF,
    totalCount: rows.length,
  };
}

export async function listMerchants(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminMerchant[]> {
  const page = await listMerchantsPage(filters, signal);
  return page.items;
}

export async function listMerchantsPage(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBoundedList<AdminMerchant>> {
  if (shouldUseMockFixtures("adminRead")) return mockMerchantPage(filters);

  const normalized = normalizeAdminListFilters(filters);
  const response = await apiRequest<ListEnvelope>("/v1/admin/merchants", {
    schema: adminMerchantListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit: (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  return mapAdminListPage(response.data, response.meta, mapAdminMerchantDto);
}

export async function getMerchant(
  merchantId: string,
  signal?: AbortSignal,
): Promise<AdminMerchant | null> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoMerchants().find((m) => m.id === merchantId) || null;
  }

  const response = await apiRequest<DetailEnvelope>(
    `/v1/admin/merchants/${encodeURIComponent(merchantId)}`,
    {
      schema: adminMerchantEnvelopeSchema,
      signal,
    },
  );
  return mapAdminMerchantDto(response.data);
}
