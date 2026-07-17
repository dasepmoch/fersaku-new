import { z } from "zod";

/** RFC3339 / ISO-8601 datetime with offset (UTC preferred on wire). */
export const rfc3339TimestampSchema = z.iso.datetime({ offset: true });

/**
 * Whole-rupiah IDR as int64-safe integer. Rejects float/fractional and
 * values outside Number.MAX_SAFE_INTEGER (transport money rule INT-010).
 */
export const moneyIdrSchema = z
  .number()
  .int()
  .refine((value) => Number.isSafeInteger(value), {
    message: "MoneyIdr must be a safe integer",
  });

export const fieldViolationSchema = z.object({
  field: z.string().min(1),
  code: z.string().min(1),
  message: z.string().optional(),
});

export const apiRequestMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: rfc3339TimestampSchema,
});

/** Alias matching OpenAPI `Meta`. */
export const metaSchema = apiRequestMetaSchema;

export const cursorListMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: rfc3339TimestampSchema,
  nextCursor: z.string().nullable().optional(),
  previousCursor: z.string().nullable().optional(),
  hasMore: z.boolean(),
});

export const numberedPageListMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: rfc3339TimestampSchema,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalCount: z.number().int().min(0),
  pageCount: z.number().int().min(0),
});

export const apiProblemSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z
    .object({
      fields: z.array(fieldViolationSchema).optional(),
    })
    .catchall(z.unknown())
    .optional(),
  requestId: z.string().min(1),
});

/** Wire problem envelope: `{ problem: { ... } }` (OpenAPI ProblemEnvelope). */
export const problemEnvelopeSchema = z.object({
  problem: apiProblemSchema,
});

/** @deprecated Prefer problemEnvelopeSchema — kept for older callers. */
export const apiProblemEnvelopeSchema = problemEnvelopeSchema;

export function successEnvelopeSchema<TSchema extends z.ZodType>(
  dataSchema: TSchema,
) {
  return z.object({
    data: dataSchema,
    meta: metaSchema,
  });
}

/**
 * Structural SuccessEnvelope when domain DTO schema is not yet wired.
 * Still enforces wire shape `{ data, meta.requestId, meta.timestamp }` (INT-100).
 * Prefer domain-specific successEnvelopeSchema as mappers land.
 */
export const structuralEnvelopeSchema = successEnvelopeSchema(z.unknown());

/** Alias matching OpenAPI SuccessEnvelope helper. */
export const apiEnvelopeSchema = successEnvelopeSchema;

export function cursorListEnvelopeSchema<TSchema extends z.ZodType>(
  itemSchema: TSchema,
) {
  return z.object({
    data: z.array(itemSchema),
    meta: cursorListMetaSchema,
  });
}

export function numberedPageListEnvelopeSchema<TSchema extends z.ZodType>(
  itemSchema: TSchema,
) {
  return z.object({
    data: z.array(itemSchema),
    meta: numberedPageListMetaSchema,
  });
}

/**
 * Legacy page shape used by some mock adapters (`items` + cursors).
 * Prefer cursorListEnvelopeSchema for live OpenAPI CursorList.
 */
