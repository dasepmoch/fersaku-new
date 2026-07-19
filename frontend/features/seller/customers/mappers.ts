/**
 * Seller customer transport DTO → existing SellerCustomer view (SEL-260 / UI-040).
 * Customer id is server-stable (store-scoped), never order number as pseudo id.
 */

import type {
  SellerCustomerDetailDto,
  SellerCustomerOrderHistoryItemDto,
  SellerCustomerSummaryDto,
} from "@/shared/api/schemas";
import { requireSafeMoneyIdr } from "@/shared/api/mappers";
import type {
  SellerCustomer,
  SellerCustomerHistoryItem,
  SellerCustomerListFilters,
  SellerCustomerPage,
} from "./contracts";

function formatCustomerDate(iso: string): string {
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

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function mapPaymentStatus(status: string): string {
  const u = status.trim().toUpperCase();
  if (u === "PAID") return "Paid";
  if (u === "FAILED" || u === "EXPIRED" || u === "CANCELLED") return "Failed";
  if (u === "PENDING" || u === "UNPAID") return "Pending";
  return status || "—";
}

export function mapSellerCustomerSummaryDto(
  dto: SellerCustomerSummaryDto,
): SellerCustomer {
  const spent = requireSafeMoneyIdr(dto.spentIdr, "spentIdr");
  const lastGross =
    dto.lastOrderGrossIdr != null
      ? requireSafeMoneyIdr(dto.lastOrderGrossIdr, "lastOrderGrossIdr")
      : spent;
  const when = dto.lastPurchaseAt;
  return {
    id: dto.customerId,
    storeId: dto.storeId,
    customer: dto.displayName || "—",
    email: dto.displayEmail || "",
    product: dto.lastProductTitle || "—",
    amount: lastGross,
    status: mapPaymentStatus(dto.lastPaymentStatus || ""),
    date: formatCustomerDate(typeof when === "string" ? when : String(when)),
    avatar: initialsFromName(dto.displayName || dto.displayEmail || "•"),
    orders: Number(dto.orderCount) || 0,
    spent,
  };
}

function mapHistoryItem(
  dto: SellerCustomerOrderHistoryItemDto,
  buyerName: string,
  buyerEmail: string,
): SellerCustomerHistoryItem {
  const when = dto.paidAt || dto.createdAt;
  return {
    id: dto.orderNumber || dto.orderId,
    date: formatCustomerDate(typeof when === "string" ? when : String(when)),
    avatar: initialsFromName(buyerName || buyerEmail || "•"),
    customer: buyerName || "—",
    email: buyerEmail || "",
    product: dto.productTitle || "—",
    status: mapPaymentStatus(dto.paymentStatus),
    amount: requireSafeMoneyIdr(dto.grossIdr, "grossIdr"),
  };
}

export function mapSellerCustomerDetailDto(
  dto: SellerCustomerDetailDto,
): SellerCustomer {
  const spent = requireSafeMoneyIdr(dto.spentIdr, "spentIdr");
  const avg = requireSafeMoneyIdr(dto.avgOrderIdr, "avgOrderIdr");
  const when = dto.lastPurchaseAt;
  const history = (dto.orders ?? []).map((o) =>
    mapHistoryItem(o, dto.displayName, dto.displayEmail),
  );
  const latest = history[0];
  return {
    id: dto.customerId,
    storeId: dto.storeId,
    customer: dto.displayName || "—",
    email: dto.displayEmail || "",
    product: latest?.product || "—",
    amount: latest?.amount ?? spent,
    status: latest?.status || "—",
    date: formatCustomerDate(typeof when === "string" ? when : String(when)),
    avatar: initialsFromName(dto.displayName || dto.displayEmail || "•"),
    orders: Number(dto.orderCount) || 0,
    spent,
    avgOrder: avg,
    productCount: Number(dto.productCount) || 0,
    firstSeenDisplay: formatCustomerDate(
      typeof dto.firstSeenAt === "string"
        ? dto.firstSeenAt
        : String(dto.firstSeenAt),
    ),
    marketingConsentLabel:
      dto.marketingConsent?.label || "Consent status not recorded",
    noteBody: dto.note?.body ?? "",
    noteVersion: dto.note?.version,
    history,
  };
}

export function mapSellerCustomerListEnvelope(
  data: SellerCustomerSummaryDto[],
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    pageCount: number;
  },
): SellerCustomerPage {
  return {
    items: data.map(mapSellerCustomerSummaryDto),
    page: meta.page,
    pageSize: meta.pageSize,
    totalCount: meta.totalCount,
    pageCount: meta.pageCount,
  };
}

/** Client-side filter for mock path only. */
export function applySellerCustomerListFilters(
  items: SellerCustomer[],
  filters?: SellerCustomerListFilters,
): SellerCustomer[] {
  if (!filters?.q?.trim()) return items;
  const q = filters.q.trim().toLowerCase();
  return items.filter(
    (c) =>
      c.customer.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q),
  );
}
