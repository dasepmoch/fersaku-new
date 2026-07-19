/**
 * Invoice DTO → view models (CHK-150). Pure; no React.
 * Money from backend only — never recompute totals from lines.
 */

import type {
  InvoiceDto,
  InvoiceSnapshotDto,
  PublicInvoiceVerifyDto,
} from "@/shared/api/schemas";
import { invalidApiContract, requireSafeMoneyIdr } from "@/shared/api/mappers";
import type {
  InvoiceLineView,
  InvoiceProjection,
  InvoiceVerifyResult,
} from "./contracts";

function asSnapshot(raw: InvoiceDto["snapshot"]): InvoiceSnapshotDto | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as InvoiceSnapshotDto;
}

function formatIssuedLabel(iso: string | null | undefined): string {
  if (!iso) return "Diterbitkan";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `Diterbitkan ${iso}`;
  try {
    const label = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(d);
    return `Diterbitkan ${label}`;
  } catch {
    return `Diterbitkan ${iso}`;
  }
}

function formatPaidSummary(
  paidAt: string | null | undefined,
  providerHint?: string,
): string {
  const when = paidAt
    ? (() => {
        const d = new Date(paidAt);
        if (Number.isNaN(d.getTime())) return paidAt;
        try {
          return new Intl.DateTimeFormat("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Jakarta",
            timeZoneName: "short",
          }).format(d);
        } catch {
          return paidAt;
        }
      })()
    : undefined;
  const via = providerHint?.trim() || "QRIS";
  if (when) {
    return `Dibayar via ${via} - ${when}. Scan QR untuk memeriksa keaslian, status, nilai, dan tanda tangan dokumen ini langsung di Fersaku.`;
  }
  return `Pembayaran terverifikasi via ${via}. Scan QR untuk memeriksa keaslian, status, nilai, dan tanda tangan dokumen ini langsung di Fersaku.`;
}

function formatPaidAtLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

/** Short signature label from payload hash (display only). */
export function formatSignatureLabel(payloadHash: string): string {
  const h = payloadHash.trim();
  if (!h) return "SHA256:—";
  const upper = h.toUpperCase();
  if (upper.startsWith("SHA256:")) {
    const body = upper.slice(7);
    if (body.length <= 12) return upper;
    return `SHA256:${body.slice(0, 8)}...${body.slice(-4)}`;
  }
  if (h.length <= 12) return `SHA256:${upper}`;
  return `SHA256:${upper.slice(0, 8)}...${upper.slice(-4)}`;
}

function mapLines(snap: InvoiceSnapshotDto | null): InvoiceLineView[] {
  const lines = snap?.lines;
  if (!lines?.length) return [];
  return lines.map((line) => {
    const amount = requireSafeMoneyIdr(line.lineTotalIdr, "lineTotalIdr");
    const qty = line.quantity ?? 1;
    const version = line.version?.trim();
    const type = line.productType?.trim();
    const detailParts = [
      type ? String(type) : undefined,
      version ? `v${version}` : undefined,
      qty > 1 ? `qty ${qty}` : undefined,
    ].filter(Boolean);
    return {
      item: line.title.trim() || "Item",
      detail: detailParts.join(" - ") || "Digital product",
      amount,
    };
  });
}

function buyerNote(snap: InvoiceSnapshotDto | null): string {
  const email = snap?.buyer?.email?.trim();
  if (email) return email;
  return "";
}

function issuerNote(snap: InvoiceSnapshotDto | null): string {
  // Store-level only — no merchant internal IDs in UI note.
  const storeId = snap?.issuer?.storeId?.trim();
  if (storeId) return "Fersaku storefront";
  return "Fersaku";
}

export type MapInvoiceOptions = {
  /** Prefer buyer portal back link when true. */
  surface: "buyer" | "order";
};

/**
 * Map authorized invoice envelope data → print projection.
 * Gross/subtotal/tip/discount/fee from snapshot/header — never sum lines.
 */
