/**
 * CHK-150 — invoice read / print / public verify view models.
 * Projection is backend authority; client never recomputes fee/total.
 */

/** Line row for existing InvoiceView markup. */
export type InvoiceLineView = {
  item: string;
  detail: string;
  amount: number;
};

/**
 * Authorized invoice projection for print/download chrome.
 * Money is integer IDR from backend snapshot only.
 */
export type InvoiceProjection = {
  invoiceId: string;
  orderId: string;
  /** Pretty order number when present (display / back link). */
  orderNumber?: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  /** Server gross — never recompute from lines. */
  grossIdr: number;
  subtotalIdr: number;
  tipIdr: number;
  discountIdr: number;
  feeIdr: number;
  couponCode?: string;
  paidAt?: string;
  issuedLabel: string;
  buyerName: string;
  buyerNote: string;
  issuerName: string;
  issuerNote: string;
  lines: InvoiceLineView[];
  /** Payload hash (document signature display). */
  payloadHash: string;
  signatureLabel: string;
  /**
   * Public verify path segment when BE projects publicCode.
   * When absent, QR/path uses payloadHash-derived stable display token only if
   * already known — otherwise verification URL omitted (print still valid).
   */
  verificationToken?: string;
  verificationPath?: string;
  paymentSummary: string;
  /** Back link target (buyer portal vs order path). */
  backHref: string;
  canPrint: true;
};

/**
 * Public verify result — minimum safe fields only.
 * Invalid/missing → invalid (never fabricate valid invoice).
 */
export type InvoiceVerifyResult =
  | {
      valid: true;
      invoiceNumber: string;
      orderNumber?: string;
      currency: string;
      grossIdr: number;
      paidAtLabel: string;
      storeName: string;
      signatureLabel: string;
      /** Owner invoice link only when order number known; still auth-gated. */
      invoiceHref?: string;
    }
  | { valid: false };

/** Frozen capability / privacy semantics (CHK-150). */
export const INVOICE_SEMANTICS = {
  projection:
    "Backend immutable snapshot only — no client fee/total recomputation.",
  ownership:
    "Buyer session for /account/.../invoice; order session for /orders/.../invoice; foreign → safe 404.",
  guest:
    "Guest order-result invoice CTA is login-gated when no capability exchange is advertised; no fake PDF download.",
  print:
    "Print/download only from verified server projection (window.print); no-store on private reads.",
  publicVerify:
    "Path/code token is public verify code (hashed at rest); response never includes buyer PII/secrets.",
  invalid:
    "Invalid/tampered/revoked → invalid composition; never fabricate valid.",
  noSecrets: "Delivery secrets never on invoice projection.",
} as const;
