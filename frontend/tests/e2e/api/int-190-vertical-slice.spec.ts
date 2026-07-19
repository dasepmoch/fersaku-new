import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  apiOrigin,
  assertNonProductionHarness,
  SEED_PASSWORD,
  SEED_PERSONAS,
} from "./helpers";
import { QLT110_SEED } from "./helpers/seed";

/**
 * INT-190 — first vertical-slice gate (public + authenticated) against live API.
 * Uses QLT-110 seed only. No mock commerce fixtures.
 */

type Envelope<T> = {
  data?: T;
  meta?: { requestId?: string; timestamp?: string };
  problem?: { code?: string; message?: string; requestId?: string };
};

function origin(): string {
  return apiOrigin();
}

function sessionCookie(setCookie: string | undefined): string {
  const raw = setCookie || "";
  const m = raw.match(/fersaku_session=([^;]+)/i);
  return m?.[1] ?? "";
}

async function sellerLogin(
  request: APIRequestContext,
): Promise<{ cookie: string; csrfFromLogin: string; sessionId: string }> {
  const res = await request.post(`${origin()}/v1/auth/login`, {
    data: {
      email: QLT110_SEED.personas.sellerOwnerA.email,
      password: QLT110_SEED.password,
      surface: QLT110_SEED.personas.sellerOwnerA.surface,
    },
    headers: { Accept: "application/json" },
  });
  expect(res.status(), "seller login").toBe(200);
  const json = (await res.json()) as Envelope<{
    csrfToken?: string;
    sessionId?: string;
    mfaRequired?: boolean;
    user?: { id?: string; email?: string; surface?: string };
  }>;
  expect(json.data?.mfaRequired, "seed seller MFA off").toBeFalsy();
  expect(json.data?.user?.id).toBe(QLT110_SEED.personas.sellerOwnerA.userId);
  expect(json.data?.user?.email).toBe(QLT110_SEED.personas.sellerOwnerA.email);
  expect(json.data?.user?.surface).toBe("SELLER");
  const cookie = sessionCookie(res.headers()["set-cookie"]);
  expect(cookie.length, "session cookie").toBeGreaterThan(8);
  expect(json.data?.csrfToken, "login csrf").toBeTruthy();
  expect(json.data?.sessionId, "session id").toBeTruthy();
  return {
    cookie,
    csrfFromLogin: json.data!.csrfToken!,
    sessionId: json.data!.sessionId!,
  };
}

async function refreshSession(
  request: APIRequestContext,
  cookie: string,
): Promise<{ csrf: string; userId: string; surface: string }> {
  const res = await request.get(`${origin()}/v1/auth/session`, {
    headers: {
      Accept: "application/json",
      Cookie: `fersaku_session=${cookie}`,
    },
  });
  expect(res.status(), "GET /session").toBe(200);
  const json = (await res.json()) as Envelope<{
    csrfToken?: string;
    userId?: string;
    surface?: string;
    sessionStatus?: string;
  }>;
  expect(json.data?.csrfToken).toBeTruthy();
  expect(json.data?.sessionStatus).toBe("AUTHENTICATED");
  return {
    csrf: json.data!.csrfToken!,
    userId: json.data!.userId || "",
    surface: json.data!.surface || "",
  };
}

