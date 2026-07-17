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

/** SEL-220 — POST publish accepted envelope (optional product snapshot). */
export const publishProductResultDtoSchema = z.object({
  accepted: z.boolean(),
  productId: z.string().min(1),
  requestId: z.string().min(1),
  product: catalogProductDtoSchema.optional(),
});

export const publishProductEnvelopeSchema = successEnvelopeSchema(
  publishProductResultDtoSchema,
);

/** CreateProductRequest wire body (OpenAPI). */
export const createProductRequestSchema = z.object({
  slug: z.string().optional(),
  title: z.string().min(1),
  short: z.string().optional(),
  description: z.string().optional(),
  price: moneyIdrSchema,
  type: productTypeSchema,
  badge: z.string().optional(),
  palette: z.string().optional(),
  glyph: z.string().optional(),
  includes: z.array(z.string()).optional(),
  allowPayWhatYouWant: z.boolean().optional(),
  minimumPrice: moneyIdrSchema.optional(),
  currentVersion: z.string().optional(),
});

/** PatchProductRequest wire body (OpenAPI). Status is never patched. */
export const patchProductRequestSchema = z.object({
  slug: z.string().optional(),
  title: z.string().optional(),
  short: z.string().optional(),
  description: z.string().optional(),
  price: moneyIdrSchema.optional(),
  type: productTypeSchema.optional(),
  badge: z.string().optional(),
  palette: z.string().optional(),
  glyph: z.string().optional(),
  includes: z.array(z.string()).optional(),
  allowPayWhatYouWant: z.boolean().optional(),
  minimumPrice: moneyIdrSchema.optional(),
  minimumPriceCleared: z.boolean().optional(),
  currentVersion: z.string().optional(),
});

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
  /** Optional store id for checkout quote bootstrap (CHK-100). */
  storeId: z.string().min(1).optional(),
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

/** AUT-120 — password change may rotate session CSRF. */
export const authPasswordChangeDataSchema = z.object({
  message: z.string().min(1).optional(),
  csrfToken: z.string().optional(),
  sessionId: z.string().optional(),
});

export const authPasswordChangeEnvelopeSchema = successEnvelopeSchema(
  authPasswordChangeDataSchema,
);

/** AUT-120 — MFA enroll secret once (component memory only). */
export const authMfaEnrollDataSchema = z.object({
  secret: z.string().min(1),
  otpauthUrl: z.string().min(1),
  factorId: z.string().optional(),
});

export const authMfaEnrollEnvelopeSchema = successEnvelopeSchema(
  authMfaEnrollDataSchema,
);

/** AUT-120 — recovery codes one-time view. */
export const authMfaRecoveryDataSchema = z.object({
  recoveryCodes: z.array(z.string().min(1)).min(1),
});

export const authMfaRecoveryEnvelopeSchema = successEnvelopeSchema(
  authMfaRecoveryDataSchema,
);

/** AUT-120 — MFA verify / step-up (optional recent proof mint). */
export const authMfaVerifyDataSchema = z.object({
  mfaVerified: z.boolean(),
  recentMfaProof: z.string().optional(),
  purpose: z.string().optional(),
  expiresAt: z.string().optional(),
  factor: z.string().optional(),
});

export const authMfaVerifyEnvelopeSchema = successEnvelopeSchema(
  authMfaVerifyDataSchema,
);

/** AUT-120 — dual-confirm email change partial/complete. */
export const authEmailChangeConfirmDataSchema = z.object({
  message: z.string().min(1).optional(),
  complete: z.boolean(),
  newEmail: z.string().optional(),
});

export const authEmailChangeConfirmEnvelopeSchema = successEnvelopeSchema(
  authEmailChangeConfirmDataSchema,
);

export type AuthPasswordChangeDataDto = z.infer<
  typeof authPasswordChangeDataSchema
>;
export type AuthMfaEnrollDataDto = z.infer<typeof authMfaEnrollDataSchema>;
export type AuthMfaRecoveryDataDto = z.infer<typeof authMfaRecoveryDataSchema>;
export type AuthMfaVerifyDataDto = z.infer<typeof authMfaVerifyDataSchema>;
export type AuthEmailChangeConfirmDataDto = z.infer<
  typeof authEmailChangeConfirmDataSchema
>;

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

// --- Checkout quote (CHK-100) — server-authoritative price snapshot ---

/** Request body for POST /v1/checkout/quote. No authoritative total. */
export const checkoutQuoteRequestSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  merchandise: moneyIdrSchema.optional(),
  tip: moneyIdrSchema.optional(),
  upsell: moneyIdrSchema.optional(),
  couponCode: z.string().optional(),
  /** Never authoritative — included only to prove ignore path in tests. */
  clientDiscount: moneyIdrSchema.optional(),
  discount: moneyIdrSchema.optional(),
  buyerIdentityHash: z.string().optional(),
});

export const checkoutPriceDtoSchema = z.object({
  storeId: z.string().optional(),
  productId: z.string().optional(),
  merchandise: moneyIdrSchema,
  tip: moneyIdrSchema.optional(),
  upsell: moneyIdrSchema.optional(),
  eligibleSubtotal: moneyIdrSchema.optional(),
  discount: moneyIdrSchema,
  gross: moneyIdrSchema,
  couponApplied: z.boolean(),
  couponUnavailable: z.boolean().optional(),
  clientDiscountIgnored: z.boolean(),
  couponId: z.string().optional(),
  couponCode: z.string().optional(),
  couponPolicyVersion: z.number().int().optional(),
  discountKind: z.string().optional(),
  discountValue: moneyIdrSchema.optional(),
});

export const checkoutPriceEnvelopeSchema = successEnvelopeSchema(
  checkoutPriceDtoSchema,
);

export type CheckoutQuoteRequestDto = z.infer<typeof checkoutQuoteRequestSchema>;
export type CheckoutPriceDto = z.infer<typeof checkoutPriceDtoSchema>;

// --- Checkout intent create (CHK-110) — POST /v1/checkout/intents ---

/** Wire body for create intent. No authoritative total/gross. */
export const createCheckoutIntentRequestSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  payWhatYouWant: moneyIdrSchema.optional(),
  tip: moneyIdrSchema.optional(),
  upsellProductIds: z.array(z.string().min(1)).optional(),
  couponCode: z.string().optional(),
  buyerEmail: z.string().optional(),
  buyerName: z.string().optional(),
  buyerSessionId: z.string().optional(),
  buyerIdentityHash: z.string().optional(),
  /** Ignored by server; optional proof-only fields — never authority. */
  unitPrice: moneyIdrSchema.optional(),
  total: moneyIdrSchema.optional(),
  discount: moneyIdrSchema.optional(),
});

export const checkoutIntentStatusSchema = z.enum([
  "REQUIRES_PAYMENT",
  "PENDING",
  "CANCEL_PENDING",
  "EXPIRE_PENDING",
  "UNKNOWN_OUTCOME",
  "PAID",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);

export const checkoutIntentDtoSchema = z.object({
  paymentIntentId: z.string().min(1),
  orderId: z.string().min(1),
  orderNumber: z.string().optional(),
  status: checkoutIntentStatusSchema,
  orderStatus: z.string().optional(),
  paymentStatus: z.string().optional(),
  source: z.literal("STOREFRONT").or(z.string().min(1)),
  paymentMode: z.enum(["SANDBOX", "LIVE"]).or(z.string().min(1)),
  currency: z.literal("IDR").or(z.string().min(1)),
  amount: moneyIdrSchema,
  subtotal: moneyIdrSchema.optional(),
  discount: moneyIdrSchema.optional(),
  tip: moneyIdrSchema.optional(),
  fee: moneyIdrSchema.optional(),
  merchantNet: moneyIdrSchema.optional(),
  gross: moneyIdrSchema.optional(),
  expiresAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  provider: z.string().optional(),
  accountScope: z.string().optional(),
  providerReference: z.string().nullable().optional(),
  qrString: z.string().nullable().optional(),
  qrImageUrl: z.string().nullable().optional(),
  feeSnapshotId: z.string().nullable().optional(),
  publicToken: z.string().optional(),
  replayed: z.boolean().optional(),
  paidLate: z.boolean().optional(),
});

export const checkoutIntentEnvelopeSchema = successEnvelopeSchema(
  checkoutIntentDtoSchema,
);

export type CreateCheckoutIntentRequestDto = z.infer<
  typeof createCheckoutIntentRequestSchema
>;
export type CheckoutIntentDto = z.infer<typeof checkoutIntentDtoSchema>;
export type CheckoutIntentStatusDto = z.infer<typeof checkoutIntentStatusSchema>;

// --- Public/buyer order result (CHK-130) — payment fields only; no delivery secrets ---

/**
 * GET /v1/orders/{orderId} public DTO (orderPublicDTO).
 * Path status is never authority; paymentStatus/orderStatus from body only.
 * Delivery secrets never appear here (CHK-140).
 */
export const orderResultDtoSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().optional(),
  orderStatus: z.string().optional(),
  paymentStatus: z.string().min(1),
  paymentStatusDetail: z.string().optional(),
  source: z.string().optional(),
  currency: z.string().optional(),
  subtotal: moneyIdrSchema.optional(),
  discount: moneyIdrSchema.optional(),
  tip: moneyIdrSchema.optional(),
  fee: moneyIdrSchema.optional(),
  gross: moneyIdrSchema.optional(),
  merchantNet: moneyIdrSchema.optional(),
  amount: moneyIdrSchema.optional(),
  paymentIntentId: z.string().optional(),
  expiresAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  qrString: z.string().nullable().optional(),
  qrImageUrl: z.string().nullable().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  /** Optional product chrome when BE projects it; never invent. */
  productId: z.string().optional(),
  productTitle: z.string().optional(),
  productSlug: z.string().optional(),
  storeSlug: z.string().optional(),
});

