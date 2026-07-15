import { describe, expect, it } from "vitest";
import {
  getSellerProduct,
  listSellerProducts,
} from "@/features/catalog/api";
import {
  getSellerFinanceSummary,
  getSellerWithdrawalLock,
  listSellerLedger,
} from "@/features/finance/api";
import { getSellerOrder, listSellerOrders } from "@/features/orders/api";
import { DEMO_STORE_ID } from "@/shared/config/demo";

describe("finance api (mock mode)", () => {
  it("returns seller summary with integer IDR amounts", async () => {
    const summary = await getSellerFinanceSummary(DEMO_STORE_ID);
    expect(summary.storeId).toBe(DEMO_STORE_ID);
    expect(summary.availableAmount).toBe(18_240_500);
    expect(summary.currency).toBe("IDR");
  });

  it("returns ledger + withdrawal lock", async () => {
    const ledger = await listSellerLedger(DEMO_STORE_ID);
    const lock = await getSellerWithdrawalLock(DEMO_STORE_ID);
    expect(ledger.items.length).toBeGreaterThanOrEqual(4);
    expect(lock.reasonCode).toBe("BANK_ACCOUNT_CHANGED");
  });
});

describe("catalog api (mock mode)", () => {
  it("lists and finds products", async () => {
    const products = await listSellerProducts(DEMO_STORE_ID);
    const product = await getSellerProduct(DEMO_STORE_ID, "prod_01");
    expect(products.length).toBeGreaterThan(0);
    expect(product?.slug).toBe("ai-prompt-pack");
  });
});

describe("orders api (mock mode)", () => {
  it("lists and finds orders", async () => {
    const page = await listSellerOrders(DEMO_STORE_ID);
    const order = await getSellerOrder(DEMO_STORE_ID, "FRS-240712-1842");
    expect(page.items.length).toBeGreaterThan(0);
    expect(order?.customer).toBe("Nadia Putri");
  });
});
