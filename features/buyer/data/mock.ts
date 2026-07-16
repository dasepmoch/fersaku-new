import { buyerPurchases, buyerSessions } from "@/lib/buyer-mock-data";
import type { BuyerProfile, BuyerPurchase, BuyerSession } from "./contracts";

export function demoPurchases(): BuyerPurchase[] {
  return buyerPurchases as BuyerPurchase[];
}

export function demoSessions(): BuyerSession[] {
  return buyerSessions as BuyerSession[];
}

export function demoProfile(): BuyerProfile {
  return {
    name: "Nadia Putri",
    email: "nadia@studio.id",
    phone: "+62 812-3456-7890",
    locale: "id-ID",
    timezone: "Asia/Jakarta",
  };
}
