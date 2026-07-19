/**
 * SEL-250 — private SSR seller order detail (cookie forward + no-store).
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
  sellerOrderDetailEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { SellerOrder } from "./contracts";
import { mapSellerOrderDetailDto } from "./mappers";
import { demoOrders } from "./mock";

type DetailEnvelope = z.infer<typeof sellerOrderDetailEnvelopeSchema>;
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
 * SSR order existence check for detail route.
 * RESOURCE_NOT_FOUND → Next notFound(); 401/403 rethrow for guards.
 */
export async function getSellerOrderServer(
  orderId: string,
): Promise<SellerOrder> {
  if (shouldUseMockFixtures("sellerOperations")) {
    const found = demoOrders().find((o) => o.id === orderId);
    if (!found) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    return found as SellerOrder;
  }

  try {
    const storeId = await resolveServerStoreId();
    if (!storeId) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const response = await serverApiRequest<DetailEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
      {
        schema: sellerOrderDetailEnvelopeSchema,
        privacy: "private",
      },
    );
    return mapSellerOrderDetailDto(response.data);
  } catch (error) {
    rethrowForServerComponent(error);
  }
}
