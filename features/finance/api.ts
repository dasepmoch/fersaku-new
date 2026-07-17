import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  financeLedgerEnvelopeSchema,
  financeRevenueEnvelopeSchema,
  financeSummaryEnvelopeSchema,
  withdrawalCreateRequestSchema,
  withdrawalEnvelopeSchema,
  withdrawalListEnvelopeSchema,
  withdrawalLockEnvelopeSchema,
  withdrawalQuoteEnvelopeSchema,
  type WithdrawalCreateRequest,
} from "@/shared/api/schemas";
import type { CursorPage } from "@/shared/api/contracts";
import {
  DomainDisabledError,
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
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
  isSellerWithdrawalQuoteFresh,
  mapFinanceLedgerPageDto,
  mapFinanceRevenueDto,
  mapFinanceSummaryDto,
  mapWithdrawalDto,
  mapWithdrawalListDto,
  mapWithdrawalLockDto,
  mapWithdrawalQuoteDto,
} from "./mappers";

const mockQuotes = new Map<string, SellerWithdrawalQuote>();
/** In-memory fallback when localStorage is unavailable (unit tests / SSR). */
const mockCreatedMemory = new Map<string, SellerWithdrawal[]>();

type SummaryEnvelope = z.infer<typeof financeSummaryEnvelopeSchema>;
type RevenueEnvelope = z.infer<typeof financeRevenueEnvelopeSchema>;
type LedgerEnvelope = z.infer<typeof financeLedgerEnvelopeSchema>;
type QuoteEnvelope = z.infer<typeof withdrawalQuoteEnvelopeSchema>;
type WithdrawalListEnvelope = z.infer<typeof withdrawalListEnvelopeSchema>;
type WithdrawalEnvelope = z.infer<typeof withdrawalEnvelopeSchema>;
type LockEnvelope = z.infer<typeof withdrawalLockEnvelopeSchema>;

function isSellerFinanceMock(): boolean {
  return shouldUseMockFixtures("sellerFinance");
}

function assertSellerFinanceEnabled(): void {
  if (getDomainSource("sellerFinance") === "disabled") {
    throw new DomainDisabledError("sellerFinance");
  }
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

/** GET /v1/stores/{storeId}/withdrawals/ — items[] mapped to history rows. */
export async function listSellerWithdrawals(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWithdrawal[]> {
  assertSellerFinanceEnabled();
  if (isSellerFinanceMock()) {
    const memory = mockCreatedMemory.get(storeId) ?? [];
    return [
      ...memory,
      ...readMockCreatedWithdrawals(storeId),
      ...demoSellerWithdrawals(storeId),
    ];
  }

  const response = await apiRequest<WithdrawalListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/withdrawals/`,
    {
      schema: withdrawalListEnvelopeSchema,
      signal,
    },
  );
  return mapWithdrawalListDto(response.data.items, storeId);
}

/**
 * POST quote — server fees authoritative. Idempotency key stable per intent.
 */
export async function requestSellerWithdrawalQuote(
  input: RequestSellerWithdrawalQuoteInput,
  signal?: AbortSignal,
): Promise<SellerWithdrawalQuote> {
  assertSellerFinanceEnabled();
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

  const idempotencyKey =
    input.idempotencyKey?.trim() || createIdempotencyKey();
  const response = await apiRequest<
    QuoteEnvelope,
    { amount: number; bankAccountId: string }
  >(`/v1/stores/${encodeURIComponent(input.storeId)}/withdrawal-quotes`, {
    schema: withdrawalQuoteEnvelopeSchema,
    method: "POST",
    body: {
      amount: input.amount,
      bankAccountId: input.bankAccountId,
    },
    signal,
    idempotencyKey,
  });
  return mapWithdrawalQuoteDto(
    response.data,
    input.storeId,
    input.bankAccountId,
  );
}

/**
 * POST create — body { quoteId } only; MFA via X-Recent-MFA-Proof.
 * Idempotency UUID retained across timeout/retry by caller.
 * No optimistic history; returns authoritative create result only.
 */
export async function createSellerWithdrawal(
  input: CreateSellerWithdrawalInput,
  signal?: AbortSignal,
): Promise<SellerWithdrawal> {
  assertSellerFinanceEnabled();
  if (isSellerFinanceMock()) {
    const quote = mockQuotes.get(input.quoteId);
    if (
      !quote ||
      quote.storeId !== input.storeId ||
      !isSellerWithdrawalQuoteFresh(quote) ||
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
      id: `WD-MOCK-${input.idempotencyKey.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      storeId: input.storeId,
      amount: quote.amount,
      bankLabel: "BCA • 4821",
      status: "Pending",
      requestedAt: "baru saja",
      source: allocation.source,
    };
    if (!persistMockCreatedWithdrawal(withdrawal)) {
      const prev = mockCreatedMemory.get(input.storeId) ?? [];
      mockCreatedMemory.set(input.storeId, [withdrawal, ...prev].slice(0, 25));
    }
    mockQuotes.delete(input.quoteId);
    return withdrawal;
  }

  const body: WithdrawalCreateRequest = withdrawalCreateRequestSchema.parse({
    quoteId: input.quoteId,
  });
  const response = await apiRequest<WithdrawalEnvelope, WithdrawalCreateRequest>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/withdrawals/`,
    {
      schema: withdrawalEnvelopeSchema,
      method: "POST",
      body,
      signal,
      idempotencyKey: input.idempotencyKey,
      requireRecentMfa: true,
      ...(input.recentMfaProof
        ? { recentMfaProof: input.recentMfaProof }
        : {}),
    },
  );
  return mapWithdrawalDto(response.data, input.storeId);
}

/** GET lock — map lockedUntil/reason → existing lock chrome. */
export async function getSellerWithdrawalLock(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWithdrawalLock> {
  assertSellerFinanceEnabled();
  if (isSellerFinanceMock()) return demoWithdrawalLock;

  const response = await apiRequest<LockEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/withdrawals/lock`,
    {
      schema: withdrawalLockEnvelopeSchema,
      signal,
    },
  );
  return mapWithdrawalLockDto(response.data);
}

/** GET detail — for unknown-outcome reconcile before minting a new create key. */
export async function getSellerWithdrawal(
  storeId: string,
  withdrawalId: string,
  signal?: AbortSignal,
): Promise<SellerWithdrawal> {
  assertSellerFinanceEnabled();
  if (isSellerFinanceMock()) {
    const list = await listSellerWithdrawals(storeId, signal);
    const found = list.find((w) => w.id === withdrawalId);
    if (!found) throw new Error("Withdrawal not found.");
    return found;
  }

  const response = await apiRequest<WithdrawalEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/withdrawals/${encodeURIComponent(withdrawalId)}`,
    {
      schema: withdrawalEnvelopeSchema,
      signal,
    },
  );
  return mapWithdrawalDto(response.data, storeId);
}
