import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  financeLedgerEnvelopeSchema,
  financeRevenueEnvelopeSchema,
  financeSummaryEnvelopeSchema,
  structuralEnvelopeSchema,
} from "@/shared/api/schemas";
import type { ApiEnvelope, CursorPage } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  CreateSellerWithdrawalInput,
  RequestSellerWithdrawalQuoteInput,
  SellerFinanceSummary,
  SellerLedgerItem,
  SellerWithdrawal,
  SellerWithdrawalLock,
  SellerWithdrawalQuote,
  SellerRevenuePoint,
} from "./contracts";
import {
  demoFinanceSummary,
  demoSellerLedger,
  demoSellerWithdrawals,
  demoWithdrawalLock,
} from "./demo-data";
import { demoSellerRevenue } from "./mock";
import { calculateWithdrawalFee } from "@/shared/finance/fee-policy";
import { allocateWithdrawalSources } from "@/shared/finance/source-allocation";
import { canRequestSellerWithdrawal } from "./withdrawal-policy";
import {
  persistMockCreatedWithdrawal,
  readMockCreatedWithdrawals,
} from "./mock-withdrawals";
import {
  mapFinanceLedgerPageDto,
  mapFinanceRevenueDto,
  mapFinanceSummaryDto,
} from "./mappers";

const mockQuotes = new Map<string, SellerWithdrawalQuote>();

type SummaryEnvelope = z.infer<typeof financeSummaryEnvelopeSchema>;
type RevenueEnvelope = z.infer<typeof financeRevenueEnvelopeSchema>;
type LedgerEnvelope = z.infer<typeof financeLedgerEnvelopeSchema>;

function isSellerFinanceMock(): boolean {
  return shouldUseMockFixtures("sellerFinance");
}

export type ListSellerLedgerParams = {
  storeId: string;
  cursor?: string;
  source?: "STOREFRONT" | "QRIS_API" | "MIXED" | "SYSTEM";
  limit?: number;
  signal?: AbortSignal;
};

/**
 * Daily revenue series from authoritative payment-capture journals.
 * Never derive from UI order rows.
 */
export async function getSellerRevenue(
  storeId: string,
  signal?: AbortSignal,
  days = 7,
): Promise<SellerRevenuePoint[]> {
  if (isSellerFinanceMock()) return demoSellerRevenue();
  const safeDays = Math.min(90, Math.max(1, Math.trunc(days) || 7));
  const response = await apiRequest<RevenueEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/finance/revenue`,
    {
      schema: financeRevenueEnvelopeSchema,
      query: { days: safeDays },
      signal,
    },
  );
  return mapFinanceRevenueDto(response.data);
}

/**
 * Store-scoped finance summary (available/pending/held + month buckets).
 * Money fields are server integers; UI only formats.
 */
export async function getSellerFinanceSummary(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerFinanceSummary> {
  if (isSellerFinanceMock()) return demoFinanceSummary(storeId);

  const response = await apiRequest<SummaryEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/finance/summary`,
    {
      schema: financeSummaryEnvelopeSchema,
      signal,
    },
  );
  return mapFinanceSummaryDto(response.data, response.meta.timestamp);
}

/**
 * Cursor-paginated ledger journals. UI balance screen uses first page only
 * (no TablePagination control → bounded first result).
 */
