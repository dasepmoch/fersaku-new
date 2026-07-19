import type {
  SellerFinanceSummary,
  SellerLedgerItem,
  SellerWithdrawal,
  SellerWithdrawalLock,
} from "./contracts";
import type { CursorPage } from "@/shared/api/contracts";
import { DEMO_STORE_ID } from "@/shared/config/demo";

export function demoFinanceSummary(
  storeId = DEMO_STORE_ID,
): SellerFinanceSummary {
  return {
    storeId,
    availableAmount: 18_240_500,
    pendingAmount: 3_420_000,
    heldAmount: 0,
    lifetimeGrossAmount: 82_640_000,
    monthGrossAmount: 24_860_000,
    monthPlatformFeeAmount: 745_800,
    monthProviderFeeAmount: 218_400,
    monthNetAmount: 23_895_800,
    sources: {
      STOREFRONT: { availableAmount: 12_000_000, pendingAmount: 1_000_000 },
      QRIS_API: { availableAmount: 6_240_500, pendingAmount: 2_420_000 },
    },
    currency: "IDR",
    asOf: "2026-07-12T14:42:00+07:00",
  };
}

export function demoSellerLedger(
  storeId = DEMO_STORE_ID,
): CursorPage<SellerLedgerItem> {
  return {
    items: [
      {
        id: "led_01",
        storeId,
        type: "SALE",
        description: "Penjualan AI Prompt Pack",
        amount: 76_630,
        direction: "CREDIT",
        source: "QRIS_API",
        occurredAt: "2026-07-12T14:32:00+07:00",
        orderId: "FRS-240712-1848",
      },
      {
        id: "led_02",
        storeId,
        type: "SALE",
        description: "Penjualan n8n Automation",
        amount: 144_830,
        direction: "CREDIT",
        source: "STOREFRONT",
        occurredAt: "2026-07-12T14:24:00+07:00",
        orderId: "FRS-240712-1842",
      },
      {
        id: "led_03",
        storeId,
        type: "WITHDRAWAL",
        description: "Penarikan ke BCA • 4821",
        amount: 5_000_000,
        direction: "DEBIT",
        source: "MIXED",
        occurredAt: "2026-07-11T09:10:00+07:00",
        withdrawalId: "WD-120724",
      },
      {
        id: "led_04",
        storeId,
        type: "SALE",
        description: "Penjualan Figma Landing Kit",
        amount: 182_630,
        direction: "CREDIT",
        source: "STOREFRONT",
        occurredAt: "2026-07-10T18:02:00+07:00",
        orderId: "FRS-240712-1821",
      },
      {
        id: "led_05",
        storeId,
        type: "SETTLEMENT_RELEASE",
        description: "Pelepasan settlement",
        amount: 96_300,
        direction: "CREDIT",
        source: "STOREFRONT",
        occurredAt: "2026-07-10T12:00:00+07:00",
        orderId: "FRS-240712-1800",
      },
    ],
    nextCursor: null,
    previousCursor: null,
    hasMore: false,
  };
}

export function demoSellerWithdrawals(
  storeId = DEMO_STORE_ID,
): SellerWithdrawal[] {
  return [
    {
      id: "WD-120724",
      storeId,
      amount: 5_000_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "12 Jul 2026",
      source: "MIXED",
    },
    {
      id: "WD-080724",
      storeId,
      amount: 3_500_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "8 Jul 2026",
      source: "STOREFRONT",
    },
    {
      id: "WD-020724",
      storeId,
      amount: 7_000_000,
      bankLabel: "BCA • 4821",
      status: "Processing",
      requestedAt: "2 Jul 2026",
      source: "QRIS_API",
    },
    {
      id: "WD-280624",
      storeId,
      amount: 2_250_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "28 Jun 2026",
      source: "STOREFRONT",
    },
    {
      id: "WD-210624",
      storeId,
      amount: 4_100_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "21 Jun 2026",
      source: "MIXED",
    },
    {
      id: "WD-140624",
      storeId,
      amount: 1_800_000,
      bankLabel: "BCA • 4821",
      status: "Failed",
      requestedAt: "14 Jun 2026",
      source: "QRIS_API",
    },
    {
      id: "WD-070624",
      storeId,
      amount: 6_000_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "7 Jun 2026",
      source: "STOREFRONT",
    },
    {
      id: "WD-310524",
      storeId,
      amount: 3_200_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "31 May 2026",
      source: "QRIS_API",
    },
    {
      id: "WD-240524",
      storeId,
      amount: 2_750_000,
      bankLabel: "BCA • 4821",
      status: "Processing",
      requestedAt: "24 May 2026",
      source: "MIXED",
    },
    {
      id: "WD-170524",
      storeId,
      amount: 5_500_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "17 May 2026",
      source: "STOREFRONT",
    },
    {
      id: "WD-100524",
      storeId,
      amount: 1_500_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "10 May 2026",
      source: "QRIS_API",
    },
    {
      id: "WD-030524",
      storeId,
      amount: 4_800_000,
      bankLabel: "BCA • 4821",
      status: "Completed",
      requestedAt: "3 May 2026",
      source: "STOREFRONT",
    },
  ];
}

export const demoWithdrawalLock: SellerWithdrawalLock = {
  locked: false,
  reasonCode: null,
  unlockedAt: null,
  remainingLabel: null,
};