export const orderResultEnvelopeSchema = successEnvelopeSchema(
  orderResultDtoSchema,
);

export type OrderResultDto = z.infer<typeof orderResultDtoSchema>;

// --- Delivery access (CHK-140) — claim/reveal only; never list/detail base ---

/**
 * POST delivery/access response (buyer session or order token exchange).
 * Secrets only at this boundary; Cache-Control no-store on wire.
 * downloadObjectId is opaque — not a signed URL (download exchange gap).
 */
export const deliveryAccessDtoSchema = z.object({
  grantId: z.string().min(1),
  orderId: z.string().min(1),
  orderItemId: z.string().min(1),
  deliveryKind: z.enum([
    "DOWNLOAD",
    "PROTECTED_LINK",
    "CREDENTIAL",
    "CODE",
  ]),
  status: z.string().min(1),
  accessCount: z.number().int().min(0).optional(),
  maxAccesses: z.number().int().min(0).optional(),
  expiresAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  downloadObjectId: z.string().min(1).optional(),
  secrets: z.record(z.string(), z.string()).optional(),
});

export const deliveryAccessEnvelopeSchema = successEnvelopeSchema(
  deliveryAccessDtoSchema,
);

/** Buyer resend queues email; never returns secrets. */
export const deliveryResendDtoSchema = z.object({
  grantId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  status: z.string().optional(),
  queued: z.boolean().optional(),
});

export const deliveryResendEnvelopeSchema = successEnvelopeSchema(
  deliveryResendDtoSchema,
);

export type DeliveryAccessDto = z.infer<typeof deliveryAccessDtoSchema>;
export type DeliveryResendDto = z.infer<typeof deliveryResendDtoSchema>;

// --- Invoice read / public verify (CHK-150) — immutable snapshot; no delivery secrets ---

/** Line frozen at invoice issue (not live catalog). */
export const invoiceLineSnapshotDtoSchema = z.object({
  orderItemId: z.string().optional(),
  productId: z.string().optional(),
  title: z.string().min(1),
  productType: z.string().optional(),
  version: z.string().optional(),
  unitPriceIdr: moneyIdrSchema.optional(),
  quantity: z.number().int().min(0).optional(),
  lineTotalIdr: moneyIdrSchema,
  discountIdr: moneyIdrSchema.optional(),
});

/** Buyer identity frozen on authorized invoice only — never on public verify. */
export const invoiceBuyerSnapshotDtoSchema = z.object({
  userId: z.string().optional().nullable(),
  email: z.string().optional(),
  name: z.string().optional(),
});

export const invoiceIssuerSnapshotDtoSchema = z.object({
  storeId: z.string().optional(),
  storeName: z.string().optional(),
  merchantId: z.string().optional(),
});

/**
 * Immutable invoice body (jsonb). Catalog/price changes never rewrite.
 * Money fields are server authority — client must not recompute totals.
 */
export const invoiceSnapshotDtoSchema = z
  .object({
    invoiceNumber: z.string().optional(),
    orderId: z.string().optional(),
    orderNumber: z.string().optional(),
    storeId: z.string().optional(),
    merchantId: z.string().optional(),
    currency: z.string().optional(),
    subtotalIdr: moneyIdrSchema.optional(),
    discountIdr: moneyIdrSchema.optional(),
    tipIdr: moneyIdrSchema.optional(),
    feeIdr: moneyIdrSchema.optional(),
    grossIdr: moneyIdrSchema.optional(),
    merchantNetIdr: moneyIdrSchema.optional(),
    couponCode: z.string().optional(),
    couponVersion: z.number().int().optional().nullable(),
    paidAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional().nullable(),
    buyer: invoiceBuyerSnapshotDtoSchema.optional(),
    issuer: invoiceIssuerSnapshotDtoSchema.optional(),
    lines: z.array(invoiceLineSnapshotDtoSchema).optional(),
    rendererVersion: z.string().optional(),
  })
  .passthrough();

/**
 * GET invoice DTO (buyer/order/invoice id).
 * Snapshot is optional object; empty map still validates.
 */
export const invoiceDtoSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  storeId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  status: z.string().min(1),
  currency: z.string().min(1),
  grossIdr: moneyIdrSchema,
  paidAt: z
    .union([rfc3339TimestampSchema, z.string().min(1)])
    .nullable()
    .optional(),
  currentVersion: z.number().int().min(1),
  payloadHash: z.string().min(1),
  rendererVersion: z.string().optional(),
  renderStatus: z.string().optional(),
  /**
   * Immutable financial/product snapshot. OpenAPI allows free-form object;
   * when structured fields present, money must be int IDR.
   */
  snapshot: z.union([invoiceSnapshotDtoSchema, z.record(z.string(), z.unknown())]).optional(),
  /** Raw public verify code only if BE ever projects it (usually omitted after issue). */
  publicCode: z.string().min(1).optional(),
});

export const invoiceEnvelopeSchema = successEnvelopeSchema(invoiceDtoSchema);

/**
 * Public verify — privacy-safe only.
 * Never buyer email/name, secrets, or provider refs.
 */
export const publicInvoiceVerifyDtoSchema = z.object({
  valid: z.boolean(),
  invoiceNumber: z.string().optional(),
  orderNumber: z.string().optional(),
  currency: z.string().optional(),
  grossIdr: moneyIdrSchema.optional(),
  paidAt: z
    .union([rfc3339TimestampSchema, z.string().min(1)])
    .optional()
    .nullable(),
  storeName: z.string().optional(),
});

export const publicInvoiceVerifyEnvelopeSchema = successEnvelopeSchema(
  publicInvoiceVerifyDtoSchema,
);

export type InvoiceLineSnapshotDto = z.infer<typeof invoiceLineSnapshotDtoSchema>;
export type InvoiceSnapshotDto = z.infer<typeof invoiceSnapshotDtoSchema>;
export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;
export type PublicInvoiceVerifyDto = z.infer<typeof publicInvoiceVerifyDtoSchema>;

// --- Buyer purchases (BUY-100) — ownership-scoped; no delivery secrets ---

/** Launch bounded page size; PurchaseLibrary has no paging control (BoundedNoPaging). */
export const BUYER_PURCHASE_LIST_LIMIT = 20;

export const buyerPurchaseSummaryDtoSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  storeId: z.string().min(1),
  storeName: z.string().optional(),
  storeSlug: z.string().optional(),
  paymentStatus: z.string().min(1),
  source: z.string().optional(),
  currency: z.string().optional(),
  grossIdr: moneyIdrSchema,
  paidAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  itemCount: z.number().int().min(0).optional(),
  deliveryStatus: z.string().optional(),
  productId: z.string().optional(),
  productTitle: z.string().optional(),
  productType: z.string().optional(),
  productVersion: z.string().optional(),
  deliveryKind: z.string().optional(),
});

export const buyerPurchaseItemDtoSchema = z.object({
  orderItemId: z.string().min(1),
  productId: z.string().min(1),
  productTitle: z.string().min(1),
  productType: z.string().optional(),
  productVersion: z.string().optional(),
  unitPriceIdr: moneyIdrSchema,
  quantity: z.number().int().min(1),
  lineTotalIdr: moneyIdrSchema,
  deliveryKind: z.string().min(1),
  deliveryStatus: z.string().optional(),
  grantId: z.string().optional(),
});

export const buyerPurchaseDetailDtoSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  storeId: z.string().min(1),
  storeName: z.string().optional(),
  storeSlug: z.string().optional(),
  merchantId: z.string().optional(),
  paymentStatus: z.string().min(1),
  source: z.string().optional(),
  currency: z.string().optional(),
  subtotalIdr: moneyIdrSchema.optional(),
  discountIdr: moneyIdrSchema.optional(),
  tipIdr: moneyIdrSchema.optional(),
  feeIdr: moneyIdrSchema.optional(),
  grossIdr: moneyIdrSchema,
  paidAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  items: z.array(buyerPurchaseItemDtoSchema),
});

export const buyerPurchaseListEnvelopeSchema = cursorListEnvelopeSchema(
  buyerPurchaseSummaryDtoSchema,
);

export const buyerPurchaseDetailEnvelopeSchema = successEnvelopeSchema(
  buyerPurchaseDetailDtoSchema,
);

export type BuyerPurchaseSummaryDto = z.infer<
  typeof buyerPurchaseSummaryDtoSchema
>;
export type BuyerPurchaseItemDto = z.infer<typeof buyerPurchaseItemDtoSchema>;
export type BuyerPurchaseDetailDto = z.infer<
  typeof buyerPurchaseDetailDtoSchema
>;

// --- Buyer reviews (BUY-110) — session-bound; ownership on order item ---