export async function listSellerLedger(
  storeId: string,
  cursor?: string,
  signal?: AbortSignal,
  opts?: Pick<ListSellerLedgerParams, "source" | "limit">,
): Promise<CursorPage<SellerLedgerItem>> {
  if (isSellerFinanceMock()) return demoSellerLedger(storeId);

  const response = await apiRequest<LedgerEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/finance/ledger`,
    {
      schema: financeLedgerEnvelopeSchema,
      query: {
        ...(cursor ? { cursor } : {}),
        ...(opts?.source ? { source: opts.source } : {}),
        limit: opts?.limit ?? 50,
      },
      signal,
    },
  );
  return mapFinanceLedgerPageDto(response.data);
}

export async function listSellerWithdrawals(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWithdrawal[]> {
  if (isSellerFinanceMock()) {
    return [
      ...readMockCreatedWithdrawals(storeId),
      ...demoSellerWithdrawals(storeId),
    ];
  }

  const response = await apiRequest<ApiEnvelope<SellerWithdrawal[]>>(
    `/v1/stores/${encodeURIComponent(storeId)}/withdrawals`,
    {
      schema: structuralEnvelopeSchema,
      signal,
    },
  );
  return response.data;
}

export async function requestSellerWithdrawalQuote(
  input: RequestSellerWithdrawalQuoteInput,
  signal?: AbortSignal,
): Promise<SellerWithdrawalQuote> {
  if (isSellerFinanceMock()) {
    const summary = demoFinanceSummary(input.storeId);
    if (
      !canRequestSellerWithdrawal({
        amount: input.amount,
        availableAmount: summary.availableAmount,
        lock: demoWithdrawalLock,
      })
    ) {
      throw new Error("Withdrawal amount or account lock is invalid.");
    }
    const fee = calculateWithdrawalFee(input.amount, 2_500);
    if (fee.totalFee === null || fee.netAmount === null) {
      throw new Error("Xendit processing fee is unavailable.");
    }
    const quote: SellerWithdrawalQuote = {
      id: `wqt_${input.storeId}_${input.amount}`,
      storeId: input.storeId,
      bankAccountId: input.bankAccountId,
      amount: input.amount,
      platformFee: fee.platformFee,
      providerProcessingFee: fee.processingFee ?? 0,
      totalFee: fee.totalFee,
      netAmount: fee.netAmount,
      provider: "Xendit",
      status: "VERIFIED",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    mockQuotes.set(quote.id, quote);
    return quote;
  }
  const response = await apiRequest<
    ApiEnvelope<SellerWithdrawalQuote>,
    { amount: number; bankAccountId: string }
  >(`/v1/stores/${encodeURIComponent(input.storeId)}/withdrawal-quotes`, {
    schema: structuralEnvelopeSchema,
    method: "POST",
    body: {
      amount: input.amount,
      bankAccountId: input.bankAccountId,
    },
    signal,
    idempotencyKey: `withdrawal-quote:${input.storeId}:${input.bankAccountId}:${input.amount}`,
  });
  return response.data;
}

export async function createSellerWithdrawal(
  input: CreateSellerWithdrawalInput,
  signal?: AbortSignal,
): Promise<SellerWithdrawal> {
  if (isSellerFinanceMock()) {
    const quote = mockQuotes.get(input.quoteId);
    if (
      !quote ||
      quote.storeId !== input.storeId ||
      quote.status !== "VERIFIED" ||
      new Date(quote.expiresAt).getTime() <= Date.now() ||
      !input.reauthProof ||
      !input.idempotencyKey
    ) {
      throw new Error(
        "A valid quote and recent re-authentication are required.",
      );
    }
    const summary = demoFinanceSummary(input.storeId);
    const allocation = allocateWithdrawalSources(quote.amount, {
      storefrontAmount: summary.sources.STOREFRONT.availableAmount,
      qrisApiAmount: summary.sources.QRIS_API.availableAmount,
    });
    const withdrawal: SellerWithdrawal = {
      id: `WD-MOCK-${Date.now().toString(36).toUpperCase()}`,
      storeId: input.storeId,
      amount: quote.amount,
      bankLabel: "BCA • 4821",
      status: "Pending",
      requestedAt: "baru saja",
      source: allocation.source,
    };
    if (!persistMockCreatedWithdrawal(withdrawal)) {
      throw new Error("Unable to persist the mock withdrawal.");
    }
    mockQuotes.delete(input.quoteId);
    return withdrawal;
  }
  const response = await apiRequest<
    ApiEnvelope<SellerWithdrawal>,
    { quoteId: string; reauthProof: string }
  >(`/v1/stores/${encodeURIComponent(input.storeId)}/withdrawals`, {
    schema: structuralEnvelopeSchema,
    method: "POST",
    body: { quoteId: input.quoteId, reauthProof: input.reauthProof },
    signal,
    idempotencyKey: input.idempotencyKey,
  });
  return response.data;
}

export async function getSellerWithdrawalLock(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWithdrawalLock> {
  if (isSellerFinanceMock()) return demoWithdrawalLock;

  const response = await apiRequest<ApiEnvelope<SellerWithdrawalLock>>(
    `/v1/stores/${encodeURIComponent(storeId)}/withdrawals/lock`,
    {
      schema: structuralEnvelopeSchema,
      signal,
    },
  );
  return response.data;
}