test.describe("INT-190 public catalog vertical slice (live API)", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("featured → storefront → product with stable QLT-110 seed IDs", async ({
    request,
  }) => {
    const featuredRes = await request.get(
      `${origin()}/v1/public/products/featured?limit=50`,
    );
    expect(featuredRes.status(), "featured").toBe(200);
    const featured = (await featuredRes.json()) as Envelope<
      Array<{
        id?: string;
        slug?: string;
        storeSlug?: string;
        title?: string;
      }>
    >;
    expect(Array.isArray(featured.data), "featured data array").toBe(true);
    expect(featured.meta?.requestId, "featured requestId").toBeTruthy();

    const seedFeatured = (featured.data || []).find(
      (p) => p.id === QLT110_SEED.resources.productPublished,
    );
    expect(
      seedFeatured,
      "QLT-110 published product present in featured",
    ).toBeTruthy();
    expect(seedFeatured!.slug).toBe(QLT110_SEED.resources.productPublishedSlug);
    expect(seedFeatured!.storeSlug).toBe(QLT110_SEED.resources.storeASlug);

    const storeRes = await request.get(
      `${origin()}/v1/public/stores/${QLT110_SEED.resources.storeASlug}`,
    );
    expect(storeRes.status(), "storefront").toBe(200);
    const store = (await storeRes.json()) as Envelope<{
      slug?: string;
      name?: string;
      products?: Array<{ id?: string; slug?: string; storeSlug?: string }>;
    }>;
    expect(store.data?.slug).toBe(QLT110_SEED.resources.storeASlug);
    expect(store.meta?.requestId).toBeTruthy();
    const storeProducts = store.data?.products || [];
    expect(
      storeProducts.some(
        (p) => p.id === QLT110_SEED.resources.productPublished,
      ),
      "store lists published product",
    ).toBe(true);

    const productRes = await request.get(
      `${origin()}/v1/public/products/${QLT110_SEED.resources.productPublishedSlug}?store=${QLT110_SEED.resources.storeASlug}`,
    );
    expect(productRes.status(), "product").toBe(200);
    const product = (await productRes.json()) as Envelope<{
      id?: string;
      slug?: string;
      storeSlug?: string;
      title?: string;
      price?: number;
    }>;
    expect(product.data?.id).toBe(QLT110_SEED.resources.productPublished);
    expect(product.data?.slug).toBe(QLT110_SEED.resources.productPublishedSlug);
    expect(product.data?.storeSlug).toBe(QLT110_SEED.resources.storeASlug);
    expect(product.data?.price).toBe(50000);
    expect(product.meta?.requestId).toBeTruthy();

    // No mock demo identity leakage on live public path.
    const body = JSON.stringify(product);
    expect(body.includes("DEMO_STORE_ID")).toBe(false);
    expect(body.includes("asep-ai-tools")).toBe(false);
  });

  test("Next same-origin rewrite serves public featured (when Next edge up)", async ({
    request,
    baseURL,
  }) => {
    test.skip(process.env.E2E_API_HAS_NEXT === "0", "Next edge not running");
    expect(baseURL).toBeTruthy();
    const res = await request.get("/v1/public/products/featured?limit=50");
    expect(res.status(), "Next→API featured").toBe(200);
    const json = (await res.json()) as Envelope<
      Array<{ id?: string; storeSlug?: string }>
    >;
    expect(Array.isArray(json.data)).toBe(true);
    const seed = (json.data || []).find(
      (p) => p.id === QLT110_SEED.resources.productPublished,
    );
    expect(seed, "seed product via Next rewrite").toBeTruthy();
    expect(seed!.storeSlug).toBe(QLT110_SEED.resources.storeASlug);
  });
});

test.describe("INT-190 authenticated seller vertical slice (live API)", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("login → session → merchant bootstrap → seller product read → logout", async ({
    request,
  }) => {
    const { cookie, sessionId } = await sellerLogin(request);

    const session = await refreshSession(request, cookie);
    expect(session.userId).toBe(QLT110_SEED.personas.sellerOwnerA.userId);
    expect(session.surface).toBe("SELLER");

    const bootRes = await request.get(`${origin()}/v1/seller/me/merchant`, {
      headers: {
        Accept: "application/json",
        Cookie: `fersaku_session=${cookie}`,
      },
    });
    expect(bootRes.status(), "seller bootstrap").toBe(200);
    const boot = (await bootRes.json()) as Envelope<{
      merchantId?: string;
      canonicalStoreId?: string;
      currentStoreId?: string;
      onboardingCompleted?: boolean;
      onboardingState?: string;
      stores?: Array<{ storeId?: string; slug?: string }>;
    }>;
    expect(boot.data?.merchantId).toBe(QLT110_SEED.resources.merchantA);
    expect(boot.data?.canonicalStoreId).toBe(QLT110_SEED.resources.storeA);
    expect(boot.data?.currentStoreId).toBe(QLT110_SEED.resources.storeA);
    expect(boot.data?.onboardingCompleted).toBe(true);
    expect(boot.data?.onboardingState).toBe("COMPLETE");
    expect(
      (boot.data?.stores || []).some(
        (s) =>
          s.storeId === QLT110_SEED.resources.storeA &&
          s.slug === QLT110_SEED.resources.storeASlug,
      ),
    ).toBe(true);
    // API path never uses demo store authority.
    expect(JSON.stringify(boot.data).includes("DEMO_STORE")).toBe(false);

    const productsRes = await request.get(
      `${origin()}/v1/stores/${QLT110_SEED.resources.storeA}/products`,
      {
        headers: {
          Accept: "application/json",
          Cookie: `fersaku_session=${cookie}`,
        },
      },
    );
    expect(productsRes.status(), "seller list products").toBe(200);
    const products = (await productsRes.json()) as Envelope<
      Array<{ id?: string; slug?: string; status?: string }>
    >;
    expect(Array.isArray(products.data)).toBe(true);
    const published = (products.data || []).find(
      (p) => p.id === QLT110_SEED.resources.productPublished,
    );
    expect(published, "seller sees published seed product").toBeTruthy();
    expect(published!.slug).toBe(QLT110_SEED.resources.productPublishedSlug);
    expect(published!.status).toBe("published");

    // CSRF recovery path: GET /session re-issues token for mutation.
    const csrf = (await refreshSession(request, cookie)).csrf;
    const logoutRes = await request.post(`${origin()}/v1/auth/logout`, {
      data: {},
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: `fersaku_session=${cookie}`,
        "X-CSRF-Token": csrf,
      },
    });
    expect(logoutRes.status(), "logout").toBe(200);

    const after = await request.get(`${origin()}/v1/auth/session`, {
      headers: {
        Accept: "application/json",
        Cookie: `fersaku_session=${cookie}`,
      },
    });
    expect(after.status(), "session after logout").toBe(401);
    expect(sessionId.length).toBeGreaterThan(0);
  });
});