/** BE ReviewView for buyer create/patch (includes owner order ids). */
export const buyerReviewDtoSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  productId: z.string().min(1),
  orderId: z.string().optional(),
  orderItemId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  status: z.string().min(1),
  verifiedPurchase: z.boolean().optional(),
  contentVersion: z.number().int().min(1),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  sellerReply: z.string().nullable().optional(),
});

export const buyerReviewEnvelopeSchema = successEnvelopeSchema(
  buyerReviewDtoSchema,
);

/** Create: exact rating/title/body; optional productId/storeId as mismatch guards only. */
export const buyerCreateReviewRequestSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().optional(),
  productId: z.string().min(1).optional(),
  storeId: z.string().min(1).optional(),
});

/** Patch: versioned content only — no rebinding, no status. */
export const buyerPatchReviewRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
});

export type BuyerReviewDto = z.infer<typeof buyerReviewDtoSchema>;

// --- Buyer sessions (BUY-130) — alias of auth sessions; session-bound only ---

/** BE auth.SessionView (buyer list). current is server session-id equality. */
export const buyerSessionDtoSchema = z.object({
  id: z.string().min(1),
  surface: z.string().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  lastSeenAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  expiresAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  current: z.boolean(),
  mfaVerified: z.boolean().optional(),
  deviceLabel: z.string().optional(),
});

/** GET /v1/buyer/sessions → `{ sessions: SessionView[] }` */
export const buyerSessionListDataSchema = z.object({
  sessions: z.array(buyerSessionDtoSchema),
});

export const buyerSessionListEnvelopeSchema = successEnvelopeSchema(
  buyerSessionListDataSchema,
);

export const buyerSessionRevokeDataSchema = z.object({
  revoked: z.boolean().optional(),
  revokedCount: z.number().int().min(0).optional(),
});

export const buyerSessionRevokeEnvelopeSchema = successEnvelopeSchema(
  buyerSessionRevokeDataSchema,
);

export type BuyerSessionDto = z.infer<typeof buyerSessionDtoSchema>;
export type BuyerSessionListDataDto = z.infer<typeof buyerSessionListDataSchema>;
export type BuyerCreateReviewRequest = z.infer<
  typeof buyerCreateReviewRequestSchema
>;
export type BuyerPatchReviewRequest = z.infer<
  typeof buyerPatchReviewRequestSchema
>;

// --- Buyer / me profile + notification preferences (BUY-120) ---

/** BE ProfileData (GET/PATCH /v1/buyer/profile alias of /v1/me/profile). */
export const buyerProfileDtoSchema = z.object({
  userId: z.string().min(1).optional(),
  email: z.string().min(1),
  emailVerified: z.boolean().optional(),
  displayName: z.string(),
  name: z.string().optional(),
  phone: z.string().optional(),
  locale: z.string().min(1),
  timezone: z.string().min(1),
  /** Personal media ref — never upload via store objects (INT-175 DISABLED). */
  avatarRef: z.string().optional(),
  version: z.number().int().min(1),
  mfaEnabled: z.boolean().optional(),
  status: z.string().optional(),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
});

export const buyerProfileEnvelopeSchema = successEnvelopeSchema(
  buyerProfileDtoSchema,
);

/** PATCH body: expectedVersion required; email never patched here (dual-confirm AUT-120). */
export const buyerPatchProfileRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  displayName: z.string().optional(),
  phone: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  // avatarRef intentionally omitted — INT-175 personal media DISABLED at launch
});

export const notificationEventCodeSchema = z.enum([
  "SECURITY_ALERT",
  "PAYMENT_RECEIPT",
  "KYC_UPDATE",
  "WITHDRAWAL_UPDATE",
  "MARKETING_NEWSLETTER",
]);

export const notificationChannelSchema = z.enum(["EMAIL", "IN_APP"]);

export const notificationPrefDtoSchema = z.object({
  eventCode: notificationEventCodeSchema,
  channel: notificationChannelSchema,
  enabled: z.boolean(),
  mandatory: z.boolean().optional(),
});

export const notificationPreferencesDataSchema = z.object({
  preferences: z.array(notificationPrefDtoSchema),
});

export const notificationPreferencesEnvelopeSchema = successEnvelopeSchema(
  notificationPreferencesDataSchema,
);

export const notificationPreferencesPatchRequestSchema = z.object({
  preferences: z
    .array(
      z.object({
        eventCode: notificationEventCodeSchema,
        channel: notificationChannelSchema,
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

export type BuyerProfileDto = z.infer<typeof buyerProfileDtoSchema>;
export type BuyerPatchProfileRequest = z.infer<
  typeof buyerPatchProfileRequestSchema
>;
export type NotificationPrefDto = z.infer<typeof notificationPrefDtoSchema>;
export type NotificationPreferencesDataDto = z.infer<
  typeof notificationPreferencesDataSchema
>;
export type NotificationPreferencesPatchRequest = z.infer<
  typeof notificationPreferencesPatchRequestSchema
>;

// --- Shared notification inbox (BUY-140) — recipient-scoped shell center ---

/** Launch shell list bound (no cursor UI; UI-080 for expansion). */
export const NOTIFICATION_INBOX_LIST_LIMIT = 20;

export const notificationPrioritySchema = z.enum([
  "INFO",
  "WARNING",
  "CRITICAL",
  "COMPLIANCE",
]);

export const notificationInboxSurfaceSchema = z.enum([
  "SELLER",
  "BUYER",
  "ADMIN",
]);

/** BE NotificationData for GET /v1/{surface}/notifications. */
export const notificationDataDtoSchema = z.object({
  id: z.string().min(1),
  eventCode: notificationEventCodeSchema,
  title: z.string(),
  body: z.string(),
  /** Server-sanitized relative internal path only — FE re-allowlists by surface. */
  ctaPath: z.string(),
  contentVersion: z.string(),
  priority: notificationPrioritySchema,
  surface: notificationInboxSurfaceSchema,
  tenantType: z.string().optional(),
  tenantId: z.string().optional(),
  readAt: z
    .union([rfc3339TimestampSchema, z.string().min(1), z.null()])
    .optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  unread: z.boolean(),
});

export const notificationListEnvelopeSchema = cursorListEnvelopeSchema(
  notificationDataDtoSchema,
);

export const notificationEnvelopeSchema = successEnvelopeSchema(
  notificationDataDtoSchema,
);

export const unreadCountEnvelopeSchema = successEnvelopeSchema(
  z.object({
    count: z.number().int().min(0),
  }),
);

export const readAllEnvelopeSchema = successEnvelopeSchema(
  z.object({
    updated: z.number().int().min(0),
  }),
);

export type NotificationDataDto = z.infer<typeof notificationDataDtoSchema>;
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>;
export type NotificationInboxSurface = z.infer<
  typeof notificationInboxSurfaceSchema
>;

// --- Seller reviews (SEL-270) — store-scoped list/summary/reply/report ---

/** Launch BoundedNoPaging first-result limit (no paging control on snapshot). */
export const SELLER_REVIEW_LIST_LIMIT = 50;

/** BE SellerReviewView for store-scoped seller list. */
export const sellerReviewDtoSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  productId: z.string().min(1),
  productTitle: z.string(),
  sellerName: z.string(),
  buyerDisplay: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  status: z.string().min(1),
  verifiedPurchase: z.boolean(),
  contentVersion: z.number().int().min(1),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  sellerReply: z.string().nullable().optional(),
  replyContentVersion: z.number().int().min(1).nullable().optional(),
});

export const sellerReviewListEnvelopeSchema = cursorListEnvelopeSchema(
  sellerReviewDtoSchema,
);

/** BE SellerStoreReviewSummaryView — same aggregate shape as product summary. */
export const sellerStoreReviewSummaryDtoSchema = z.object({
  storeId: z.string().min(1),
  count: z.number().int().min(0),
  averageRating: z.number(),
  rating1: z.number().int().min(0),
  rating2: z.number().int().min(0),
  rating3: z.number().int().min(0),
  rating4: z.number().int().min(0),
  rating5: z.number().int().min(0),
});

export const sellerStoreReviewSummaryEnvelopeSchema = successEnvelopeSchema(
  sellerStoreReviewSummaryDtoSchema,
);

export const upsertSellerReviewReplyRequestSchema = z.object({
  body: z.string().min(1).max(2000),
  expectedVersion: z.number().int().min(1).optional(),
});

export const sellerReviewReplyDtoSchema = z.object({
  reviewId: z.string().min(1),
  storeId: z.string().min(1),
  body: z.string().min(1),
  contentVersion: z.number().int().min(1),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
});

export const sellerReviewReplyEnvelopeSchema = successEnvelopeSchema(
  sellerReviewReplyDtoSchema,
);

export const reportSellerReviewRequestSchema = z.object({
  reasonCode: z.enum([
    "SPAM",
    "ABUSE",
    "OFF_TOPIC",
    "OTHER",
    "INACCURATE",
  ]),
  context: z.string().max(1000).optional(),
});

export const sellerReviewReportDtoSchema = z.object({
  id: z.string().min(1),
  reviewId: z.string().min(1),
  reasonCode: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
});

export const sellerReviewReportEnvelopeSchema = successEnvelopeSchema(
  sellerReviewReportDtoSchema,
);

export type SellerReviewDto = z.infer<typeof sellerReviewDtoSchema>;
export type SellerStoreReviewSummaryDto = z.infer<
  typeof sellerStoreReviewSummaryDtoSchema
>;
export type UpsertSellerReviewReplyRequest = z.infer<
  typeof upsertSellerReviewReplyRequestSchema
>;
export type SellerReviewReplyDto = z.infer<typeof sellerReviewReplyDtoSchema>;
export type ReportSellerReviewRequest = z.infer<
  typeof reportSellerReviewRequestSchema
>;
export type SellerReviewReportDto = z.infer<typeof sellerReviewReportDtoSchema>;

// --- Seller orders (SEL-250) — store-scoped; no delivery secrets ---

/** Default/max page size for seller order NumberedPageList. */
export const SELLER_ORDER_DEFAULT_PAGE_SIZE = 20;
export const SELLER_ORDER_MAX_PAGE_SIZE = 50;

export const sellerOrderSummaryDtoSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  storeId: z.string().min(1),
  merchantId: z.string().min(1),
  buyerName: z.string(),
  buyerEmail: z.string(),
  productTitle: z.string(),
  paymentStatus: z.string().min(1),
  source: z.string().optional(),
  currency: z.string().optional(),
  grossIdr: moneyIdrSchema,
  feeIdr: moneyIdrSchema,
  merchantNetIdr: moneyIdrSchema,
  deliveryStatus: z.string().optional(),
  paidAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
});

export const sellerOrderItemDtoSchema = z.object({
  orderItemId: z.string().min(1),
  productId: z.string().min(1),
  productTitle: z.string().min(1),
  productType: z.string().optional(),
  productVersion: z.string().optional(),
  unitPriceIdr: moneyIdrSchema,
  quantity: z.number().int().min(1),
  lineTotalIdr: moneyIdrSchema,
  deliveryKind: z.string().min(1),
});

export const sellerOrderGrantMetaDtoSchema = z.object({
  grantId: z.string().min(1),
  orderItemId: z.string().min(1),
  productId: z.string().min(1),
  deliveryKind: z.string().min(1),
  status: z.string().min(1),
  accessCount: z.number().int().min(0),
  maxAccesses: z.number().int().min(0),
  activatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  revokedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  failedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  failReason: z.string().nullable().optional(),
  lastAccessedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
});

export const sellerOrderPaymentSummaryDtoSchema = z.object({
  paymentIntentId: z.string().min(1),
  provider: z.string().min(1),
  providerReference: z.string().optional(),
  status: z.string().min(1),
  source: z.string().optional(),
  amountIdr: moneyIdrSchema,
  paidLate: z.boolean(),
});

export const sellerOrderTimelineEventDtoSchema = z.object({
  label: z.string().min(1),
  at: z.union([rfc3339TimestampSchema, z.string().min(1)]),
});

export const sellerOrderDetailDtoSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  storeId: z.string().min(1),
  merchantId: z.string().min(1),
  buyerName: z.string(),
  buyerEmail: z.string(),
  paymentStatus: z.string().min(1),
  source: z.string().optional(),
  currency: z.string().optional(),
  subtotalIdr: moneyIdrSchema,
  discountIdr: moneyIdrSchema,
  tipIdr: moneyIdrSchema,
  feeIdr: moneyIdrSchema,
  grossIdr: moneyIdrSchema,
  merchantNetIdr: moneyIdrSchema,
  paidAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).nullable().optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  productTitle: z.string().optional(),
  items: z.array(sellerOrderItemDtoSchema),
  grants: z.array(sellerOrderGrantMetaDtoSchema),
  payment: sellerOrderPaymentSummaryDtoSchema.optional().nullable(),
  timeline: z.array(sellerOrderTimelineEventDtoSchema),
});