export function mapInvoiceDto(
  dto: InvoiceDto,
  options: MapInvoiceOptions,
): InvoiceProjection {
  const grossIdr = requireSafeMoneyIdr(dto.grossIdr, "grossIdr");
  if (grossIdr < 0) {
    return invalidApiContract("Invoice gross out of range", {
      issues: [{ path: "grossIdr", message: "must be non-negative" }],
    });
  }

  const snap = asSnapshot(dto.snapshot);
  const subtotalIdr =
    snap?.subtotalIdr !== undefined
      ? requireSafeMoneyIdr(snap.subtotalIdr, "subtotalIdr")
      : grossIdr;
  const tipIdr =
    snap?.tipIdr !== undefined ? requireSafeMoneyIdr(snap.tipIdr, "tipIdr") : 0;
  const discountIdr =
    snap?.discountIdr !== undefined
      ? requireSafeMoneyIdr(snap.discountIdr, "discountIdr")
      : 0;
  const feeIdr =
    snap?.feeIdr !== undefined ? requireSafeMoneyIdr(snap.feeIdr, "feeIdr") : 0;

  const orderNumber = snap?.orderNumber?.trim() || undefined;
  const displayOrderId = orderNumber || dto.orderId;
  const paidAt =
    (typeof dto.paidAt === "string" ? dto.paidAt : undefined) ||
    (typeof snap?.paidAt === "string" ? snap.paidAt : undefined) ||
    undefined;

  const publicCode = dto.publicCode?.trim();
  const verificationToken = publicCode || undefined;
  const verificationPath = verificationToken
    ? `/invoices/verify/${encodeURIComponent(verificationToken)}`
    : undefined;

  const backHref =
    options.surface === "buyer"
      ? `/account/purchases/${encodeURIComponent(displayOrderId)}`
      : `/orders/${encodeURIComponent(displayOrderId)}/success`;

  const lines = mapLines(snap);
  // If BE omitted structured lines, still show a single placeholder line from gross
  // only when no lines — avoid inventing product titles beyond issuer/store.
  const displayLines: InvoiceLineView[] =
    lines.length > 0
      ? lines
      : [
          {
            item: snap?.issuer?.storeName?.trim() || "Produk digital",
            detail: "Digital product",
            amount: grossIdr,
          },
        ];

  const projection: InvoiceProjection = {
    invoiceId: dto.id,
    orderId: dto.orderId,
    invoiceNumber: dto.invoiceNumber,
    status: dto.status,
    currency: dto.currency || "IDR",
    grossIdr,
    subtotalIdr,
    tipIdr,
    discountIdr,
    feeIdr,
    issuedLabel: formatIssuedLabel(paidAt),
    buyerName: snap?.buyer?.name?.trim() || "Pembeli",
    buyerNote: buyerNote(snap),
    issuerName: snap?.issuer?.storeName?.trim() || "Seller",
    issuerNote: issuerNote(snap),
    lines: displayLines,
    payloadHash: dto.payloadHash,
    signatureLabel: formatSignatureLabel(dto.payloadHash),
    paymentSummary: formatPaidSummary(paidAt),
    backHref,
    canPrint: true,
  };
  if (orderNumber) projection.orderNumber = orderNumber;
  if (snap?.couponCode?.trim()) projection.couponCode = snap.couponCode.trim();
  if (paidAt) projection.paidAt = paidAt;
  if (verificationToken) projection.verificationToken = verificationToken;
  if (verificationPath) projection.verificationPath = verificationPath;
  return projection;
}

