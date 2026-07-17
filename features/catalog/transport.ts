/**
 * Catalog transport DTO aliases (wire only).
 * View models: ./contracts.ts — do not re-export view types from here.
 */

export type {
  CatalogProductDto,
  CatalogProductEnvelopeDto,
  CatalogProductListEnvelopeDto,
  PublicStorefrontDto,
  PublicStorefrontEnvelopeDto,
} from "@/shared/api/generated";

export type {
  OperationSuccessJson,
} from "@/shared/api/generated";

/** Pilot public catalog operations. */
export type ListFeaturedProductsResponse =
  import("@/shared/api/generated").OperationSuccessJson<"listFeaturedProducts">;
export type GetPublicStoreResponse =
  import("@/shared/api/generated").OperationSuccessJson<"getPublicStore">;
export type GetPublicProductResponse =
  import("@/shared/api/generated").OperationSuccessJson<"getPublicProduct">;