export const sellerOrderListEnvelopeSchema = numberedPageListEnvelopeSchema(
  sellerOrderSummaryDtoSchema,
);

export const sellerOrderDetailEnvelopeSchema = successEnvelopeSchema(
  sellerOrderDetailDtoSchema,
);

export const sellerDeliveryResendResultSchema = z.object({
  grantId: z.string().optional(),
  orderId: z.string().optional(),
  status: z.string().optional(),
  queued: z.boolean().optional(),
});

export const sellerDeliveryResendEnvelopeSchema = successEnvelopeSchema(
  sellerDeliveryResendResultSchema,
);

export type SellerOrderSummaryDto = z.infer<typeof sellerOrderSummaryDtoSchema>;
export type SellerOrderDetailDto = z.infer<typeof sellerOrderDetailDtoSchema>;
export type SellerOrderGrantMetaDto = z.infer<
  typeof sellerOrderGrantMetaDtoSchema
>;
export type SellerOrderPaymentSummaryDto = z.infer<
  typeof sellerOrderPaymentSummaryDtoSchema
>;
export type SellerOrderTimelineEventDto = z.infer<
  typeof sellerOrderTimelineEventDtoSchema
>;

// --- Seller customers (SEL-260) — store-scoped purchase aggregate ---

export const SELLER_CUSTOMER_DEFAULT_PAGE_SIZE = 20;
export const SELLER_CUSTOMER_MAX_PAGE_SIZE = 50;

export const sellerCustomerSummaryDtoSchema = z.object({
  customerId: z.string().min(1),
  storeId: z.string().min(1),
  displayName: z.string(),
  displayEmail: z.string(),
  orderCount: z.number().int().min(0),
  spentIdr: moneyIdrSchema,
  lastPurchaseAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  firstSeenAt: z
    .union([rfc3339TimestampSchema, z.string().min(1)])
    .optional(),
  lastProductTitle: z.string().optional(),
  lastOrderGrossIdr: moneyIdrSchema.optional(),
  lastPaymentStatus: z.string().optional(),
});

export const sellerCustomerOrderHistoryItemDtoSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  productTitle: z.string(),
  paymentStatus: z.string().min(1),
  grossIdr: moneyIdrSchema,
  paidAt: z
    .union([rfc3339TimestampSchema, z.string().min(1)])
    .nullable()
    .optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
});

export const sellerCustomerNoteDtoSchema = z.object({
  body: z.string(),
  version: z.number().int().min(1),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  createdAt: z
    .union([rfc3339TimestampSchema, z.string().min(1)])
    .optional(),
});

export const sellerCustomerConsentDtoSchema = z.object({
  status: z.string().min(1),
  label: z.string().min(1),
  updatedAt: z
    .union([rfc3339TimestampSchema, z.string().min(1)])
    .nullable()
    .optional(),
});

export const sellerCustomerDetailDtoSchema = z.object({
  customerId: z.string().min(1),
  storeId: z.string().min(1),
  displayName: z.string(),
  displayEmail: z.string(),
  orderCount: z.number().int().min(0),
  spentIdr: moneyIdrSchema,
  avgOrderIdr: moneyIdrSchema,
  productCount: z.number().int().min(0),
  lastPurchaseAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  firstSeenAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
  marketingConsent: sellerCustomerConsentDtoSchema.optional().nullable(),
  note: sellerCustomerNoteDtoSchema.optional().nullable(),
  orders: z.array(sellerCustomerOrderHistoryItemDtoSchema),
});

export const sellerCustomerListEnvelopeSchema = numberedPageListEnvelopeSchema(
  sellerCustomerSummaryDtoSchema,
);

export const sellerCustomerDetailEnvelopeSchema = successEnvelopeSchema(
  sellerCustomerDetailDtoSchema,
);

export const sellerCustomerNoteEnvelopeSchema = successEnvelopeSchema(
  sellerCustomerNoteDtoSchema,
);

export type SellerCustomerSummaryDto = z.infer<
  typeof sellerCustomerSummaryDtoSchema
>;
export type SellerCustomerDetailDto = z.infer<
  typeof sellerCustomerDetailDtoSchema
>;
export type SellerCustomerOrderHistoryItemDto = z.infer<
  typeof sellerCustomerOrderHistoryItemDtoSchema
>;
export type SellerCustomerNoteDto = z.infer<typeof sellerCustomerNoteDtoSchema>;

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
  /** Server onboarding machine state (SEL-100). */
  onboardingState: z.string().optional(),
  /** Authoritative completion flag from server bootstrap. */
  onboardingCompleted: z.boolean().optional(),
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

/** SEL-110 — onboarding progress + slug availability. */
export const onboardingStateSchema = z.enum([
  "NOT_STARTED",
  "IDENTITY",
  "SLUG",
  "VISUAL",
  "PRODUCT_OPTIONAL",
  "COMPLETE",
]);

export const onboardingStoreSummarySchema = z.object({
  storeId: z.string().optional(),
  merchantId: z.string().optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  bio: z.string().optional(),
  address: z.string().optional(),
  accentColor: z.string().optional(),
  status: z.string().optional(),
  canonical: z.boolean().optional(),
});

export const onboardingProgressDataSchema = z.object({
  state: onboardingStateSchema,
  step: onboardingStateSchema,
  completed: z.boolean(),
  completedAt: z.string().nullable().optional(),
  merchantId: z.string().optional(),
  storeId: z.string().optional(),
  store: onboardingStoreSummarySchema.optional(),
  canComplete: z.boolean().optional(),
  productOptional: z.boolean(),
  progress: z.record(z.string(), z.unknown()).optional(),
});

export const onboardingProgressEnvelopeSchema = successEnvelopeSchema(
  onboardingProgressDataSchema,
);

export const slugAvailabilityDataSchema = z.object({
  slug: z.string(),
  available: z.boolean(),
});

