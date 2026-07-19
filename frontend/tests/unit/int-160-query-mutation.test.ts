import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/api-error";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  MUTATION_RETRY,
  createIdempotencyIntentHolder,
  createPendingDedupe,
  isOpaqueIdempotencyKey,
} from "@/shared/query/mutation-policy";
import {
  GC_TIME_DEFAULT_MS,
  STALE_TIME_DEFAULT_MS,
  STALE_TIME_FINANCE_MS,
  STALE_TIME_PUBLIC_MS,
  STALE_TIME_SECRET_MS,
  defaultQueryOptions,
  isSafeGetRetryableError,
  keepPreviousQueryData,
  queryKeyLooksSensitive,
  safeGetRetryDelay,
  shouldRetrySafeGet,
  staleTimeForSurface,
  withKeepPreviousData,
} from "@/shared/query/query-policy";
import { queryKeys } from "@/shared/query/query-keys";
import { DEMO_STORE_ID } from "@/shared/config/demo";

describe("INT-160 query policy", () => {
  it("exposes surface staleTime policies", () => {
    expect(staleTimeForSurface("public")).toBe(STALE_TIME_PUBLIC_MS);
    expect(staleTimeForSurface("private")).toBe(STALE_TIME_DEFAULT_MS);
    expect(staleTimeForSurface("finance")).toBe(STALE_TIME_FINANCE_MS);
    expect(staleTimeForSurface("secret")).toBe(STALE_TIME_SECRET_MS);
    expect(staleTimeForSurface("auth")).toBe(STALE_TIME_SECRET_MS);
  });

  it("default query options use private stale + gc + no focus refetch", () => {
    expect(defaultQueryOptions.staleTime).toBe(STALE_TIME_DEFAULT_MS);
    expect(defaultQueryOptions.gcTime).toBe(GC_TIME_DEFAULT_MS);
    expect(defaultQueryOptions.refetchOnWindowFocus).toBe(false);
  });

  it("keepPreviousData helper wires placeholderData", () => {
    const opts = withKeepPreviousData({ staleTime: 1 });
    expect(opts.placeholderData).toBe(keepPreviousQueryData);
    expect(opts.staleTime).toBe(1);
  });

  it("safe GET retry: network/408/429/5xx only, max 2", () => {
    expect(isSafeGetRetryableError(new TypeError("Failed to fetch"))).toBe(
      true,
    );
    expect(
      isSafeGetRetryableError(
        new ApiError(408, { code: "TIMEOUT", message: "t" }),
      ),
    ).toBe(true);
    expect(
      isSafeGetRetryableError(
        new ApiError(429, { code: "RATE_LIMITED", message: "r" }),
      ),
    ).toBe(true);
    expect(
      isSafeGetRetryableError(
        new ApiError(503, { code: "UNAVAILABLE", message: "u" }),
      ),
    ).toBe(true);
    expect(
      isSafeGetRetryableError(
        new ApiError(400, { code: "VALIDATION_FAILED", message: "v" }),
      ),
    ).toBe(false);
    expect(
      isSafeGetRetryableError(
        new ApiError(401, { code: "UNAUTHORIZED", message: "a" }),
      ),
    ).toBe(false);
    expect(
      isSafeGetRetryableError(
        new ApiError(403, { code: "FORBIDDEN", message: "f" }),
      ),
    ).toBe(false);

    expect(
      shouldRetrySafeGet(0, new ApiError(500, { code: "E", message: "e" })),
    ).toBe(true);
    expect(
      shouldRetrySafeGet(2, new ApiError(500, { code: "E", message: "e" })),
    ).toBe(false);
  });

  it("retry delay honors Retry-After and applies backoff", () => {
    const withRetryAfter = new ApiError(
      429,
      { code: "RATE_LIMITED", message: "r" },
      3,
    );
    expect(safeGetRetryDelay(0, withRetryAfter)).toBe(3000);

    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(safeGetRetryDelay(0)).toBe(1000);
    expect(safeGetRetryDelay(1)).toBe(2000);
    vi.restoreAllMocks();
  });

  it("seller query keys include storeId and no secrets", () => {
    const key = queryKeys.seller.orders(DEMO_STORE_ID, {
      status: "paid",
      page: 1,
    });
    expect(key[0]).toBe("seller");
    expect(key[1]).toBe(DEMO_STORE_ID);
    expect(queryKeyLooksSensitive(key)).toBe(false);
  });

  it("flags sensitive material in cache keys", () => {
    expect(queryKeyLooksSensitive(["seller", "s1", "mfa_proof", "x"])).toBe(
      true,
    );
    expect(queryKeyLooksSensitive(["admin", "inventory_secret"])).toBe(true);
    expect(queryKeyLooksSensitive(["buyer", "purchases"])).toBe(false);
  });
});

describe("INT-160 mutation policy", () => {
  it("mutations never auto-retry", () => {
    expect(MUTATION_RETRY).toBe(false);
    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: MUTATION_RETRY },
        queries: { ...defaultQueryOptions },
      },
    });
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("createIdempotencyKey is opaque UUID without PII", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    const key = createIdempotencyKey();
    expect(key).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(isOpaqueIdempotencyKey(key)).toBe(true);
    expect(key).not.toMatch(/@|email|store|amount|phone/i);
    vi.unstubAllGlobals();
  });

  it("rejects non-opaque / PII-bearing idempotency keys", () => {
    expect(isOpaqueIdempotencyKey("checkout_prod_1_user@example.com")).toBe(
      false,
    );
    expect(isOpaqueIdempotencyKey("seller-withdrawal:store_1:quote:123")).toBe(
      false,
    );
    expect(isOpaqueIdempotencyKey("checkout_prod_email")).toBe(false);
  });

  it("intent holder reuses same key for double-click / retry; reset mints new", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
        .mockReturnValueOnce("22222222-2222-4222-8222-222222222222"),
    });
    const holder = createIdempotencyIntentHolder();
    const a = holder.getKey();
    const b = holder.getKey();
    expect(a).toBe(b);
    expect(isOpaqueIdempotencyKey(a)).toBe(true);
    holder.reset();
    const c = holder.getKey();
    expect(c).not.toBe(a);
    expect(isOpaqueIdempotencyKey(c)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("pending dedupe blocks concurrent CTA without inventing new intent", () => {
    const dedupe = createPendingDedupe();
    expect(dedupe.tryBegin()).toBe(true);
    expect(dedupe.tryBegin()).toBe(false);
    expect(dedupe.gate()).toEqual({ isPending: true, disabled: true });
    dedupe.end();
    expect(dedupe.tryBegin()).toBe(true);
  });
});

describe("INT-160 checkout bad-key regression", () => {
  it("forbidden checkout_${id}_${email} shape is not opaque", () => {
    const productId = "prd_01";
    const email = "buyer@example.com";
    const bad = `checkout_${productId}_${email}`;
    expect(isOpaqueIdempotencyKey(bad)).toBe(false);
    expect(bad).toMatch(/@/);
  });
});
