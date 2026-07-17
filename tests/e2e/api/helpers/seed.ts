/**
 * INT-190 — stable QLT-110 seed IDs for vertical-slice probes.
 * Single seed owner remains QLT-110; this is read-only reference data.
 */

export const QLT110_SEED = {
  clock: "2026-01-15T12:00:00Z",
  password: "TestSeed1!",
  personas: {
    buyerA: {
      userId: "01HQ0SEED00000000000000001",
      email: "buyer.a@seed.fersaku.test",
      surface: "BUYER" as const,
    },
    sellerOwnerA: {
      userId: "01HQ0SEED00000000000000003",
      email: "seller.owner.a@seed.fersaku.test",
      surface: "SELLER" as const,
    },
    sellerB: {
      userId: "01HQ0SEED00000000000000005",
      email: "seller.b@seed.fersaku.test",
      surface: "SELLER" as const,
    },
  },
  resources: {
    merchantA: "01HQ0SEED00000000000000021",
    merchantB: "01HQ0SEED00000000000000022",
    storeA: "01HQ0SEED00000000000000031",
    storeB: "01HQ0SEED00000000000000032",
    storeASlug: "seed-store-a",
    storeBSlug: "seed-store-b",
    productPublished: "01HQ0SEED00000000000000042",
    productPublishedSlug: "seed-published-product",
    productSellerB: "01HQ0SEED00000000000000201",
  },
} as const;