export const slugAvailabilityEnvelopeSchema = successEnvelopeSchema(
  slugAvailabilityDataSchema,
);

export type OnboardingStateDto = z.infer<typeof onboardingStateSchema>;
export type OnboardingProgressDto = z.infer<typeof onboardingProgressDataSchema>;
export type OnboardingStoreSummaryDto = z.infer<
  typeof onboardingStoreSummarySchema
>;
export type SlugAvailabilityDto = z.infer<typeof slugAvailabilityDataSchema>;

/** SEL-200 — store analytics overview + traffic aggregates. */
export const analyticsTimezoneSchema = z.enum([
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "UTC",
]);

export const analyticsChannelSchema = z.enum([
  "all",
  "direct",
  "organic",
  "referral",
  "utm",
  "social",
  "email",
  "paid",
  "other",
]);

export const analyticsChannelBreakdownSchema = z.object({
  channel: z.string().optional(),
  sessions: z.number().int().optional(),
  orders: z.number().int().optional(),
  grossIdr: moneyIdrSchema.optional(),
});

export const analyticsOverviewDataSchema = z.object({
  storeId: z.string().min(1),
  timezone: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  sessions: z.number().int(),
  pageViews: z.number().int(),
  checkouts: z.number().int(),
  orders: z.number().int(),
  grossIdr: moneyIdrSchema,
  conversionRateBps: z.number().int(),
  channels: z.array(analyticsChannelBreakdownSchema),
  policyVersionId: z.string().optional(),
  aggregationVersion: z.string().optional(),
});

export const analyticsOverviewEnvelopeSchema = successEnvelopeSchema(
  analyticsOverviewDataSchema,
);

export const analyticsTrafficRowSchema = z.object({
  day: z.string().min(1),
  channel: z.string().min(1),
  productId: z.string().optional(),
  sessions: z.number().int(),
  pageViews: z.number().int(),
  checkouts: z.number().int(),
  orders: z.number().int(),
  grossIdr: moneyIdrSchema,
});

export const analyticsTrafficPageSchema = z.object({
  items: z.array(analyticsTrafficRowSchema),
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean(),
  timezone: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

export const analyticsTrafficEnvelopeSchema = successEnvelopeSchema(
  analyticsTrafficPageSchema,
);

export type AnalyticsTimezoneDto = z.infer<typeof analyticsTimezoneSchema>;
export type AnalyticsChannelDto = z.infer<typeof analyticsChannelSchema>;
export type AnalyticsOverviewDto = z.infer<typeof analyticsOverviewDataSchema>;
export type AnalyticsChannelBreakdownDto = z.infer<
  typeof analyticsChannelBreakdownSchema
>;
export type AnalyticsTrafficRowDto = z.infer<typeof analyticsTrafficRowSchema>;
export type AnalyticsTrafficPageDto = z.infer<typeof analyticsTrafficPageSchema>;

// --- Seller finance summary / revenue / ledger (SEL-400) ---

/** Non-negative whole IDR for balance buckets (server-authoritative). */
export const moneyIdrNonNegSchema = moneyIdrSchema.refine((v) => v >= 0, {
  message: "MoneyIdr must be non-negative",
});

export const financeSourceWireSchema = z.enum([
  "STOREFRONT",
  "QRIS_API",
  "MIXED",
  "SYSTEM",
]);

export const financeLedgerTypeSchema = z.enum([
  "SALE",
  "PLATFORM_FEE",
  "PROVIDER_FEE",
  "WITHDRAWAL",
  "ADJUSTMENT",
  "SETTLEMENT_RELEASE",
]);

export const financeLedgerDirectionSchema = z.enum(["CREDIT", "DEBIT"]);

export const financeSourceAmountsSchema = z
  .object({
    availableAmount: moneyIdrNonNegSchema.optional(),
    pendingAmount: moneyIdrNonNegSchema.optional(),
    available: moneyIdrNonNegSchema.optional(),
    pending: moneyIdrNonNegSchema.optional(),
  })
  .transform((v) => ({
    availableAmount: v.availableAmount ?? v.available ?? 0,
    pendingAmount: v.pendingAmount ?? v.pending ?? 0,
  }));

export const financeSummaryFeePolicySchema = z
  .object({
    transactionPercentBps: z.number().int().optional(),
    transactionFixedIdr: moneyIdrNonNegSchema.optional(),
    withdrawalPercentBps: z.number().int().optional(),
    minimumWithdrawalIdr: moneyIdrNonNegSchema.optional(),
  })
  .optional();

export const financeSummaryDataSchema = z.object({
  storeId: z.string().min(1),
  availableAmount: moneyIdrNonNegSchema,
  pendingAmount: moneyIdrNonNegSchema,
  heldAmount: moneyIdrNonNegSchema,
  lifetimeGrossAmount: moneyIdrNonNegSchema.optional(),
  monthGrossAmount: moneyIdrNonNegSchema.optional(),
  monthPlatformFeeAmount: moneyIdrNonNegSchema.optional(),
  monthProviderFeeAmount: moneyIdrNonNegSchema.optional(),
  monthNetAmount: moneyIdrNonNegSchema.optional(),
  sources: z.record(z.string(), financeSourceAmountsSchema),
  currency: z.literal("IDR"),
  asOf: rfc3339TimestampSchema,
  feePolicy: financeSummaryFeePolicySchema,
  withdrawalAllocationPolicy: z.string().optional(),
});

export const financeSummaryEnvelopeSchema = successEnvelopeSchema(
  financeSummaryDataSchema,
);

export const financeRevenuePointSchema = z.object({
  day: z.string().min(1),
  revenue: moneyIdrNonNegSchema,
  orders: z.number().int().min(0),
});

export const financeRevenueEnvelopeSchema = successEnvelopeSchema(
  z.array(financeRevenuePointSchema),
);

export const financeLedgerItemSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  type: financeLedgerTypeSchema,
  description: z.string().optional(),
  amount: moneyIdrNonNegSchema,
  direction: financeLedgerDirectionSchema,
  source: financeSourceWireSchema,
  occurredAt: rfc3339TimestampSchema,
  orderId: z.string().optional(),
  withdrawalId: z.string().optional(),
});

/** OpenAPI FinanceLedgerPage nested in SuccessEnvelope data. */
export const financeLedgerPageSchema = z.object({
  items: z.array(financeLedgerItemSchema),
  nextCursor: z.string().nullable().optional(),
  previousCursor: z.string().nullable().optional(),
  hasMore: z.boolean(),
});

export const financeLedgerEnvelopeSchema = successEnvelopeSchema(
  financeLedgerPageSchema,
);

export type FinanceSummaryDto = z.infer<typeof financeSummaryDataSchema>;
export type FinanceSourceAmountsDto = z.infer<typeof financeSourceAmountsSchema>;
export type FinanceRevenuePointDto = z.infer<typeof financeRevenuePointSchema>;
export type FinanceLedgerItemDto = z.infer<typeof financeLedgerItemSchema>;
export type FinanceLedgerPageDto = z.infer<typeof financeLedgerPageSchema>;
export type FinanceLedgerTypeDto = z.infer<typeof financeLedgerTypeSchema>;
export type FinanceSourceWireDto = z.infer<typeof financeSourceWireSchema>;

// --- Seller bank accounts (SEL-340) — store-scoped; masked number only ---

/**
 * BE bankDTO from withdrawals handler.
 * Never includes full accountNumber — only accountNumberMasked.
 */
export const bankAccountDtoSchema = z.object({
  id: z.string().min(1),
  bankCode: z.string().min(1),
  bankName: z.string().optional(),
  accountHolderName: z.string().min(1),
  accountNumberMasked: z.string().min(1),
  status: z.string().min(1),
  isPrimary: z.boolean(),
  version: z.number().int().min(1),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
});

/** GET list → `{ items: BankAccount[] }` */
export const bankAccountListDataSchema = z.object({
  items: z.array(bankAccountDtoSchema),
});

export const bankAccountListEnvelopeSchema = successEnvelopeSchema(
  bankAccountListDataSchema,
);

export const bankAccountEnvelopeSchema = successEnvelopeSchema(
  bankAccountDtoSchema,
);

/** POST create body — full accountNumber is write-only; never returned. */
export const bankAccountCreateRequestSchema = z.object({
  bankCode: z.string().min(1),
  bankName: z.string().optional(),
  accountHolderName: z.string().min(1),
  accountNumber: z.string().min(1),
  makePrimary: z.boolean().optional(),
});

/** PATCH update body — expectedVersion required. */
export const bankAccountUpdateRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  bankCode: z.string().optional(),
  bankName: z.string().optional(),
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
});

export type BankAccountDto = z.infer<typeof bankAccountDtoSchema>;
export type BankAccountListDataDto = z.infer<typeof bankAccountListDataSchema>;
export type BankAccountCreateRequest = z.infer<
  typeof bankAccountCreateRequestSchema
>;
export type BankAccountUpdateRequest = z.infer<
  typeof bankAccountUpdateRequestSchema
>;

// --- Seller inventory (SEL-240) — masked list/detail; reveal is no-store ---

export const inventoryFieldDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  secret: z.boolean(),
  required: z.boolean().optional(),
  buyerCopyable: z.boolean().optional(),
  unique: z.boolean().optional(),
});

