import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { BuilderConfig } from "./types";

export type PublishStorefrontInput = {
  storeId: string;
  config: BuilderConfig;
  logoStyle: "letter" | "spark" | "image";
  reason?: string;
  idempotencyKey?: string;
};

export type PublishStorefrontResult = {
  accepted: boolean;
  revision: number;
  requestId: string;
};

export async function publishStorefrontDraft(
  input: PublishStorefrontInput,
  signal?: AbortSignal,
): Promise<PublishStorefrontResult> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return {
      accepted: true,
      revision: 14,
      requestId: "mock_storefront_publish_001",
    };
  }

  const response = await apiRequest<
    ApiEnvelope<PublishStorefrontResult>,
    PublishStorefrontInput
  >(`/v1/stores/${input.storeId}/storefront/publish`, {
    schema: structuralEnvelopeSchema,
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
    auditReason: input.reason,
  });
  return response.data;
}