export function cursorPageSchema<TSchema extends z.ZodType>(schema: TSchema) {
  return z.object({
    items: z.array(schema),
    nextCursor: z.string().nullable(),
    previousCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

/** Loose cursor page inside SuccessEnvelope (legacy adapter shape). */
export const structuralCursorPageEnvelopeSchema = successEnvelopeSchema(
  cursorPageSchema(z.unknown()),
);

// --- Pilot / public + auth sample operation schemas ---

export const healthStatusSchema = z.object({
  status: z.string().min(1),
  check: z.string().min(1),
  service: z.string().optional(),
});

export const statusDataSchema = z.object({
  service: z.string().min(1),
  version: z.string().min(1),
  appEnv: z.enum(["local", "staging", "production", "test"]),
  uptimeSeconds: z.number().int(),
});

export const statusEnvelopeSchema = successEnvelopeSchema(statusDataSchema);

export const feePolicySchema = z.object({
  policyVersion: z.string().min(1),
  scope: z.literal("GLOBAL"),
  transactionPercentBps: z.number().int(),
  transactionFixedIdr: moneyIdrSchema,
  withdrawalPercentBps: z.number().int(),
  minimumWithdrawalIdr: moneyIdrSchema,
  minimumPaymentIdr: moneyIdrSchema.optional(),
  maximumPaymentIdr: moneyIdrSchema.optional(),
  checksum: z.string().optional(),
  immutable: z.boolean(),
  sourceAdr: z.string().optional(),
  currency: z.literal("IDR"),
  effectiveFrom: rfc3339TimestampSchema.optional(),
  effectiveTo: rfc3339TimestampSchema.optional(),
  appliesTo: z.array(z.enum(["STOREFRONT", "QRIS_API"])).optional(),
  merchantOverrideAllowed: z.boolean().optional(),
  buyerSurchargeAllowed: z.boolean().optional(),
  adminMutationAllowed: z.boolean(),
});

export const feePolicyEnvelopeSchema = successEnvelopeSchema(feePolicySchema);

export const productTypeSchema = z.enum(["download", "link", "code"]);

export const catalogProductDtoSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  short: z.string(),
  description: z.string(),
  price: moneyIdrSchema,
  type: productTypeSchema,
  badge: z.string().optional(),
  sales: z.number().int(),
  palette: z.string(),
  glyph: z.string(),
  includes: z.array(z.string()),
  /** Canonical owning store slug — required for featured homepage links (PUB-100). */
  storeSlug: z.string().min(1).optional(),
  allowPayWhatYouWant: z.boolean().optional(),
  minimumPrice: moneyIdrSchema.optional(),
  updatesEnabled: z.boolean().optional(),
  currentVersion: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  storeId: z.string().optional(),
  merchantId: z.string().optional(),
});

/** Featured list items must carry storeSlug so homepage never hardcodes a demo store. */
export const featuredCatalogProductDtoSchema = catalogProductDtoSchema.extend({
  storeSlug: z.string().min(1),
});

export const featuredCatalogProductListEnvelopeSchema = successEnvelopeSchema(
  z.array(featuredCatalogProductDtoSchema),
);

/** Public review wire DTO (BE ReviewView). */
export const publicReviewDtoSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().optional(),
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  verifiedPurchase: z.boolean().optional(),
  contentVersion: z.number().int().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  sellerReply: z.string().nullable().optional(),
  /** Display-only fields when present (mock may include). */
  buyer: z.string().optional(),
  initials: z.string().optional(),
  product: z.string().optional(),
  seller: z.string().optional(),
  verified: z.boolean().optional(),
});

export const publicReviewListEnvelopeSchema = cursorListEnvelopeSchema(
  publicReviewDtoSchema,
);

/** BE ReviewSummaryView: count/averageRating/rating1..5 */
export const publicReviewSummaryDtoSchema = z.object({
  productId: z.string().optional(),
  count: z.number().int().min(0),
  averageRating: z.number(),
  rating1: z.number().int().min(0),
  rating2: z.number().int().min(0),
  rating3: z.number().int().min(0),
  rating4: z.number().int().min(0),
  rating5: z.number().int().min(0),
});

export const publicReviewSummaryEnvelopeSchema = successEnvelopeSchema(
  publicReviewSummaryDtoSchema,
);

export const catalogProductEnvelopeSchema = successEnvelopeSchema(
  catalogProductDtoSchema,
);

export const catalogProductListEnvelopeSchema = successEnvelopeSchema(
  z.array(catalogProductDtoSchema),
);

export const publicStorefrontDtoSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  monogram: z.string().min(1),
  bio: z.string(),
  tagline: z.string().optional(),
  verified: z.boolean().optional(),
  accent: z.string().optional(),
  ink: z.string().optional(),
  canvas: z.string().optional(),
  preset: z.string().optional(),
  layout: z.string().optional(),
  font: z.string().optional(),
  hero: z.string().optional(),
  cards: z.string().optional(),
  texture: z.string().optional(),
  radius: z.string().optional(),
  headerAlign: z.string().optional(),
  announcement: z.string().optional(),
  featuredProductIds: z.array(z.string()).optional(),
  sections: z.array(z.string()).optional(),
  socials: z.record(z.string(), z.string()).optional(),
  trustBadges: z.array(z.string()).optional(),
  rating: z.number().optional(),
  reviewCount: z.number().int().optional(),
  products: z.array(catalogProductDtoSchema),
  revision: z.number().int().optional(),
  etag: z.string().optional(),
});

