/**
 * Seller order transport DTO → existing SellerOrder view (SEL-250 / UI-040).
 * Never calculate net/fee from UI guesses; use server snapshot integers.
 */

import type {
  SellerOrderDetailDto,
  SellerOrderSummaryDto,
  SellerOrderTimelineEventDto,
} from "@/shared/api/schemas";
import { requireSafeMoneyIdr } from "@/shared/api/mappers";
import type {
  OrderStatus,
  SellerOrder,
  SellerOrderListFilters,
  SellerOrderPage,
  SellerOrderStatusTab,
  SellerOrderTimelineItem,
} from "./contracts";

function formatOrderDate(iso: string): string {
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
    }).format(d);
  } catch {
    return iso;
  }
}

function formatTimelineDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return iso;
  }
}

function formatTimelineTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return "";
  }
}

/** Map backend payment_status → existing OrderStatus badge labels. */
export function mapSellerOrderPaymentStatus(status: string): OrderStatus {
  const u = status.trim().toUpperCase();
  if (u === "PAID") return "Paid";
  if (u === "FAILED" || u === "EXPIRED" || u === "CANCELLED") return "Failed";
  if (u === "PENDING" || u === "UNPAID") return "Pending";
  // Late paid / delivery-active may still show Paid when payment is settled.
  return "Pending";
}

/**
 * UI status tab → backend payment_status query value.
 * "Semua" clears the filter.
 */
export function mapStatusTabToPaymentStatus(
  tab: SellerOrderStatusTab | undefined,
): string | undefined {
  if (!tab || tab === "Semua") return undefined;
  if (tab === "Paid") return "PAID";
  if (tab === "Pending") return "PENDING";
  if (tab === "Failed") return "FAILED";
  return undefined;
}

export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function mapSellerOrderSummaryDto(dto: SellerOrderSummaryDto): SellerOrder {
  const amount = requireSafeMoneyIdr(dto.grossIdr, "grossIdr");
  const feeIdr = requireSafeMoneyIdr(dto.feeIdr, "feeIdr");
  const merchantNetIdr = requireSafeMoneyIdr(dto.merchantNetIdr, "merchantNetIdr");
  const when = dto.paidAt || dto.createdAt;
  return {
    id: dto.orderNumber || dto.orderId,
    internalOrderId: dto.orderId,
    storeId: dto.storeId,
    customer: dto.buyerName || "—",
    email: dto.buyerEmail || "",
    product: dto.productTitle || dto.orderNumber,
    amount,
    status: mapSellerOrderPaymentStatus(dto.paymentStatus),
    date: formatOrderDate(typeof when === "string" ? when : String(when)),
    avatar: initialsFromName(dto.buyerName || dto.buyerEmail || "•"),
    feeIdr,
    merchantNetIdr,
  };
}

export function mapSellerOrderSummaryListDto(
  rows: SellerOrderSummaryDto[],
): SellerOrder[] {
  return rows.map(mapSellerOrderSummaryDto);
}

function mapTimeline(
  events: SellerOrderTimelineEventDto[] | undefined,
): SellerOrderTimelineItem[] {
  if (!events?.length) return [];
  return events.map((e) => {
    const at = typeof e.at === "string" ? e.at : String(e.at);
    return {
      label: e.label,
      atDisplay: formatTimelineDate(at),
      timeDisplay: formatTimelineTime(at),
    };
  });
}

export function mapSellerOrderDetailDto(dto: SellerOrderDetailDto): SellerOrder {
  const amount = requireSafeMoneyIdr(dto.grossIdr, "grossIdr");
  const feeIdr = requireSafeMoneyIdr(dto.feeIdr, "feeIdr");
  const merchantNetIdr = requireSafeMoneyIdr(dto.merchantNetIdr, "merchantNetIdr");
  const when = dto.paidAt || dto.createdAt;
  const primary = dto.items[0];
  const grant = dto.grants[0];
  const product =
    dto.productTitle ||
    primary?.productTitle ||
    dto.orderNumber;

  let delivery: SellerOrder["delivery"];
  if (grant) {
    const status = grant.status.toUpperCase();
    const fulfilled =
      status === "ACTIVE" ||
      status === "FULFILLED" ||
      status === "DELIVERED" ||
      Boolean(grant.activatedAt);
    delivery = {
      fulfilled,
      status: grant.status,
      accessCount: grant.accessCount,
      maxAccesses: grant.maxAccesses,
      summary: fulfilled
        ? `Link download dibuat dan dikirim ke ${dto.buyerEmail || "pembeli"}. Digunakan ${grant.accessCount} dari ${grant.maxAccesses} kali.`
        : `Delivery ${grant.status.toLowerCase()}.`,
    };
  }

  let payment: SellerOrder["payment"];
  if (dto.payment) {
    const provider = dto.payment.provider || "—";
    payment = {
      method: dto.payment.source === "QRIS_API" ? "QRIS API" : "QRIS",
      paymentIntent: dto.payment.providerReference || dto.payment.paymentIntentId,
      provider,
      status: mapSellerOrderPaymentStatus(dto.paymentStatus),
    };
  }

  return {
    id: dto.orderNumber || dto.orderId,
    internalOrderId: dto.orderId,
    storeId: dto.storeId,
    customer: dto.buyerName || "—",
    email: dto.buyerEmail || "",
    product,
    amount,
    status: mapSellerOrderPaymentStatus(dto.paymentStatus),
    date: formatOrderDate(typeof when === "string" ? when : String(when)),
    avatar: initialsFromName(dto.buyerName || dto.buyerEmail || "•"),
    feeIdr,
    merchantNetIdr,
    payment,
    delivery,
    timeline: mapTimeline(dto.timeline),
  };
}

/** Build NumberedPageList view from envelope data + meta. */
export function mapSellerOrderListEnvelope(
  data: SellerOrderSummaryDto[],
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    pageCount: number;
  },
): SellerOrderPage {
  return {
    items: mapSellerOrderSummaryListDto(data),
    page: meta.page,
    pageSize: meta.pageSize,
    totalCount: meta.totalCount,
    pageCount: meta.pageCount,
  };
}

/** Client-side filter for mock path only (mirrors server status/q mapping). */
export function applySellerOrderListFilters(
  items: SellerOrder[],
  filters?: SellerOrderListFilters,
): SellerOrder[] {
  if (!filters) return items;
  const q = (filters.q ?? "").trim().toLowerCase();
  const tab = filters.statusTab ?? "Semua";
  return items.filter((o) => {
    if (tab !== "Semua" && o.status !== tab) return false;
    if (!q) return true;
    return (
      o.id.toLowerCase().includes(q) ||
      o.customer.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      o.product.toLowerCase().includes(q)
    );
  });
}

/** Assert list/detail view never carries secret-like keys. */
export function assertNoDeliverySecretsInSellerOrder(order: SellerOrder): void {
  const raw = JSON.stringify(order);
  if (/secret|password|accessToken|tokenHash|rawToken/i.test(raw)) {
    throw new Error("Seller order view must not include delivery secrets");
  }
}
