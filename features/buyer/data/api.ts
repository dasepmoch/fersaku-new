import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { BuyerProfile, BuyerPurchase, BuyerSession } from "./contracts";
import { demoProfile, demoPurchases, demoSessions } from "./mock";

export type RevokeBuyerSessionInput = {
  sessionId: string;
  reason?: string;
  idempotencyKey?: string;
};

export type RevokeBuyerSessionResult = {
  accepted: boolean;
  sessionId: string;
  requestId: string;
};

export async function revokeBuyerSession(
  input: RevokeBuyerSessionInput,
  signal?: AbortSignal,
): Promise<RevokeBuyerSessionResult> {
  if (!isLiveApi()) {
    return {
      accepted: true,
      sessionId: input.sessionId,
      requestId: `mock_revoke_${input.sessionId}`,
    };
  }
  const response = await apiRequest<
    ApiEnvelope<RevokeBuyerSessionResult>,
    RevokeBuyerSessionInput
  >(`/v1/buyer/sessions/${input.sessionId}/revoke`, {
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
    auditReason: input.reason,
  });
  return response.data;
}

export async function listBuyerPurchases(
  signal?: AbortSignal,
): Promise<BuyerPurchase[]> {
  if (!isLiveApi()) return demoPurchases();

  const response = await apiRequest<ApiEnvelope<BuyerPurchase[]>>(
    "/v1/buyer/purchases",
    { signal },
  );
  return response.data;
}

export async function getBuyerPurchase(
  orderId: string,
  signal?: AbortSignal,
): Promise<BuyerPurchase | null> {
  if (!isLiveApi()) {
    return demoPurchases().find((p) => p.orderId === orderId) || null;
  }

  const response = await apiRequest<ApiEnvelope<BuyerPurchase>>(
    `/v1/buyer/purchases/${orderId}`,
    { signal },
  );
  return response.data;
}

export async function getBuyerProfile(
  signal?: AbortSignal,
): Promise<BuyerProfile> {
  if (!isLiveApi()) return demoProfile();

  const response = await apiRequest<ApiEnvelope<BuyerProfile>>(
    "/v1/buyer/profile",
    { signal },
  );
  return response.data;
}

export async function listBuyerSessions(
  signal?: AbortSignal,
): Promise<BuyerSession[]> {
  if (!isLiveApi()) return demoSessions();

  const response = await apiRequest<ApiEnvelope<BuyerSession[]>>(
    "/v1/buyer/sessions",
    { signal },
  );
  return response.data;
}
