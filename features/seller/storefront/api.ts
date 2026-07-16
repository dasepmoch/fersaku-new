import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
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
  if (!isLiveApi()) {
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
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
    auditReason: input.reason,
  });
  return response.data;
}
