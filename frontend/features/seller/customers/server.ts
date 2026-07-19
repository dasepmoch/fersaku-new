/**
 * SEL-260 — private SSR seller customer detail (cookie forward + no-store).
 * Server Components only; do not import from Client Components.
 */

import "server-only";

import type { z } from "zod";
import {
  rethrowForServerComponent,
  serverApiRequest,
} from "@/shared/api/server-http-client";
import {
  sellerBootstrapEnvelopeSchema,
  sellerCustomerDetailEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { SellerCustomer } from "./contracts";
import { mapSellerCustomerDetailDto } from "./mappers";
import { demoCustomers } from "./mock";

type DetailEnvelope = z.infer<typeof sellerCustomerDetailEnvelopeSchema>;
type BootstrapEnvelope = z.infer<typeof sellerBootstrapEnvelopeSchema>;

async function resolveServerStoreId(): Promise<string> {
  const response = await serverApiRequest<BootstrapEnvelope>(
    "/v1/seller/me/merchant",
    {
      schema: sellerBootstrapEnvelopeSchema,
      privacy: "private",
    },
  );
  const boot = response.data;
  return (
    boot.currentStoreId?.trim() ||
    boot.canonicalStoreId?.trim() ||
    boot.stores?.[0]?.storeId ||
    ""
  );
}

/**
 * SSR customer existence check for detail route.
 * RESOURCE_NOT_FOUND → Next notFound(); 401/403 rethrow for guards.
 */
export async function getSellerCustomerServer(
  customerId: string,
): Promise<SellerCustomer> {
  if (shouldUseMockFixtures("sellerOperations")) {
    const found = demoCustomers().find((c) => c.id === customerId);
    if (!found) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    return found as SellerCustomer;
  }

  try {
    const storeId = await resolveServerStoreId();
    if (!storeId) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const response = await serverApiRequest<DetailEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/customers/${encodeURIComponent(customerId)}`,
      {
        schema: sellerCustomerDetailEnvelopeSchema,
        privacy: "private",
      },
    );
    return mapSellerCustomerDetailDto(response.data);
  } catch (error) {
    rethrowForServerComponent(error);
  }
}
