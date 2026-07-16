import { describe, expect, it } from "vitest";
import {
  getBuyerProfile,
  getBuyerPurchase,
  listBuyerPurchases,
  listBuyerSessions,
} from "@/features/buyer/data";

describe("buyer data api (mock mode)", () => {
  it("lists purchases and finds one by order id", async () => {
    const purchases = await listBuyerPurchases();
    expect(purchases.length).toBeGreaterThan(0);
    const first = purchases[0];
    const found = await getBuyerPurchase(first.orderId);
    expect(found?.product).toBe(first.product);
    expect(found?.seller).toBe(first.seller);
  });

  it("returns buyer profile and sessions", async () => {
    const profile = await getBuyerProfile();
    const sessions = await listBuyerSessions();
    expect(profile.email).toContain("@");
    expect(profile.timezone).toBe("Asia/Jakarta");
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.some((s) => s.current)).toBe(true);
  });
});