/** Map public verify DTO — never invent valid=true. */
export function mapPublicInvoiceVerifyDto(
  dto: PublicInvoiceVerifyDto,
): InvoiceVerifyResult {
  if (!dto.valid) {
    return { valid: false };
  }
  const invoiceNumber = dto.invoiceNumber?.trim();
  if (!invoiceNumber) {
    // Valid flag without identity is unsafe — treat as invalid.
    return { valid: false };
  }
  const grossIdr =
    dto.grossIdr !== undefined
      ? requireSafeMoneyIdr(dto.grossIdr, "grossIdr")
      : 0;
  const orderNumber = dto.orderNumber?.trim() || undefined;
  const paidAt = typeof dto.paidAt === "string" ? dto.paidAt : undefined;

  const result: Extract<InvoiceVerifyResult, { valid: true }> = {
    valid: true,
    invoiceNumber,
    currency: dto.currency?.trim() || "IDR",
    grossIdr,
    paidAtLabel: formatPaidAtLabel(paidAt),
    storeName: dto.storeName?.trim() || "Store",
    // Public verify has no payloadHash — show document number only.
    signatureLabel: `DOC:${invoiceNumber}`,
  };
  if (orderNumber) {
    result.orderNumber = orderNumber;
    result.invoiceHref = `/orders/${encodeURIComponent(orderNumber)}/invoice`;
  }
  return result;
}

/** Deterministic mock projection matching frozen InvoiceView demo geometry. */
export function buildMockInvoiceProjection(input: {
  orderId: string;
  surface: "buyer" | "order";
}): InvoiceProjection {
  const orderId = input.orderId.trim() || "FRS-240712-1848";
  const pretty = orderId.startsWith("FRS-") ? orderId : `FRS-${orderId}`;
  const verificationToken = `${pretty}-6AD891CE`;
  return mapInvoiceDto(
    {
      id: `inv_mock_${pretty}`,
      orderId: pretty,
      storeId: "store_mock",
      invoiceNumber: `INV-${pretty.replace("FRS-", "")}`,
      status: "READY",
      currency: "IDR",
      grossIdr: 129_000,
      paidAt: "2026-07-12T07:42:00Z",
      currentVersion: 1,
      payloadHash: "6AD891CE0000000000000000000000CB42",
      rendererVersion: "v1",
      renderStatus: "READY",
      publicCode: verificationToken,
      snapshot: {
        invoiceNumber: `INV-${pretty.replace("FRS-", "")}`,
        orderId: pretty,
        orderNumber: pretty,
        currency: "IDR",
        subtotalIdr: 118_000,
        discountIdr: 14_000,
        tipIdr: 25_000,
        feeIdr: 0,
        grossIdr: 129_000,
        couponCode: "LAUNCH10",
        paidAt: "2026-07-12T07:42:00Z",
        buyer: {
          name: "Nadia Putri",
          email: "nadia@studio.id",
        },
        issuer: {
          storeId: "store_mock",
          storeName: "Asep AI Tools",
          merchantId: "m_mock",
        },
        lines: [
          {
            title: "AI Prompt Pack",
            productType: "Digital download - lisensi personal",
            version: "3.1",
            unitPriceIdr: 79_000,
            quantity: 1,
            lineTotalIdr: 79_000,
          },
          {
            title: "Cursor Rules Kit",
            productType: "Checkout offer - digital download",
            unitPriceIdr: 39_000,
            quantity: 1,
            lineTotalIdr: 39_000,
          },
        ],
        rendererVersion: "v1",
      },
    },
    { surface: input.surface },
  );
}

/** Mock valid public verify (privacy-safe fields only). */
export function buildMockInvoiceVerify(token: string): InvoiceVerifyResult {
  const t = token.trim();
  // Match legacy demo token shape OR any non-empty mock-friendly token.
  if (!t) return { valid: false };
  if (t === "invalid" || t === "tampered" || t.length < 4) {
    return { valid: false };
  }
  const orderNumber = t.replace(/-[^-]+$/, "") || "FRS-240712-1848";
  return mapPublicInvoiceVerifyDto({
    valid: true,
    invoiceNumber: `INV-${orderNumber.replace("FRS-", "")}`,
    orderNumber,
    currency: "IDR",
    grossIdr: 129_000,
    paidAt: "2026-07-12T07:42:00Z",
    storeName: "Asep AI Tools",
  });
}
