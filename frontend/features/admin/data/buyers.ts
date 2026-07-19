/**
 * ADM-210 — admin buyer support surface (list/detail/purchases/sessions).
 * Builds on ADM-120 read foundation; permission buyers.read.
 * Delivery secrets and magic-link tokens are never part of these projections.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  adminBuyerEnvelopeSchema,
  adminBuyerListEnvelopeSchema,
  adminBuyerPurchaseListEnvelopeSchema,
  adminBuyerSessionListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminBoundedList,
  AdminBuyer,
  AdminBuyerPurchase,
  AdminBuyerSession,
  AdminListFilters,
} from "./contracts";
import {
  adminListQueryParams,
  assertNoSecretsInAdminBuyerProjection,
  mapAdminBuyerDto,
  mapAdminBuyerPurchaseDto,
  mapAdminBuyerSessionDto,
  mapAdminListPage,
  normalizeAdminListFilters,
} from "./mappers";
import { mockBuyerPurchases, mockBuyerSessions } from "./mock";

type ListEnvelope = z.infer<typeof adminBuyerListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof adminBuyerEnvelopeSchema>;
type PurchaseEnvelope = z.infer<typeof adminBuyerPurchaseListEnvelopeSchema>;
type SessionEnvelope = z.infer<typeof adminBuyerSessionListEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

/** Deterministic buyer fixtures used by the admin buyers console. */
export function demoBuyers(): AdminBuyer[] {
  return [
    {
      id: "byr_91K2",
      name: "Nadia Putri",
      email: "nadia@studio.id",
      verified: "Verified",
      purchases: 4,
      spent: 395000,
      sessions: 3,
      last: "Now",
    },
    {
      id: "byr_91J8",
      name: "Rizky Hidayat",
      email: "rizky@gmail.com",
      verified: "Verified",
      purchases: 7,
      spent: 842000,
      sessions: 1,
      last: "8m ago",
    },
    {
      id: "byr_90X4",
      name: "Dimas Ardi",
      email: "dimas@hey.com",
      verified: "Pending",
      purchases: 1,
      spent: 59000,
      sessions: 0,
      last: "21m ago",
    },
    {
      id: "byr_90W1",
      name: "Sinta Maharani",
      email: "sinta@mail.id",
      verified: "Verified",
      purchases: 3,
      spent: 218000,
      sessions: 2,
      last: "1h ago",
    },
    {
      id: "byr_90V7",
      name: "Fajar Nugroho",
      email: "fajar@hey.com",
      verified: "Verified",
      purchases: 12,
      spent: 1540000,
      sessions: 4,
      last: "3h ago",
    },
    {
      id: "byr_90U2",
      name: "Laras Ayu",
      email: "laras@studio.id",
      verified: "Pending",
      purchases: 0,
      spent: 0,
      sessions: 1,
      last: "5h ago",
    },
  ];
}

function mockBuyerPage(
  filters: AdminListFilters = {},
): AdminBoundedList<AdminBuyer> {
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
  );
  let rows = demoBuyers();
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q),
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

export async function listBuyers(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBuyer[]> {
  const page = await listBuyersPage(filters, signal);
  return page.items;
}

export async function listBuyersPage(
  filters: AdminListFilters = {},
  signal?: AbortSignal,
): Promise<AdminBoundedList<AdminBuyer>> {
  if (shouldUseMockFixtures("adminRead")) return mockBuyerPage(filters);

  const normalized = normalizeAdminListFilters(filters);
  const response = await apiRequest<ListEnvelope>("/v1/admin/buyers", {
    schema: adminBuyerListEnvelopeSchema,
    query: {
      ...adminListQueryParams(filters),
      limit: (normalized.limit as number | undefined) ?? ADMIN_LIST_DEFAULT_LIMIT,
    },
    signal,
  });
  const page = mapAdminListPage(response.data, response.meta, mapAdminBuyerDto);
  assertNoSecretsInAdminBuyerProjection(page.items);
  return page;
}

export async function getBuyer(
  buyerId: string,
  signal?: AbortSignal,
): Promise<AdminBuyer | null> {
  if (!buyerId) return null;
  if (shouldUseMockFixtures("adminRead")) {
    return demoBuyers().find((b) => b.id === buyerId) || null;
  }

  const response = await apiRequest<DetailEnvelope>(
    `/v1/admin/buyers/${encodeURIComponent(buyerId)}`,
    {
      schema: adminBuyerEnvelopeSchema,
      signal,
    },
  );
  const buyer = mapAdminBuyerDto(response.data);
  assertNoSecretsInAdminBuyerProjection(buyer);
  return buyer;
}

/** Admin-scoped purchase projection; delivery secrets are not part of it. */
export function demoBuyerPurchases(): AdminBuyerPurchase[] {
  return mockBuyerPurchases();
}

export function demoBuyerSessions(): AdminBuyerSession[] {
  return mockBuyerSessions();
}

export async function listBuyerPurchases(
  buyerId: string,
  signal?: AbortSignal,
): Promise<AdminBuyerPurchase[]> {
  if (!buyerId) return [];
  if (shouldUseMockFixtures("adminRead")) {
    const rows = demoBuyerPurchases();
    assertNoSecretsInAdminBuyerProjection(rows);
    return rows;
  }
  const response = await apiRequest<PurchaseEnvelope>(
    `/v1/admin/buyers/${encodeURIComponent(buyerId)}/purchases`,
    {
      schema: adminBuyerPurchaseListEnvelopeSchema,
      query: { limit: ADMIN_LIST_DEFAULT_LIMIT },
      signal,
    },
  );
  const rows = response.data.map(mapAdminBuyerPurchaseDto);
  assertNoSecretsInAdminBuyerProjection(rows);
  return rows;
}

export async function listBuyerSessions(
  buyerId: string,
  signal?: AbortSignal,
): Promise<AdminBuyerSession[]> {
  if (!buyerId) return [];
  if (shouldUseMockFixtures("adminRead")) return demoBuyerSessions();
  const response = await apiRequest<SessionEnvelope>(
    `/v1/admin/buyers/${encodeURIComponent(buyerId)}/sessions`,
    {
      schema: adminBuyerSessionListEnvelopeSchema,
      query: { limit: ADMIN_LIST_DEFAULT_LIMIT },
      signal,
    },
  );
  const rows = response.data.map(mapAdminBuyerSessionDto);
  assertNoSecretsInAdminBuyerProjection(rows);
  return rows;
}