test.describe("INT-190 buyer session path (live API)", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("buyer magic-link request + optional password session path", async ({
    request,
  }) => {
    // AUT-110 product path is magic-link (generic 200). Password session is
    // available on QLT-110 seed users when not rate-limited.
    const ml = await request.post(`${origin()}/v1/auth/magic-link/request`, {
      data: { email: SEED_PERSONAS.buyerA.email },
      headers: { Accept: "application/json" },
    });
    expect(ml.status(), "magic-link request").toBe(200);
    const mlBody = (await ml.json()) as Envelope<{ message?: string }>;
    expect(mlBody.data?.message).toBeTruthy();
    expect(mlBody.meta?.requestId).toBeTruthy();

    const res = await request.post(`${origin()}/v1/auth/login`, {
      data: {
        email: QLT110_SEED.personas.buyerA.email,
        password: QLT110_SEED.password,
        surface: QLT110_SEED.personas.buyerA.surface,
      },
      headers: { Accept: "application/json" },
    });

    if (res.status() === 429) {
      test.info().annotations.push({
        type: "residual",
        description:
          "buyer password login rate-limited in this run; magic-link request still green. Full mail consume needs MAIL_MODE=smtp + Mailpit (compose residual).",
      });
      return;
    }

    expect(res.status(), "buyer login").toBe(200);
    const json = (await res.json()) as Envelope<{
      user?: { id?: string; surface?: string };
      csrfToken?: string;
    }>;
    expect(json.data?.user?.id).toBe(QLT110_SEED.personas.buyerA.userId);
    expect(json.data?.user?.surface).toBe("BUYER");
    const cookie = sessionCookie(res.headers()["set-cookie"]);
    expect(cookie.length).toBeGreaterThan(8);

    const session = await refreshSession(request, cookie);
    expect(session.userId).toBe(QLT110_SEED.personas.buyerA.userId);
    expect(session.surface).toBe("BUYER");
  });
});

test.describe("INT-190 negative probes (live API)", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("401 without session on seller bootstrap", async ({ request }) => {
    const res = await request.get(`${origin()}/v1/seller/me/merchant`, {
      headers: { Accept: "application/json" },
    });
    expect(res.status()).toBe(401);
    const json = (await res.json()) as Envelope<unknown>;
    expect(json.problem?.code).toBe("AUTH_REQUIRED");
  });

  test("CSRF invalid on logout without token", async ({ request }) => {
    const { cookie } = await sellerLogin(request);
    const res = await request.post(`${origin()}/v1/auth/logout`, {
      data: {},
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: `fersaku_session=${cookie}`,
      },
    });
    expect(res.status()).toBe(403);
    const json = (await res.json()) as Envelope<unknown>;
    expect(json.problem?.code).toBe("AUTH_CSRF_INVALID");
  });

  test("foreign store product list → RESOURCE_NOT_FOUND", async ({
    request,
  }) => {
    const { cookie } = await sellerLogin(request);
    const res = await request.get(
      `${origin()}/v1/stores/${QLT110_SEED.resources.storeB}/products`,
      {
        headers: {
          Accept: "application/json",
          Cookie: `fersaku_session=${cookie}`,
        },
      },
    );
    expect(res.status()).toBe(404);
    const json = (await res.json()) as Envelope<unknown>;
    expect(json.problem?.code).toBe("RESOURCE_NOT_FOUND");
  });

  test("unknown public store → RESOURCE_NOT_FOUND", async ({ request }) => {
    const res = await request.get(
      `${origin()}/v1/public/stores/does-not-exist-int190`,
    );
    expect(res.status()).toBe(404);
    const json = (await res.json()) as Envelope<unknown>;
    expect(json.problem?.code).toBe("RESOURCE_NOT_FOUND");
  });

  test("invalid credentials → AUTH_INVALID_CREDENTIALS (no session)", async ({
    request,
  }) => {
    const res = await request.post(`${origin()}/v1/auth/login`, {
      data: {
        email: QLT110_SEED.personas.sellerOwnerA.email,
        password: "DefinitelyWrongPassword1!",
        surface: "SELLER",
      },
      headers: { Accept: "application/json" },
    });
    expect([401, 403]).toContain(res.status());
    const json = (await res.json()) as Envelope<unknown>;
    expect(json.problem?.code).toBeTruthy();
    const setCookie = res.headers()["set-cookie"] || "";
    expect(setCookie.toLowerCase().includes("fersaku_session=")).toBe(false);
  });
});

// Keep SEED_PASSWORD referenced for harness consistency with QLT-215 helpers.
test.describe("INT-190 seed identity stability", () => {
  test("QLT-110 password helper matches seed persona password", () => {
    expect(SEED_PASSWORD).toBe(QLT110_SEED.password);
    expect(SEED_PERSONAS.sellerOwnerA.email).toBe(
      QLT110_SEED.personas.sellerOwnerA.email,
    );
  });
});