export const publicStorefrontEnvelopeSchema = successEnvelopeSchema(
  publicStorefrontDtoSchema,
);

export const authLoginDataSchema = z.object({
  sessionId: z.string().optional(),
  csrfToken: z.string().optional(),
  mfaRequired: z.boolean().optional(),
  user: z.record(z.string(), z.unknown()).optional(),
});

export const authLoginEnvelopeSchema =
  successEnvelopeSchema(authLoginDataSchema);

/** GET /v1/auth/session — principal + re-issued CSRF (INT-130) + UI claims (INT-120). */
export const authSessionImpersonationSchema = z.object({
  active: z.boolean().optional(),
  id: z.string().optional(),
  scope: z.string().optional(),
  actorId: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const authSessionDataSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  surface: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  mfaEnabled: z.boolean().optional(),
  mfaVerified: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  status: z.string().optional(),
  /** AUTHENTICATED | MFA_PENDING (INT-140). */
  sessionStatus: z.string().optional(),
  csrfToken: z.string().min(1),
  permissions: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  impersonation: authSessionImpersonationSchema.optional(),
});

export const authSessionEnvelopeSchema =
  successEnvelopeSchema(authSessionDataSchema);

export const authMessageDataSchema = z.object({
  message: z.string().min(1),
});

export const authMessageEnvelopeSchema =
  successEnvelopeSchema(authMessageDataSchema);

export type Meta = z.infer<typeof metaSchema>;
export type CursorListMeta = z.infer<typeof cursorListMetaSchema>;
export type NumberedPageListMeta = z.infer<typeof numberedPageListMetaSchema>;
export type ApiProblemParsed = z.infer<typeof apiProblemSchema>;
export type ProblemEnvelope = z.infer<typeof problemEnvelopeSchema>;
export type CatalogProductDto = z.infer<typeof catalogProductDtoSchema>;
export type FeaturedCatalogProductDto = z.infer<
  typeof featuredCatalogProductDtoSchema
>;
export type PublicStorefrontDto = z.infer<typeof publicStorefrontDtoSchema>;
export type PublicReviewDto = z.infer<typeof publicReviewDtoSchema>;
export type PublicReviewSummaryDto = z.infer<
  typeof publicReviewSummaryDtoSchema
>;
export type FeePolicyDto = z.infer<typeof feePolicySchema>;
export type AuthLoginDataDto = z.infer<typeof authLoginDataSchema>;
export type AuthSessionDataDto = z.infer<typeof authSessionDataSchema>;

/** GET /v1/seller/me/merchant — seller bootstrap (INT-150). */
export const sellerMembershipSchema = z.object({
  merchantId: z.string().min(1),
  displayName: z.string().optional(),
  merchantStatus: z.string().optional(),
  roleInMerchant: z.string().min(1),
  capabilities: z.array(z.string()).optional(),
  storeIds: z.array(z.string()).optional(),
});

export const sellerStoreSchema = z.object({
  storeId: z.string().min(1),
  merchantId: z.string().min(1),
  slug: z.string().optional(),
  name: z.string().optional(),
  status: z.string().optional(),
  canonical: z.boolean().optional(),
});

export const sellerBootstrapDataSchema = z.object({
  merchantId: z.string().min(1),
  displayName: z.string().optional(),
  status: z.string().optional(),
  roleInMerchant: z.string().optional(),
  ownerUserId: z.string().optional(),
  memberships: z.array(sellerMembershipSchema).optional(),
  stores: z.array(sellerStoreSchema).optional(),
  canonicalStoreId: z.string().optional(),
  currentStoreId: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

export const sellerBootstrapEnvelopeSchema = successEnvelopeSchema(
  sellerBootstrapDataSchema,
);

export const sellerCurrentStoreDataSchema = z.object({
  currentStoreId: z.string().min(1),
  canonicalStoreId: z.string().optional(),
});

export const sellerCurrentStoreEnvelopeSchema = successEnvelopeSchema(
  sellerCurrentStoreDataSchema,
);

export type SellerBootstrapDto = z.infer<typeof sellerBootstrapDataSchema>;
