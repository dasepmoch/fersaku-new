import { describe, expect, it } from "vitest";
import {
  getBuyer,
  getMerchant,
  listBuyers,
  listMerchants,
  listAdminOrders,
  listPayments,
  listWithdrawals,
} from "@/features/admin/data";

describe("admin data api (mock mode)", () => {
  it("lists merchants and finds one by id", async () => {
    const merchants = await listMerchants();
    expect(merchants.length).toBeGreaterThan(0);
    const first = merchants[0];
    const found = await getMerchant(first.id);
    expect(found?.name).toBe(first.name);
    expect(found?.email).toBe(first.email);
  });

  it("lists buyers and finds one by id", async () => {
    const buyers = await listBuyers();
    expect(buyers.length).toBeGreaterThan(0);
    const first = buyers[0];
    const found = await getBuyer(first.id);
    expect(found?.name).toBe(first.name);
    expect(found?.email).toBe(first.email);
  });

  it("lists admin orders, withdrawals, and payments", async () => {
    const [orders, withdrawals, payments] = await Promise.all([
      listAdminOrders(),
      listWithdrawals(),
      listPayments(),
    ]);
    expect(orders.length).toBeGreaterThan(0);
    expect(withdrawals.length).toBeGreaterThan(0);
    expect(payments.length).toBeGreaterThan(0);
    expect(orders[0]).toHaveProperty("gross");
    expect(withdrawals[0]).toHaveProperty("amount");
    expect(payments[0]).toHaveProperty("providerRef");
  });
});
