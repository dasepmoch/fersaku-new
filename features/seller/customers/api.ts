import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  SELLER_CUSTOMER_DEFAULT_PAGE_SIZE,
  sellerCustomerDetailEnvelopeSchema,
  sellerCustomerListEnvelopeSchema,
  sellerCustomerNoteEnvelopeSchema,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  SellerCustomer,
  SellerCustomerListFilters,
  SellerCustomerPage,
} from "./contracts";
import {
  applySellerCustomerListFilters,
  mapSellerCustomerDetailDto,
  mapSellerCustomerListEnvelope,
} from "./mappers";
import { demoCustomers } from "./mock";

type ListEnvelope = z.infer<typeof sellerCustomerListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof sellerCustomerDetailEnvelopeSchema>;
type NoteEnvelope = z.infer<typeof sellerCustomerNoteEnvelopeSchema>;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

function mockPage(
  storeId: string,
  filters?: SellerCustomerListFilters,
): SellerCustomerPage {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.max(
    1,
    filters?.pageSize ?? SELLER_CUSTOMER_DEFAULT_PAGE_SIZE,
  );
  const all = applySellerCustomerListFilters(
    demoCustomers().map((c) => ({ ...c, storeId })),
    filters,
  );
  const totalCount = all.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: all.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    totalCount,
    pageCount,
  };
}

/**
 * Store-scoped seller customer list (NumberedPageList).
 * Mock path keeps client filter/page geometry; API path uses server page meta.
 */
export async function listSellerCustomers(
  storeId: string,
  filters?: SellerCustomerListFilters,
  signal?: AbortSignal,
): Promise<SellerCustomerPage> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return mockPage(storeId, filters);
  }

  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(
    50,
    Math.max(1, filters?.pageSize ?? SELLER_CUSTOMER_DEFAULT_PAGE_SIZE),
  );
  const response = await apiRequest<ListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/customers`,
    {
      schema: sellerCustomerListEnvelopeSchema,
      query: {
        page,
        pageSize,
        q: filters?.q?.trim() || undefined,
      },
      signal,
    },
  );
  return mapSellerCustomerListEnvelope(response.data, response.meta);
}

export async function getSellerCustomer(
  storeId: string,
  customerId: string,
  signal?: AbortSignal,
): Promise<SellerCustomer | null> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return demoCustomers().find((c) => c.id === customerId) || null;
  }

  try {
    const response = await apiRequest<DetailEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/customers/${encodeURIComponent(customerId)}`,
      {
        schema: sellerCustomerDetailEnvelopeSchema,
        signal,
      },
    );
    return mapSellerCustomerDetailDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/** Existing internal notes control — versioned upsert, no optimistic success. */
export async function upsertSellerCustomerNote(
  storeId: string,
  customerId: string,
  body: string,
  options?: {
    expectedVersion?: number;
    signal?: AbortSignal;
  },
): Promise<{ body: string; version: number }> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return {
      body,
      version: (options?.expectedVersion ?? 0) + 1,
    };
  }
  const response = await apiRequest<
    NoteEnvelope,
    { body: string; expectedVersion?: number }
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/customers/${encodeURIComponent(customerId)}/notes`,
    {
      schema: sellerCustomerNoteEnvelopeSchema,
      method: "PUT",
      body: {
        body,
        expectedVersion: options?.expectedVersion,
      },
      signal: options?.signal,
    },
  );
  return {
    body: response.data.body,
    version: response.data.version,
  };
}