export const inventorySchemaDtoSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  storeId: z.string().min(1),
  version: z.number().int(),
  fields: z.array(inventoryFieldDefSchema),
  delimiter: z.string().optional(),
  checksum: z.string().min(1),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]),
});

export const inventoryProductSummaryDtoSchema = z.object({
  productId: z.string().min(1),
  storeId: z.string().min(1),
  title: z.string().optional().default(""),
  type: z.string().optional().default(""),
  activeSchemaVersion: z.number().int().nullable().optional(),
  available: z.number().int().min(0),
  reserved: z.number().int().min(0),
  delivered: z.number().int().min(0),
  revoked: z.number().int().min(0),
  total: z.number().int().min(0),
});

export const inventoryStockItemMaskedDtoSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  storeId: z.string().min(1),
  schemaVersion: z.number().int(),
  status: z.string().min(1),
  masked: z.record(z.string(), z.string()).default({}),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
});

export const inventoryProductDetailDataSchema = z.object({
  summary: inventoryProductSummaryDtoSchema,
  items: z.array(inventoryStockItemMaskedDtoSchema),
});

export const inventoryProductSummaryListEnvelopeSchema = successEnvelopeSchema(
  z.array(inventoryProductSummaryDtoSchema),
);

export const inventoryProductDetailEnvelopeSchema = successEnvelopeSchema(
  inventoryProductDetailDataSchema,
);

export const inventorySchemaEnvelopeSchema = successEnvelopeSchema(
  inventorySchemaDtoSchema,
);

export const inventoryImportResultSchema = z.object({
  imported: z.number().int().min(0),
  itemIds: z.array(z.string()),
});

export const inventoryImportEnvelopeSchema = successEnvelopeSchema(
  inventoryImportResultSchema,
);

export const inventoryRevealDataSchema = z.object({
  itemId: z.string().min(1),
  productId: z.string().min(1),
  schemaVersion: z.number().int().optional(),
  status: z.string().optional(),
  secrets: z.record(z.string(), z.string()),
  masked: z.record(z.string(), z.string()).optional(),
  auditId: z.string().min(1),
});

export const inventoryRevealEnvelopeSchema = successEnvelopeSchema(
  inventoryRevealDataSchema,
);

export const inventoryStockItemEnvelopeSchema = successEnvelopeSchema(
  inventoryStockItemMaskedDtoSchema,
);

export type InventoryFieldDefDto = z.infer<typeof inventoryFieldDefSchema>;
export type InventorySchemaDto = z.infer<typeof inventorySchemaDtoSchema>;
export type InventoryProductSummaryDto = z.infer<
  typeof inventoryProductSummaryDtoSchema
>;
export type InventoryStockItemMaskedDto = z.infer<
  typeof inventoryStockItemMaskedDtoSchema
>;
export type InventoryRevealDto = z.infer<typeof inventoryRevealDataSchema>;

// --- Seller coupons (SEL-280) — store-scoped lifecycle ---

/** BE Coupon DTO: integer IDR/bps only; state transitions via activate/pause/archive. */
export const couponDtoSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  merchantId: z.string().optional(),
  code: z.string().min(1),
  discountKind: z.enum(["PERCENT", "FIXED_IDR"]),
  discountValue: moneyIdrSchema,
  discountPercent: z.number().int().optional(),
  minMerchandise: moneyIdrSchema.optional(),
  maxTotalUses: z.number().int().min(0).optional(),
  maxPerCustomerUses: z.number().int().min(0).optional(),
  startsAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  endsAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  state: z.enum(["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"]),
  scope: z.enum(["ALL_PRODUCTS", "SELECTED_PRODUCTS"]),
  version: z.number().int().min(1),
  policyVersion: z.number().int().min(1),
  reservedCount: z.number().int().min(0).optional(),
  redeemedCount: z.number().int().min(0).optional(),
  usageCount: z.number().int().min(0).optional(),
  productIds: z.array(z.string()).optional(),
  createdAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
  updatedAt: z.union([rfc3339TimestampSchema, z.string().min(1)]).optional(),
});

export const couponEnvelopeSchema = successEnvelopeSchema(couponDtoSchema);

/** List is SuccessEnvelope of array (no NumberedPageList meta yet on BE). */
export const couponListEnvelopeSchema = successEnvelopeSchema(
  z.array(couponDtoSchema),
);

export const couponCreateRequestSchema = z.object({
  code: z.string().min(1).max(64),
  discountKind: z.enum(["PERCENT", "FIXED_IDR", "percentage", "fixed"]),
  discountValue: moneyIdrSchema,
  percentIsBps: z.boolean().optional(),
  minMerchandise: moneyIdrSchema.optional(),
  maxTotalUses: z.number().int().min(1).optional(),
  maxPerCustomerUses: z.number().int().min(1).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  scope: z.string().optional(),
  productIds: z.array(z.string()).optional(),
});

export const couponPatchRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  code: z.string().min(1).max(64).optional(),
  discountKind: z.string().optional(),
  discountValue: moneyIdrSchema.optional(),
  percentIsBps: z.boolean().optional(),
  minMerchandise: moneyIdrSchema.optional(),
  maxTotalUses: z.number().int().min(1).optional(),
  clearMaxTotalUses: z.boolean().optional(),
  maxPerCustomerUses: z.number().int().min(1).optional(),
  clearMaxPerCustomerUses: z.boolean().optional(),
  startsAt: z.string().optional(),
  clearStartsAt: z.boolean().optional(),
  endsAt: z.string().optional(),
  clearEndsAt: z.boolean().optional(),
  scope: z.string().optional(),
  productIds: z.array(z.string()).optional(),
});

export type CouponDto = z.infer<typeof couponDtoSchema>;
export type CouponCreateRequest = z.infer<typeof couponCreateRequestSchema>;
export type CouponPatchRequest = z.infer<typeof couponPatchRequestSchema>;

// --- Seller storefront studio (SEL-300) — draft / revision / publish ---

/** Opaque JSON object for storefront builder config (BE validates object only). */
export const storefrontConfigDtoSchema = z.record(z.string(), z.unknown());

export const storefrontRevisionDtoSchema = z.object({
  revision: z.number().int(),
  etag: z.string().min(1),
  status: z.enum(["draft", "published"]).optional(),
  config: storefrontConfigDtoSchema.optional(),
});

export const storefrontRevisionEnvelopeSchema = successEnvelopeSchema(
  storefrontRevisionDtoSchema,
);

export const storefrontStudioDtoSchema = z.object({
  storeId: z.string().min(1),
  draftRevision: z.number().int(),
  draftETag: z.string().min(1),
  draftConfig: storefrontConfigDtoSchema.optional(),
  publishedRevision: z.number().int().optional(),
  storefrontRevision: z.number().int().optional(),
  publishedETag: z.string().optional(),
  publishedConfig: storefrontConfigDtoSchema.optional(),
  publishedAt: z
    .union([rfc3339TimestampSchema, z.string().min(1)])
    .optional(),
});

export const storefrontStudioEnvelopeSchema = successEnvelopeSchema(
  storefrontStudioDtoSchema,
);

export const storefrontDraftRequestSchema = z.object({
  config: storefrontConfigDtoSchema,
  expectedRevision: z.number().int().optional(),
  expectedETag: z.string().optional(),
});

export const storefrontPublishRequestSchema = z.object({
  config: storefrontConfigDtoSchema.optional(),
  expectedRevision: z.number().int().optional(),
  expectedETag: z.string().optional(),
  revision: z.number().int().optional(),
});

export const storefrontPublishDtoSchema = z.object({
  accepted: z.boolean(),
  revision: z.number().int(),
  etag: z.string().optional(),
  requestId: z.string().min(1),
  storeId: z.string().optional(),
});

export const storefrontPublishEnvelopeSchema = successEnvelopeSchema(
  storefrontPublishDtoSchema,
);

export type StorefrontConfigDto = z.infer<typeof storefrontConfigDtoSchema>;
export type StorefrontRevisionDto = z.infer<typeof storefrontRevisionDtoSchema>;
export type StorefrontStudioDto = z.infer<typeof storefrontStudioDtoSchema>;
export type StorefrontDraftRequest = z.infer<typeof storefrontDraftRequestSchema>;
export type StorefrontPublishRequest = z.infer<
  typeof storefrontPublishRequestSchema
>;
export type StorefrontPublishDto = z.infer<typeof storefrontPublishDtoSchema>;

// --- Admin read models (ADM-120) — overview + shared list foundation ---

/** GET /v1/admin/overview — safe command-center KPIs (admin.dashboard.read). */
export const adminOverviewDataSchema = z.object({
  merchantCount: z.number().int().min(0),
  buyerCount: z.number().int().min(0),
  orderCount: z.number().int().min(0),
  paymentCount: z.number().int().min(0),
  pendingWithdrawalCount: z.number().int().min(0),
  openKycCount: z.number().int().min(0),
  grossVolumePaidIdr: moneyIdrSchema,
  platformFeePaidIdr: moneyIdrSchema,
  paymentSuccessRateBps: z.number().int().min(0),
  platformVolume: z.array(moneyIdrSchema).optional(),
});

export const adminOverviewEnvelopeSchema = successEnvelopeSchema(
  adminOverviewDataSchema,
);

