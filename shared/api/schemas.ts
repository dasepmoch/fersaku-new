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
