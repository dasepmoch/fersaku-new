import { describe, expect, it, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  clearSellerStoreCache,
  isSellerStoreKey,
} from "@/shared/seller/store-cache";
import { createMockSellerBootstrap } from "@/shared/seller/bootstrap-api";
import { queryKeys } from "@/shared/query/query-keys";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { sellerBootstrapDataSchema } from "@/shared/api/schemas";

describe("INT-150 current-store / cache", () => {
  beforeEach(() => {
    clearDomainSourceSnapshot();
  });

  it("mock bootstrap uses DEMO_STORE_ID only for mock fixtures", () => {
    const boot = createMockSellerBootstrap();
    expect(boot.currentStoreId).toBe(DEMO_STORE_ID);
    expect(boot.canonicalStoreId).toBe(DEMO_STORE_ID);
    expect(boot.memberships?.[0]?.storeIds).toContain(DEMO_STORE_ID);
    const parsed = sellerBootstrapDataSchema.parse(boot);
    expect(parsed.merchantId).toBeTruthy();
  });

  it("query keys include storeId (no old-store bleed shape)", () => {
    const a = queryKeys.seller.products("store_a");
    const b = queryKeys.seller.products("store_b");
    expect(a[0]).toBe("seller");
    expect(a[1]).toBe("store_a");
    expect(a[2]).toBe("products");
    expect(b[1]).toBe("store_b");
    expect(a[1]).not.toBe(b[1]);
  });

  it("clearSellerStoreCache removes only prior store keys", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.seller.products("store_old"), [{ id: 1 }]);
    client.setQueryData(queryKeys.seller.products("store_new"), [{ id: 2 }]);
    client.setQueryData(["public", "catalog"], { ok: true });

    clearSellerStoreCache(client, "store_old");

    expect(client.getQueryData(queryKeys.seller.products("store_old"))).toBeUndefined();
    expect(client.getQueryData(queryKeys.seller.products("store_new"))).toEqual([
      { id: 2 },
    ]);
    expect(client.getQueryData(["public", "catalog"])).toEqual({ ok: true });
  });

  it("isSellerStoreKey matches seller/storeId prefix", () => {
    expect(isSellerStoreKey(["seller", "s1", "finance"], "s1")).toBe(true);
    expect(isSellerStoreKey(["seller", "s2", "finance"], "s1")).toBe(false);
    expect(isSellerStoreKey(["admin", "merchants"], "s1")).toBe(false);
  });

  it("API domain source does not install DEMO as authority", () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "api",
      }),
    );
    // Bootstrap contract: API path fetches server store ids; demo constant is mock-only helper.
    const boot = createMockSellerBootstrap("server_store_1");
    expect(boot.currentStoreId).toBe("server_store_1");
    expect(boot.currentStoreId).not.toBe(DEMO_STORE_ID);
  });
});

describe("INT-150 bootstrap selection semantics (pure)", () => {
  it("preferred invalid falls back to canonical in DTO shape", () => {
    // Mirrors BE selectCurrentStoreID contract for FE consumers.
    function selectCurrent(
      preferred: string,
      canonical: string,
      allowed: string[],
    ): string {
      if (preferred && allowed.includes(preferred)) return preferred;
      if (canonical && allowed.includes(canonical)) return canonical;
      return allowed[0] ?? "";
    }
    expect(selectCurrent("foreign", "can", ["can", "alt"])).toBe("can");
    expect(selectCurrent("alt", "can", ["can", "alt"])).toBe("alt");
    expect(selectCurrent("", "can", ["can", "alt"])).toBe("can");
  });
});
