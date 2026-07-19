/**
 * ADM-300 — admin order list/detail read (orders.read).
 * Commands: order-payment-commands (resend / provider-lookup).
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminOrderEnvelopeSchema,
  adminOrderListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminBoundedList,
  AdminListFilters,
  AdminOrder,
} from "./contracts";
import {
  adminListQueryParams,
  mapAdminListPage,
  mapAdminOrderDto,
  normalizeAdminListFilters,
} from "./mappers";
import { mockOrders } from "./mock";

type ListEnvelope = z.infer<typeof adminOrderListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof adminOrderEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export function demoAdminOrders(): AdminOrder[] {
  return mockOrders();
}

function mockOrderPage(
  filters: AdminListFilters = {},
): AdminBoundedList<AdminOrder> {
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
  );
  let rows = demoAdminOrders();
  if (filters.status?.trim()) {
    const status = filters.status.trim().toLowerCase();
    rows = rows.filter((o) => o.status.toLowerCase() === status);
  }
  if (filters.source?.trim()) {
    const source = filters.source.trim();
    rows = rows.filter((o) => o.source === source);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q) ||
        o.store.toLowerCase().includes(q) ||
        o.product.toLowerCase().includes(q),
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

export async function listAdminOrders(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminOrder[]> {
  const page = await listAdminOrdersPage(filters, signal);
  return page.items;
}

export async function listAdminOrdersPage(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBoundedList<AdminOrder>> {
  if (shouldUseMockFixtures("adminRead")) return mockOrderPage(filters);

  const normalized = normalizeAdminListFilters(filters);
  const response = await apiRequest<ListEnvelope>("/v1/admin/orders", {
    schema: adminOrderListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit:
        (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  return mapAdminListPage(response.data, response.meta, mapAdminOrderDto);
}

export async function getAdminOrder(
  orderId: string,
  signal?: AbortSignal,
): Promise<AdminOrder | null> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoAdminOrders().find((o) => o.id === orderId) || null;
  }

  const response = await apiRequest<DetailEnvelope>(
    `/v1/admin/orders/${encodeURIComponent(orderId)}`,
    {
      schema: adminOrderEnvelopeSchema,
      signal,
    },
  );
  return mapAdminOrderDto(response.data);
}
