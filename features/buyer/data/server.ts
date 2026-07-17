/**
 * BUY-100 — private SSR purchase reads (cookie forward + no-store).
 * Server Components only; do not import from Client Components.
 */

import "server-only";

import type { z } from "zod";
import {
  serverApiRequest,
  rethrowForServerComponent,
} from "@/shared/api/server-http-client";
import {
  BUYER_PURCHASE_LIST_LIMIT,
  buyerPurchaseDetailEnvelopeSchema,
  buyerPurchaseListEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { BuyerPurchase } from "./contracts";
import {
  mapBuyerPurchaseDetailDto,
  mapBuyerPurchaseSummaryListDto,
} from "./mappers";
import { demoPurchases } from "./mock";

type PurchaseListEnvelope = z.infer<typeof buyerPurchaseListEnvelopeSchema>;
type PurchaseDetailEnvelope = z.infer<typeof buyerPurchaseDetailEnvelopeSchema>;

/**
 * SSR purchase detail: session cookie + no-store.
 * RESOURCE_NOT_FOUND → Next notFound(); 401/403 rethrow for guards.
 */
export async function getBuyerPurchaseServer(
  orderId: string,
): Promise<BuyerPurchase> {
  if (shouldUseMockFixtures("buyer")) {
    const found = demoPurchases().find((p) => p.orderId === orderId);
    if (!found) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    return found as BuyerPurchase;
  }

  try {
    const response = await serverApiRequest<PurchaseDetailEnvelope>(
      `/v1/buyer/purchases/${encodeURIComponent(orderId)}/`,
      {
        schema: buyerPurchaseDetailEnvelopeSchema,
        privacy: "private",
      },
    );
    return mapBuyerPurchaseDetailDto(response.data);
  } catch (error) {
    rethrowForServerComponent(error);
  }
}

/** Optional SSR list (bounded). Prefer client query for filter/search UX. */
export async function listBuyerPurchasesServer(): Promise<BuyerPurchase[]> {
  if (shouldUseMockFixtures("buyer")) return demoPurchases();

  const response = await serverApiRequest<PurchaseListEnvelope>(
    "/v1/buyer/purchases",
    {
      schema: buyerPurchaseListEnvelopeSchema,
      query: { limit: BUYER_PURCHASE_LIST_LIMIT },
      privacy: "private",
    },
  );
  return mapBuyerPurchaseSummaryListDto(response.data);
}
