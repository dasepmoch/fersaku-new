import type { SellerCoupon } from "./contracts";

const DEMO_ROWS: Array<{
  code: string;
  discountKind: "PERCENT" | "FIXED_IDR";
  discountValue: number;
  usage: number;
  max?: number;
  endsAt: string;
  state: SellerCoupon["state"];
}> = [
  {
    code: "LAUNCH20",
    discountKind: "PERCENT",
    discountValue: 2000,
    usage: 128,
    max: 250,
    endsAt: "2026-07-20T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "HEMAT50K",
    discountKind: "FIXED_IDR",
    discountValue: 50_000,
    usage: 42,
    max: 100,
    endsAt: "2026-07-31T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "RAMADAN",
    discountKind: "PERCENT",
    discountValue: 1500,
    usage: 304,
    max: 300,
    endsAt: "2026-03-30T17:00:00Z",
    state: "EXPIRED",
  },
  {
    code: "WELCOME10",
    discountKind: "PERCENT",
    discountValue: 1000,
    usage: 88,
    max: 500,
    endsAt: "2026-08-15T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "FLASH30",
    discountKind: "PERCENT",
    discountValue: 3000,
    usage: 19,
    max: 50,
    endsAt: "2026-07-18T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "VIP100K",
    discountKind: "FIXED_IDR",
    discountValue: 100_000,
    usage: 7,
    max: 25,
    endsAt: "2026-09-30T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "BUNDLING",
    discountKind: "PERCENT",
    discountValue: 1200,
    usage: 54,
    max: 200,
    endsAt: "2026-08-12T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "STUDENT15",
    discountKind: "PERCENT",
    discountValue: 1500,
    usage: 61,
    max: 150,
    endsAt: "2026-09-01T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "EARLYBIRD",
    discountKind: "PERCENT",
    discountValue: 2500,
    usage: 210,
    max: 200,
    endsAt: "2026-05-01T17:00:00Z",
    state: "EXPIRED",
  },
  {
    code: "REFER20",
    discountKind: "PERCENT",
    discountValue: 2000,
    usage: 33,
    max: 100,
    endsAt: "2026-12-31T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "WEEKEND",
    discountKind: "FIXED_IDR",
    discountValue: 25_000,
    usage: 14,
    max: 80,
    endsAt: "2026-07-20T17:00:00Z",
    state: "ACTIVE",
  },
  {
    code: "CLEAROUT",
    discountKind: "PERCENT",
    discountValue: 4000,
    usage: 99,
    max: 100,
    endsAt: "2026-07-05T17:00:00Z",
    state: "EXPIRED",
  },
];

function formatEnds(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

function discountLabel(
  kind: "PERCENT" | "FIXED_IDR",
  value: number,
): string {
  if (kind === "PERCENT") return `${value / 100}%`;
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const STATE_STATUS: Record<SellerCoupon["state"], string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};

/** Snapshot-identical demo coupons for mock/prototype mode. */
export function demoCoupons(storeId = "demo_store"): SellerCoupon[] {
  return DEMO_ROWS.map((row, i) => ({
    id: `cpn_demo_${String(i + 1).padStart(2, "0")}`,
    storeId,
    code: row.code,
    discountKind: row.discountKind,
    discountValue: row.discountValue,
    discountLabel: discountLabel(row.discountKind, row.discountValue),
    usageLabel:
      row.max != null ? `${row.usage} / ${row.max}` : String(row.usage),
    endsAtLabel: formatEnds(row.endsAt),
    status: STATE_STATUS[row.state],
    state: row.state,
    scope: "ALL_PRODUCTS",
    version: 1,
    policyVersion: 1,
    reservedCount: 0,
    redeemedCount: row.usage,
    usageCount: row.usage,
    maxTotalUses: row.max,
    endsAt: row.endsAt,
    productIds: [],
  }));
}
