import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope, CursorPage } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type {
  SellerFinanceSummary,
  SellerLedgerItem,
  SellerWithdrawal,
  SellerWithdrawalLock,
  SellerRevenuePoint,
} from "./contracts";
import {
  demoFinanceSummary,
  demoSellerLedger,
  demoSellerWithdrawals,
  demoWithdrawalLock,
} from "./demo-data";
import { demoSellerRevenue } from "./mock";

export async function getSellerRevenue(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerRevenuePoint[]> {
  if (!isLiveApi()) return demoSellerRevenue();
  const response = await apiRequest<ApiEnvelope<SellerRevenuePoint[]>>(
    `/v1/stores/${storeId}/finance/revenue`,
    { signal },
  );
  return response.data;
}

export async function getSellerFinanceSummary(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerFinanceSummary> {
  if (!isLiveApi()) return demoFinanceSummary(storeId);

  const response = await apiRequest<ApiEnvelope<SellerFinanceSummary>>(
    `/v1/stores/${storeId}/finance/summary`,
    { signal },
  );
  return response.data;
}

export async function listSellerLedger(
  storeId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CursorPage<SellerLedgerItem>> {
  if (!isLiveApi()) return demoSellerLedger(storeId);

  const response = await apiRequest<ApiEnvelope<CursorPage<SellerLedgerItem>>>(
    `/v1/stores/${storeId}/finance/ledger`,
    { query: { cursor }, signal },
  );
  return response.data;
}

export async function listSellerWithdrawals(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWithdrawal[]> {
  if (!isLiveApi()) return demoSellerWithdrawals(storeId);

  const response = await apiRequest<ApiEnvelope<SellerWithdrawal[]>>(
    `/v1/stores/${storeId}/withdrawals`,
    { signal },
  );
  return response.data;
}

export async function getSellerWithdrawalLock(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWithdrawalLock> {
  if (!isLiveApi()) return demoWithdrawalLock;

  const response = await apiRequest<ApiEnvelope<SellerWithdrawalLock>>(
    `/v1/stores/${storeId}/withdrawals/lock`,
    { signal },
  );
  return response.data;
}