/** GET /v1/admin/overview/platform-volume — 24 hourly gross paid IDR buckets. */
export const adminPlatformVolumeDataSchema = z.array(moneyIdrSchema);

export const adminPlatformVolumeEnvelopeSchema = successEnvelopeSchema(
  adminPlatformVolumeDataSchema,
);

export const adminMerchantDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  owner: z.string(),
  email: z.string(),
  volume: moneyIdrSchema,
  orders: z.number().int().min(0),
  risk: z.string(),
  status: z.string(),
  joined: z.string(),
  apiAccess: z.string(),
});

export const adminBuyerDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  verified: z.string(),
  purchases: z.number().int().min(0),
  spent: moneyIdrSchema,
  sessions: z.number().int().min(0),
  last: z.string(),
});

export const adminOrderDtoSchema = z.object({
  id: z.string().min(1),
  store: z.string(),
  customer: z.string(),
  product: z.string(),
  gross: moneyIdrSchema,
  totalFeeCharged: moneyIdrSchema,
  status: z.string(),
  payment: z.string(),
  created: z.string(),
  source: z.string(),
});

export const adminPaymentDtoSchema = z.object({
  id: z.string().min(1),
  provider: z.string(),
  merchant: z.string(),
  amount: moneyIdrSchema,
  providerRef: z.string(),
  status: z.string(),
  latency: z.string(),
  created: z.string(),
  source: z.string(),
});

/**
 * ADM-300 — provider-paid / local-pending mismatch row (read-only evidence).
 * UI cannot set paid or reconcile; amount is server IDR only.
 */
export const adminPaymentMismatchDtoSchema = z.object({
  id: z.string().min(1),
  paymentIntentId: z.string().min(1),
  orderId: z.string(),
  merchant: z.string(),
  merchantId: z.string().optional(),
  amount: moneyIdrSchema,
  provider: z.string(),
  providerStatus: z.string(),
  localStatus: z.string(),
  age: z.string().optional(),
  attempts: z.number().int().min(0),
  observedAt: z.string(),
  providerReference: z.string().optional(),
  alertCode: z.string().optional(),
  mismatchCode: z.string().optional(),
});

/** BE returns `{ items: [...] }` under data for mismatches. */
export const adminPaymentMismatchListDataSchema = z.object({
  items: z.array(adminPaymentMismatchDtoSchema),
});

/** Provider lookup acceptance — no client-chosen status mutation. */
export const adminProviderLookupResultSchema = z.object({
  paymentIntentId: z.string().min(1),
  localStatus: z.string(),
  provider: z.string(),
  providerReference: z.string().optional().default(""),
  source: z.string().optional(),
  lookup: z.string(),
  note: z.string().optional(),
});

/** Delivery resend acceptance. */
export const adminDeliveryResendResultSchema = z.object({
  accepted: z.boolean(),
});

export const adminWithdrawalDtoSchema = z.object({
  id: z.string().min(1),
  merchant: z.string(),
  owner: z.string(),
  amount: moneyIdrSchema,
  bank: z.string(),
  account: z.string(),
  risk: z.string(),
  status: z.string(),
  requested: z.string(),
  source: z.string(),
  providerProcessingFee: moneyIdrSchema.nullable(),
  providerFeeStatus: z.string(),
  providerFeeReference: z.string().optional(),
});

export const adminAuditEventDtoSchema = z.object({
  id: z.string().min(1),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  ip: z.string(),
  result: z.string(),
  time: z.string(),
  context: z.string().optional(),
  previousHash: z.string().optional(),
  integrityHash: z.string().optional(),
});

export const adminReviewDtoSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  product: z.string(),
  seller: z.string(),
  buyer: z.string(),
  initials: z.string(),
  rating: z.number().int(),
  title: z.string(),
  body: z.string(),
  verified: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
  sellerReply: z.string().optional(),
});

/**
 * ADM-210 — admin purchase shell only. Unknown keys stripped; never delivery
 * secret/credential/code/password fields on this projection.
 */
export const adminBuyerPurchaseDtoSchema = z.object({
  orderId: z.string().min(1),
  product: z.string(),
  seller: z.string(),
  status: z.string(),
});

/** ADM-210 — session metadata; hashed/display IP only, no tokens. */
export const adminBuyerSessionDtoSchema = z.object({
  id: z.string().min(1),
  device: z.string(),
  location: z.string(),
  ip: z.string(),
  active: z.string(),
  current: z.boolean().optional().default(false),
});

export const adminInventoryFieldDtoSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  secret: z.boolean(),
  required: z.boolean(),
  buyerCopyable: z.boolean(),
});

export const adminStockProductDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.string(),
  available: z.number().int().min(0),
  reserved: z.number().int().min(0),
  sold: z.number().int().min(0),
  invalid: z.number().int().min(0),
  lowAt: z.number().int().min(0),
  delivery: z.string(),
});

export const adminStockItemDtoSchema = z.object({
  id: z.string().min(1),
  schemaPreview: z.string(),
  status: z.string(),
  orderId: z.string().optional(),
  createdAt: z.string(),
});

export const adminInventorySnapshotDtoSchema = z.object({
  products: z.array(adminStockProductDtoSchema),
  items: z.array(adminStockItemDtoSchema),
  schema: z.array(adminInventoryFieldDtoSchema),
});

/** Bounded admin list (BE cursor meta; FE screens may still client-page until domain tasks). */
export const adminBoundedListMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: rfc3339TimestampSchema,
  nextCursor: z.string().nullable().optional(),
  previousCursor: z.string().nullable().optional(),
  hasMore: z.boolean().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).optional(),
  totalCount: z.number().int().min(0).optional(),
  pageCount: z.number().int().min(0).optional(),
});

export function adminListEnvelopeSchema<TSchema extends z.ZodType>(
  itemSchema: TSchema,
) {
  return z.object({
    data: z.array(itemSchema),
    meta: adminBoundedListMetaSchema,
  });
}

export const adminMerchantListEnvelopeSchema =
  adminListEnvelopeSchema(adminMerchantDtoSchema);
export const adminBuyerListEnvelopeSchema =
  adminListEnvelopeSchema(adminBuyerDtoSchema);
export const adminOrderListEnvelopeSchema =
  adminListEnvelopeSchema(adminOrderDtoSchema);
export const adminPaymentListEnvelopeSchema =
  adminListEnvelopeSchema(adminPaymentDtoSchema);
export const adminWithdrawalListEnvelopeSchema = adminListEnvelopeSchema(
  adminWithdrawalDtoSchema,
);
export const adminAuditEventListEnvelopeSchema = adminListEnvelopeSchema(
  adminAuditEventDtoSchema,
);
export const adminReviewListEnvelopeSchema =
  adminListEnvelopeSchema(adminReviewDtoSchema);
export const adminBuyerPurchaseListEnvelopeSchema = adminListEnvelopeSchema(
  adminBuyerPurchaseDtoSchema,
);
export const adminBuyerSessionListEnvelopeSchema = adminListEnvelopeSchema(
  adminBuyerSessionDtoSchema,
);

export const adminMerchantEnvelopeSchema = successEnvelopeSchema(
  adminMerchantDtoSchema,
);
export const adminBuyerEnvelopeSchema =
  successEnvelopeSchema(adminBuyerDtoSchema);
export const adminOrderEnvelopeSchema =
  successEnvelopeSchema(adminOrderDtoSchema);
export const adminPaymentEnvelopeSchema =
  successEnvelopeSchema(adminPaymentDtoSchema);
export const adminPaymentMismatchListEnvelopeSchema = successEnvelopeSchema(
  adminPaymentMismatchListDataSchema,
);
export const adminProviderLookupEnvelopeSchema = successEnvelopeSchema(
  adminProviderLookupResultSchema,
);
export const adminDeliveryResendEnvelopeSchema = successEnvelopeSchema(
  adminDeliveryResendResultSchema,
);
export const adminWithdrawalEnvelopeSchema = successEnvelopeSchema(
  adminWithdrawalDtoSchema,
);
export const adminInventoryEnvelopeSchema = successEnvelopeSchema(
  adminInventorySnapshotDtoSchema,
);

/** Default/max page size for admin bounded list reads (matches BE MaxListLimit). */
export const ADMIN_LIST_DEFAULT_LIMIT = 50;
export const ADMIN_LIST_MAX_LIMIT = 100;

/** ADM-200 — admin merchant finance projection (read-only; merchants.read). */
export const adminMerchantFinanceSummaryDataSchema = z.object({
  merchantId: z.string().min(1),
  paymentMode: z.string().optional(),
  availableAmount: moneyIdrSchema,
  pendingAmount: moneyIdrSchema,
  heldAmount: moneyIdrSchema,
  lifetimeGrossAmount: moneyIdrSchema.optional(),
  lifetimeNetAmount: moneyIdrSchema.optional(),
  sources: z
    .record(
      z.string(),
      z.object({
        availableAmount: moneyIdrSchema.optional(),
        pendingAmount: moneyIdrSchema.optional(),
      }),
    )
    .optional(),
  currency: z.literal("IDR").optional(),
  asOf: rfc3339TimestampSchema.optional(),
});

export const adminMerchantFinanceSummaryEnvelopeSchema = successEnvelopeSchema(
  adminMerchantFinanceSummaryDataSchema,
);

/** Typed status/api-access command results (ADM-200). */
export const adminMerchantStatusUpdateDataSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  displayName: z.string().optional(),
});

