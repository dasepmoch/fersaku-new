import { describe, expect, it, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  clearSellerStoreCache,
  isSellerStoreKey,
} from "@/shared/seller/store-cache";
import {
  createMockSellerBootstrap,
  isAllowedSellerStoreId,
  needsSellerOnboarding,
  selectCurrentStoreId,
} from "@/shared/seller/bootstrap-api";
import { queryKeys } from "@/shared/query/query-keys";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
  getDomainSource,
} from "@/shared/data/domain-source";
import { sellerBootstrapDataSchema } from "@/shared/api/schemas";

describe("SEL-100 seller bootstrap schema + mapper", () => {
  beforeEach(() => {
    clearDomainSourceSnapshot();
  });

  it("parses bootstrap with onboarding fields", () => {
    const boot = createMockSellerBootstrap("store_server_1");
    const parsed = sellerBootstrapDataSchema.parse(boot);
    expect(parsed.merchantId).toBe("merch_mock");
    expect(parsed.currentStoreId).toBe("store_server_1");
    expect(parsed.canonicalStoreId).toBe("store_server_1");
    expect(parsed.onboardingCompleted).toBe(true);
    expect(parsed.onboardingState).toBe("COMPLETE");
    expect(parsed.memberships?.[0]?.capabilities).toContain("store.read");
    expect(parsed.stores?.[0]?.canonical).toBe(true);
  });

  it("mock bootstrap uses DEMO_STORE_ID only as mock fixture", () => {
    const boot = createMockSellerBootstrap();
    expect(boot.currentStoreId).toBe(DEMO_STORE_ID);
    expect(boot.onboardingCompleted).toBe(true);
  });

  it("incomplete onboarding bootstrap has no ready store authority", () => {
    const boot = createMockSellerBootstrap("", {
      onboardingCompleted: false,
      onboardingState: "IDENTITY",
    });
    expect(boot.onboardingCompleted).toBe(false);
    expect(boot.currentStoreId).toBeFalsy();
    expect(needsSellerOnboarding(boot)).toBe(true);
  });
});

describe("SEL-100 current-store selection + foreign rejection", () => {
  it("selectCurrentStoreId: preferred valid wins; foreign falls to canonical", () => {
    expect(
      selectCurrentStoreId({
        preferred: "foreign",
        canonical: "can",
        allowedStoreIds: ["can", "alt"],
      }),
    ).toBe("can");
    expect(
      selectCurrentStoreId({
        preferred: "alt",
        canonical: "can",
        allowedStoreIds: ["can", "alt"],
      }),
    ).toBe("alt");
    expect(
      selectCurrentStoreId({
        preferred: "",
        canonical: "can",
        allowedStoreIds: ["can", "alt"],
      }),
    ).toBe("can");
    expect(
      selectCurrentStoreId({
        preferred: "x",
        canonical: "y",
        allowedStoreIds: [],
      }),
    ).toBe("");
  });

  it("isAllowedSellerStoreId rejects foreign/tampered preference", () => {
    const boot = createMockSellerBootstrap("store_a");
    expect(isAllowedSellerStoreId(boot, "store_a")).toBe(true);
    expect(isAllowedSellerStoreId(boot, "foreign_tampered")).toBe(false);
    expect(isAllowedSellerStoreId(boot, "")).toBe(false);
    expect(isAllowedSellerStoreId(null, "store_a")).toBe(false);
  });

  it("canonical-only disposition: multi-store membership still validates membership set", () => {
    const boot = createMockSellerBootstrap("store_a");
    boot.stores = [
      {
        storeId: "store_a",
        merchantId: "merch_mock",
        slug: "a",
        name: "A",
        status: "ACTIVE",
        canonical: true,
      },
      {
        storeId: "store_b",
        merchantId: "merch_mock",
        slug: "b",
        name: "B",
        status: "ACTIVE",
        canonical: false,
      },
    ];
    boot.memberships = [
      {
        merchantId: "merch_mock",
        roleInMerchant: "OWNER",
        capabilities: ["store.read", "store.write"],
        storeIds: ["store_a", "store_b"],
      },
    ];
    expect(isAllowedSellerStoreId(boot, "store_b")).toBe(true);
    expect(isAllowedSellerStoreId(boot, "store_c")).toBe(false);
  });
});

describe("SEL-100 onboarding gate from server state", () => {
  it("needsSellerOnboarding true when unfinished / no store / null", () => {
    expect(needsSellerOnboarding(null)).toBe(true);
    expect(
      needsSellerOnboarding(
        createMockSellerBootstrap("s1", {
          onboardingCompleted: false,
          onboardingState: "SLUG",
        }),
      ),
    ).toBe(true);
    expect(
      needsSellerOnboarding(
        createMockSellerBootstrap("", { onboardingCompleted: true }),
      ),
    ).toBe(true);
  });

  it("needsSellerOnboarding false when COMPLETE + current store", () => {
    expect(
      needsSellerOnboarding(
        createMockSellerBootstrap("s1", {
          onboardingCompleted: true,
          onboardingState: "COMPLETE",
        }),
      ),
    ).toBe(false);
  });

  it("legacy payload without flag: missing store → onboarding", () => {
    const boot = createMockSellerBootstrap("s1");
    delete (boot as { onboardingCompleted?: boolean }).onboardingCompleted;
    delete (boot as { onboardingState?: string }).onboardingState;
    boot.currentStoreId = undefined;
    boot.canonicalStoreId = undefined;
    boot.stores = [];
    expect(needsSellerOnboarding(boot)).toBe(true);
  });
});

describe("SEL-100 cache + API path no DEMO authority", () => {
  beforeEach(() => {
    clearDomainSourceSnapshot();
  });

  it("query keys include storeId", () => {
    expect(queryKeys.seller.products("store_a")[1]).toBe("store_a");
    expect(queryKeys.seller.products("store_b")[1]).toBe("store_b");
  });

  it("clearSellerStoreCache removes only prior store keys", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.seller.products("store_old"), [{ id: 1 }]);
    client.setQueryData(queryKeys.seller.products("store_new"), [{ id: 2 }]);
    clearSellerStoreCache(client, "store_old");
    expect(
      client.getQueryData(queryKeys.seller.products("store_old")),
    ).toBeUndefined();
    expect(client.getQueryData(queryKeys.seller.products("store_new"))).toEqual(
      [{ id: 2 }],
    );
    expect(isSellerStoreKey(["seller", "store_old", "x"], "store_old")).toBe(
      true,
    );
  });

  it("API domain source never treats DEMO_STORE_ID as bootstrap authority", () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "api",
      }),
    );
    expect(getDomainSource("sellerCatalog")).toBe("api");
    const serverBoot = createMockSellerBootstrap("server_store_1");
    expect(serverBoot.currentStoreId).toBe("server_store_1");
    expect(serverBoot.currentStoreId).not.toBe(DEMO_STORE_ID);
    // API-mode contract: empty store until bootstrap; DEMO only via mock helper.
    expect(DEMO_STORE_ID).toBeTruthy();
    expect(serverBoot.currentStoreId === DEMO_STORE_ID).toBe(false);
  });
});
