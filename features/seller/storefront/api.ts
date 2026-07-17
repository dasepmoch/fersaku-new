import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  storefrontDraftRequestSchema,
  storefrontPublishEnvelopeSchema,
  storefrontPublishRequestSchema,
  storefrontRevisionEnvelopeSchema,
  storefrontStudioEnvelopeSchema,
  type StorefrontDraftRequest,
  type StorefrontPublishRequest,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  LogoStyle,
  PublishStorefrontInput,
  PublishStorefrontResult,
  SaveStorefrontDraftInput,
  StorefrontRevisionResult,
  StorefrontStudio,
} from "./contracts";
import { initialStorefrontConfig } from "./config";
import { readStorefrontDraft } from "./draft";
import {
  mapPublishDto,
  mapRevisionDto,
  mapStudioDto,
  toStorefrontWireConfig,
} from "./mappers";

type StudioEnvelope = z.infer<typeof storefrontStudioEnvelopeSchema>;
type RevisionEnvelope = z.infer<typeof storefrontRevisionEnvelopeSchema>;
type PublishEnvelope = z.infer<typeof storefrontPublishEnvelopeSchema>;

export type {
  PublishStorefrontInput,
  PublishStorefrontResult,
  SaveStorefrontDraftInput,
  StorefrontStudio,
} from "./contracts";

export function isSellerStorefrontApiDomain(): boolean {
  return getDomainSource("sellerCatalog") === "api";
}

function mockStudio(storeId: string): StorefrontStudio {
  const draft = readStorefrontDraft();
  return {
    storeId: storeId || "store_demo_asep",
    draftRevision: 14,
    draftETag: 'W/"mock_storefront_draft_14"',
    config: draft.config,
    logoStyle: draft.logoStyle,
    publishedRevision: 13,
    publishedETag: 'W/"mock_storefront_pub_13"',
    publishedAt: null,
  };
}

/**
 * GET studio draft + published pointers.
 * Mock: localStorage draft + fixed revision 14 (snapshot parity).
 */
export async function getStorefrontStudio(
  storeId: string,
  signal?: AbortSignal,
): Promise<StorefrontStudio> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return mockStudio(storeId);
  }

  const response = await apiRequest<StudioEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/storefront`,
    {
      schema: storefrontStudioEnvelopeSchema,
      signal,
    },
  );
  return mapStudioDto(response.data);
}

/**
 * PUT draft with expectedRevision + If-Match. Coalesce callers must debounce.
 * Does not treat 409 as success; throws for conflict_preserve_draft.
 */
export async function saveStorefrontDraft(
  input: SaveStorefrontDraftInput,
  signal?: AbortSignal,
): Promise<StorefrontRevisionResult> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return {
      revision: input.expectedRevision,
      etag: input.expectedETag || 'W/"mock_storefront_draft_14"',
      status: "draft",
      config: input.config,
      logoStyle: input.logoStyle,
    };
  }

  const body: StorefrontDraftRequest = storefrontDraftRequestSchema.parse({
    config: toStorefrontWireConfig(input.config, input.logoStyle),
    expectedRevision: input.expectedRevision,
    expectedETag: input.expectedETag,
  });

  const response = await apiRequest<RevisionEnvelope, StorefrontDraftRequest>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/storefront/draft`,
    {
      method: "PUT",
      schema: storefrontRevisionEnvelopeSchema,
      body,
      signal,
      ifMatch: input.expectedETag,
    },
  );
  return mapRevisionDto(response.data);
}

/**
 * POST publish with strict body (config + expectedRevision/ETag only).
 * Idempotency key required on API path. Never optimistic success.
 */
export async function publishStorefrontDraft(
  input: PublishStorefrontInput,
  signal?: AbortSignal,
): Promise<PublishStorefrontResult> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return {
      accepted: true,
      revision: input.expectedRevision || 14,
      etag: input.expectedETag || 'W/"mock_storefront_pub_14"',
      requestId: "mock_storefront_publish_001",
      storeId: input.storeId || "store_demo_asep",
    };
  }

  const body: StorefrontPublishRequest = storefrontPublishRequestSchema.parse({
    config: toStorefrontWireConfig(input.config, input.logoStyle),
    expectedRevision: input.expectedRevision,
    expectedETag: input.expectedETag,
  });

  const response = await apiRequest<PublishEnvelope, StorefrontPublishRequest>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/storefront/publish`,
    {
      method: "POST",
      schema: storefrontPublishEnvelopeSchema,
      body,
      signal,
      ifMatch: input.expectedETag,
      idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
      auditReason: input.reason,
    },
  );
  return mapPublishDto(response.data);
}

/** Mock-only default shell for builder before local draft read. */
export function mockDefaultBuilderShell(): {
  config: typeof initialStorefrontConfig;
  logoStyle: LogoStyle;
} {
  return { config: initialStorefrontConfig, logoStyle: "letter" };
}
