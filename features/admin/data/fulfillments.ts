/**
 * ADM-320 — admin fulfillment list/detail (fulfillment.read).
 * Redacted delivery grant projections; no secrets.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminFulfillmentEnvelopeSchema,
  adminFulfillmentListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminBoundedList,
  AdminFulfillment,
  AdminListFilters,
} from "./contracts";
import {
  adminListQueryParams,
  mapAdminFulfillmentDto,
  mapAdminListPage,
  normalizeAdminListFilters,
} from "./mappers";

type ListEnvelope = z.infer<typeof adminFulfillmentListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof adminFulfillmentEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

const MOCK_ROWS: AdminFulfillment[] = [
  {
    id: "dlv_92841",
    order: "FRS-240712-1842",
    merchant: "Asep AI Tools",
    type: "Download",
    target: "AI Prompt Pack",
    status: "Fulfilled",
    attempts: 1,
    time: "14:33:23",
  },
  {
    id: "dlv_92840",
    order: "FRS-240712-1839",
    merchant: "Digital Supply ID",
    type: "Credentials",
    target: "Canva Pro Team",
    status: "Fulfilled",
    attempts: 1,
    time: "14:31:18",
  },
  {
    id: "dlv_92836",
    order: "FRS-240712-1834",
    merchant: "KodeKita",
    type: "Stock code",
    target: "Steam Wallet",
    status: "Failed",
    attempts: 3,
    time: "14:24:01",
  },
  {
    id: "dlv_92831",
    order: "FRS-240712-1821",
    merchant: "DesignKit Studio",
    type: "Protected link",
    target: "Figma Landing Kit",
    status: "Pending",
    attempts: 0,
    time: "14:18:44",
  },
];

export function demoAdminFulfillments(): AdminFulfillment[] {
  return MOCK_ROWS.map((row) => ({ ...row }));
}

function mockFulfillmentPage(
  filters: AdminListFilters = {},
): AdminBoundedList<AdminFulfillment> {
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
  );
  let rows = demoAdminFulfillments();
  if (filters.status?.trim()) {
    const status = filters.status.trim().toLowerCase();
    rows = rows.filter((r) => r.status.toLowerCase() === status);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.order.toLowerCase().includes(q) ||
        r.merchant.toLowerCase().includes(q) ||
        r.target.toLowerCase().includes(q),
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

export async function listAdminFulfillments(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminFulfillment[]> {
  const page = await listAdminFulfillmentsPage(filters, signal);
  return page.items;
}

export async function listAdminFulfillmentsPage(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBoundedList<AdminFulfillment>> {
  if (shouldUseMockFixtures("adminRead")) return mockFulfillmentPage(filters);

  const normalized = normalizeAdminListFilters(filters);
  const response = await apiRequest<ListEnvelope>("/v1/admin/fulfillments", {
    schema: adminFulfillmentListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit:
        (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  return mapAdminListPage(
    response.data,
    response.meta,
    mapAdminFulfillmentDto,
  );
}

export async function getAdminFulfillment(
  deliveryId: string,
  signal?: AbortSignal,
): Promise<AdminFulfillment | null> {
  if (shouldUseMockFixtures("adminRead")) {
    return (
      demoAdminFulfillments().find((r) => r.id === deliveryId) || null
    );
  }

  const response = await apiRequest<DetailEnvelope>(
    `/v1/admin/fulfillments/${encodeURIComponent(deliveryId)}`,
    {
      schema: adminFulfillmentEnvelopeSchema,
      signal,
    },
  );
  return mapAdminFulfillmentDto(response.data);
}