export const adminMerchantStatusUpdateEnvelopeSchema = successEnvelopeSchema(
  adminMerchantStatusUpdateDataSchema,
);

export const adminMerchantApiAccessUpdateDataSchema = z.object({
  merchantId: z.string().min(1),
  status: z.string().min(1),
  paymentMode: z.string().optional(),
  capability: z.string().optional(),
});

export const adminMerchantApiAccessUpdateEnvelopeSchema = successEnvelopeSchema(
  adminMerchantApiAccessUpdateDataSchema,
);

/** Masked credential list — never raw key (ADM-200). */
export const adminMaskedCredentialDtoSchema = z.object({
  id: z.string().min(1),
  merchantId: z.string().optional(),
  keyPrefix: z.string().optional(),
  fingerprint: z.string().optional(),
  paymentMode: z.string().optional(),
  status: z.string(),
  name: z.string().optional(),
  keyVersion: z.number().int().optional(),
  lastUsedAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const adminCredentialIssuanceDtoSchema = z.object({
  id: z.string().min(1).optional(),
  status: z.string().optional(),
  merchantId: z.string().optional(),
  authorizedAt: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();

export const adminMerchantCredentialsDataSchema = z.object({
  credentials: z.array(adminMaskedCredentialDtoSchema),
  issuances: z.array(adminCredentialIssuanceDtoSchema).optional(),
});

export const adminMerchantCredentialsEnvelopeSchema = successEnvelopeSchema(
  adminMerchantCredentialsDataSchema,
);

export const adminCredentialAuthorizeDataSchema = z
  .object({
    id: z.string().optional(),
    status: z.string().optional(),
    merchantId: z.string().optional(),
  })
  .passthrough()
  .refine(
    (v) =>
      !JSON.stringify(v).includes("fsk_live_") &&
      !JSON.stringify(v).includes("fsk_test_"),
    { message: "Admin credential response must never include raw key material" },
  );

export const adminCredentialAuthorizeEnvelopeSchema = successEnvelopeSchema(
  adminCredentialAuthorizeDataSchema,
);

// --- ADM-220 staff / roles / permissions / invitations ---

/** GET /v1/admin/roles item (RoleDTO). */
export const adminRoleDtoSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string(),
  description: z.string().optional().default(""),
  isSystem: z.boolean(),
  version: z.number().int().min(0),
  permissions: z.array(z.string()).default([]),
  createdAt: rfc3339TimestampSchema.optional(),
  updatedAt: rfc3339TimestampSchema.optional(),
  archivedAt: rfc3339TimestampSchema.nullable().optional(),
});

export const adminRoleListDataSchema = z.object({
  items: z.array(adminRoleDtoSchema),
});

export const adminRoleListEnvelopeSchema = successEnvelopeSchema(
  adminRoleListDataSchema,
);

export const adminRoleEnvelopeSchema =
  successEnvelopeSchema(adminRoleDtoSchema);

/** GET /v1/admin/permissions — flat registry; FE groups by category. */
export const adminPermissionRegistryItemSchema = z.object({
  code: z.string().min(1),
  description: z.string().optional().default(""),
  category: z.string().optional().default("Platform"),
});

export const adminPermissionRegistryDataSchema = z.object({
  items: z.array(adminPermissionRegistryItemSchema),
});

export const adminPermissionRegistryEnvelopeSchema = successEnvelopeSchema(
  adminPermissionRegistryDataSchema,
);

/** GET /v1/admin/users — UserLookup[] in data (array, not items). */
export const adminUserLookupDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  status: z.string(),
  isAdmin: z.boolean(),
  ownerMerchantId: z.string().nullable().optional(),
  impersonatable: z.boolean().optional().default(false),
  createdAt: z.string().optional().default(""),
});

export const adminUserLookupListEnvelopeSchema = successEnvelopeSchema(
  z.array(adminUserLookupDtoSchema),
);

export const adminUserLookupEnvelopeSchema = successEnvelopeSchema(
  adminUserLookupDtoSchema,
);

/** GET /v1/admin/users/{id}/roles */
export const adminUserRoleAssignmentDtoSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  roleCode: z.string().optional().default(""),
  roleName: z.string().optional().default(""),
  isSystem: z.boolean().optional().default(false),
  assignedAt: z.string().optional().default(""),
  assignedBy: z.string().optional(),
});

export const adminUserRoleAssignmentListDataSchema = z.object({
  items: z.array(adminUserRoleAssignmentDtoSchema),
});

export const adminUserRoleAssignmentListEnvelopeSchema = successEnvelopeSchema(
  adminUserRoleAssignmentListDataSchema,
);

export const adminAssignUserRoleDataSchema = z.object({
  assigned: z.boolean(),
});

export const adminAssignUserRoleEnvelopeSchema = successEnvelopeSchema(
  adminAssignUserRoleDataSchema,
);

export const adminRemoveUserRoleDataSchema = z.object({
  removed: z.boolean(),
});

export const adminRemoveUserRoleEnvelopeSchema = successEnvelopeSchema(
  adminRemoveUserRoleDataSchema,
);

/**
 * Staff invitation list item — never includes raw token.
 * Create response may include token once (delivery boundary only).
 */
export const adminStaffInvitationDtoSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  roleId: z.string().min(1),
  status: z.string(),
  expiresAt: z.string().optional().default(""),
  createdAt: z.string().optional().default(""),
});

export const adminStaffInvitationListDataSchema = z.object({
  items: z.array(adminStaffInvitationDtoSchema),
});

export const adminStaffInvitationListEnvelopeSchema = successEnvelopeSchema(
  adminStaffInvitationListDataSchema,
);

/** Create may return token once; strip before list cache. */
export const adminStaffInvitationCreateDataSchema =
  adminStaffInvitationDtoSchema.extend({
    token: z.string().optional(),
  });

export const adminStaffInvitationCreateEnvelopeSchema = successEnvelopeSchema(
  adminStaffInvitationCreateDataSchema,
);

export const adminStaffInvitationRevokeDataSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
});

export const adminStaffInvitationRevokeEnvelopeSchema = successEnvelopeSchema(
  adminStaffInvitationRevokeDataSchema,
);

export const adminRoleArchiveDataSchema = z.object({
  id: z.string().min(1),
  code: z.string().optional(),
  version: z.number().int().min(0),
  archivedAt: z.string().nullable().optional(),
});

export const adminRoleArchiveEnvelopeSchema = successEnvelopeSchema(
  adminRoleArchiveDataSchema,
);

/** POST /v1/invitations/staff/accept (public ceremony). */
export const staffInvitationAcceptDataSchema = z.object({
  invitationId: z.string().optional(),
  kind: z.string().optional(),
  userId: z.string().optional(),
  existingUser: z.boolean().optional(),
  requiresMfa: z.boolean().optional(),
  activationHeld: z.boolean().optional(),
  message: z.string().optional(),
  roleId: z.string().optional(),
  merchantId: z.string().optional(),
});

export const staffInvitationAcceptEnvelopeSchema = successEnvelopeSchema(
  staffInvitationAcceptDataSchema,
);

export type AdminOverviewDto = z.infer<typeof adminOverviewDataSchema>;
export type AdminMerchantDto = z.infer<typeof adminMerchantDtoSchema>;
export type AdminBuyerDto = z.infer<typeof adminBuyerDtoSchema>;
export type AdminBuyerPurchaseDto = z.infer<typeof adminBuyerPurchaseDtoSchema>;
export type AdminBuyerSessionDto = z.infer<typeof adminBuyerSessionDtoSchema>;
export type AdminOrderDto = z.infer<typeof adminOrderDtoSchema>;
export type AdminPaymentDto = z.infer<typeof adminPaymentDtoSchema>;
export type AdminPaymentMismatchDto = z.infer<
  typeof adminPaymentMismatchDtoSchema
>;
export type AdminProviderLookupResultDto = z.infer<
  typeof adminProviderLookupResultSchema
>;
export type AdminWithdrawalDto = z.infer<typeof adminWithdrawalDtoSchema>;
export type AdminAuditEventDto = z.infer<typeof adminAuditEventDtoSchema>;
export type AdminReviewDto = z.infer<typeof adminReviewDtoSchema>;
export type AdminInventorySnapshotDto = z.infer<
  typeof adminInventorySnapshotDtoSchema
>;
export type AdminBoundedListMeta = z.infer<typeof adminBoundedListMetaSchema>;
export type AdminMerchantFinanceSummaryDto = z.infer<
  typeof adminMerchantFinanceSummaryDataSchema
>;
export type AdminMaskedCredentialDto = z.infer<
  typeof adminMaskedCredentialDtoSchema
>;
export type AdminRoleDto = z.infer<typeof adminRoleDtoSchema>;
export type AdminPermissionRegistryItemDto = z.infer<
  typeof adminPermissionRegistryItemSchema
>;
export type AdminUserLookupDto = z.infer<typeof adminUserLookupDtoSchema>;
export type AdminUserRoleAssignmentDto = z.infer<
  typeof adminUserRoleAssignmentDtoSchema
>;
export type AdminStaffInvitationDto = z.infer<
  typeof adminStaffInvitationDtoSchema
>;
export type StaffInvitationAcceptDto = z.infer<
  typeof staffInvitationAcceptDataSchema
>;

