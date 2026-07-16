import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminBuyer } from "./contracts";
import type { AdminBuyerPurchase, AdminBuyerSession } from "./contracts";
import { mockBuyerPurchases, mockBuyerSessions } from "./mock";

/** Deterministic buyer fixtures used by the admin buyers console. */
export function demoBuyers(): AdminBuyer[] {
  return [
    {
      id: "byr_91K2",
      name: "Nadia Putri",
      email: "nadia@studio.id",
      verified: "Verified",
      purchases: 4,
      spent: 395000,
      sessions: 3,
      last: "Now",
    },
    {
      id: "byr_91J8",
      name: "Rizky Hidayat",
      email: "rizky@gmail.com",
      verified: "Verified",
      purchases: 7,
      spent: 842000,
      sessions: 1,
      last: "8m ago",
    },
    {
      id: "byr_90X4",
      name: "Dimas Ardi",
      email: "dimas@hey.com",
      verified: "Pending",
      purchases: 1,
      spent: 59000,
      sessions: 0,
      last: "21m ago",
    },
    {
      id: "byr_90W1",
      name: "Sinta Maharani",
      email: "sinta@mail.id",
      verified: "Verified",
      purchases: 3,
      spent: 218000,
      sessions: 2,
      last: "1h ago",
    },
    {
      id: "byr_90V7",
      name: "Fajar Nugroho",
      email: "fajar@hey.com",
      verified: "Verified",
      purchases: 12,
      spent: 1540000,
      sessions: 4,
      last: "3h ago",
    },
    {
      id: "byr_90U2",
      name: "Laras Ayu",
      email: "laras@studio.id",
      verified: "Pending",
      purchases: 0,
      spent: 0,
      sessions: 1,
      last: "5h ago",
    },
  ];
}

export async function listBuyers(signal?: AbortSignal): Promise<AdminBuyer[]> {
  if (!isLiveApi()) return demoBuyers();

  const response = await apiRequest<ApiEnvelope<AdminBuyer[]>>(
    "/v1/admin/buyers",
    { signal },
  );
  return response.data;
}

export async function getBuyer(
  buyerId: string,
  signal?: AbortSignal,
): Promise<AdminBuyer | null> {
  if (!isLiveApi()) {
    return demoBuyers().find((b) => b.id === buyerId) || null;
  }

  const response = await apiRequest<ApiEnvelope<AdminBuyer>>(
    `/v1/admin/buyers/${buyerId}`,
    { signal },
  );
  return response.data;
}

/** Admin-scoped purchase projection; delivery secrets are not part of it. */
export function demoBuyerPurchases(): AdminBuyerPurchase[] {
  return mockBuyerPurchases();
}

export function demoBuyerSessions(): AdminBuyerSession[] {
  return mockBuyerSessions();
}

export async function listBuyerPurchases(
  buyerId: string,
  signal?: AbortSignal,
): Promise<AdminBuyerPurchase[]> {
  if (!isLiveApi()) return demoBuyerPurchases();
  const response = await apiRequest<ApiEnvelope<AdminBuyerPurchase[]>>(
    `/v1/admin/buyers/${buyerId}/purchases`,
    { signal },
  );
  return response.data;
}

export async function listBuyerSessions(
  buyerId: string,
  signal?: AbortSignal,
): Promise<AdminBuyerSession[]> {
  if (!isLiveApi()) return demoBuyerSessions();
  const response = await apiRequest<ApiEnvelope<AdminBuyerSession[]>>(
    `/v1/admin/buyers/${buyerId}/sessions`,
    { signal },
  );
  return response.data;
}
