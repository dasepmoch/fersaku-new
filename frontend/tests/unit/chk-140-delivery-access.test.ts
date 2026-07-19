import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  deliveryAccessDtoSchema,
  deliveryAccessEnvelopeSchema,
  deliveryResendEnvelopeSchema,
  orderResultDtoSchema,
  buyerPurchaseDetailDtoSchema,
  buyerPurchaseSummaryDtoSchema,
} from "@/shared/api/schemas";
import {
  DELIVERY_ACCESS_SEMANTICS,
  buildMockDeliveryAccess,
  extractOpenUrlFromClaim,
  isDeliveryClaimExpired,
  mapDeliveryAccessDto,
  mapDeliveryResendDto,
  redactDeliveryClaim,
  secretsToCodeValue,
  secretsToCredentialFields,
} from "@/features/commerce/delivery-access";
import { mapBuyerPurchaseDetailDto } from "@/features/buyer/data/mappers";
import { mapOrderResultDto } from "@/features/commerce/order-result";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";

const meta = {
  requestId: "req_chk140",
  timestamp: "2026-07-17T10:00:00Z",
};

const ownerAccessDto = {
  grantId: "grant_01",
  orderId: "01HQ0ORDER000000000000001",
  orderItemId: "oi_1",
  deliveryKind: "CODE" as const,
  status: "ACTIVE",
  accessCount: 1,
  maxAccesses: 5,
  expiresAt: "2026-07-24T10:00:00Z",
  secrets: { code: "SECRET-OWNER-ONLY" },
};

const downloadAccessDto = {
  grantId: "grant_02",
  orderId: "01HQ0ORDER000000000000001",
  orderItemId: "oi_1",
  deliveryKind: "DOWNLOAD" as const,
  status: "ACTIVE",
  accessCount: 2,
  maxAccesses: 5,
  downloadObjectId: "obj_abc",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_chk140",
      "Cache-Control": "no-store",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_chk140",
      },
    },
    status,
  );
}

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("CHK-140 schemas", () => {
  it("accepts DeliveryAccess envelope with secrets", () => {
    expect(deliveryAccessDtoSchema.safeParse(ownerAccessDto).success).toBe(
      true,
    );
    expect(
      deliveryAccessEnvelopeSchema.safeParse({
        data: ownerAccessDto,
        meta,
      }).success,
    ).toBe(true);
  });

  it("accepts download access without secrets (object id only)", () => {
    expect(deliveryAccessDtoSchema.safeParse(downloadAccessDto).success).toBe(
      true,
    );
  });

  it("accepts resend envelope without secrets", () => {
    expect(
      deliveryResendEnvelopeSchema.safeParse({
        data: {
          grantId: "g1",
          orderId: "o1",
          status: "ACTIVE",
          queued: true,
        },
        meta,
      }).success,
    ).toBe(true);
  });
});

describe("CHK-140 mappers", () => {
  it("maps owner grant with secrets into claim", () => {
    const claim = mapDeliveryAccessDto(ownerAccessDto, 1_000);
    expect(claim.grantId).toBe("grant_01");
    expect(claim.secrets?.code).toBe("SECRET-OWNER-ONLY");
    expect(claim.claimedAtMs).toBe(1_000);
    expect(secretsToCodeValue(claim.secrets!)).toBe("SECRET-OWNER-ONLY");
  });

  it("maps credential secrets to UI fields", () => {
    const fields = secretsToCredentialFields({
      username: "u1",
      password: "p1",
    });
    expect(fields).toEqual(
      expect.arrayContaining([
        { label: "Username", value: "u1", secret: false },
        { label: "Password", value: "p1", secret: true },
      ]),
    );
  });

  it("never treats downloadObjectId as open URL", () => {
    const claim = mapDeliveryAccessDto(downloadAccessDto);
    expect(claim.downloadObjectId).toBe("obj_abc");
    expect(extractOpenUrlFromClaim(claim)).toBeUndefined();
  });

  it("extracts only https open URL from secrets when present", () => {
    const claim = mapDeliveryAccessDto({
      ...downloadAccessDto,
      secrets: { url: "https://cdn.example/signed?x=1" },
    });
    expect(extractOpenUrlFromClaim(claim)).toBe(
      "https://cdn.example/signed?x=1",
    );
  });

  it("expiry helper clears after memory TTL", () => {
    const claim = mapDeliveryAccessDto(ownerAccessDto, 0);
    expect(isDeliveryClaimExpired(claim, 1000, 500)).toBe(true);
    expect(isDeliveryClaimExpired(claim, 100, 500)).toBe(false);
  });

  it("redact strips secrets for safe assert", () => {
    const r = redactDeliveryClaim(mapDeliveryAccessDto(ownerAccessDto));
    expect(r.hasSecrets).toBe(true);
    expect(r).not.toHaveProperty("secrets");
  });

  it("mapDeliveryResendDto never invents secrets", () => {
    const r = mapDeliveryResendDto({
      grantId: "g",
      orderId: "o",
      queued: true,
    });
    expect(r.queued).toBe(true);
    expect(r).not.toHaveProperty("secrets");
  });
});

describe("CHK-140 base responses have no secrets", () => {
  it("order result DTO/schema has no delivery secrets", () => {
    const paid = {
      orderId: "01HQ0ORDER000000000000001",
      paymentStatus: "PAID",
      gross: 79_000,
      productTitle: "AI Prompt Pack",
    };
    expect(orderResultDtoSchema.safeParse(paid).success).toBe(true);
    const result = mapOrderResultDto(paid);
    expect(result).not.toHaveProperty("secrets");
    expect(result).not.toHaveProperty("downloadUrl");
    expect(result).not.toHaveProperty("downloadObjectId");
  });

  it("buyer list/detail base mappers omit secrets", () => {
    const list = buyerPurchaseSummaryDtoSchema.safeParse({
      orderId: "01HQ0ORDER000000000000001",
      orderNumber: "FRS-1",
      storeId: "s1",
      paymentStatus: "PAID",
      grossIdr: 79_000,
      createdAt: "2026-07-12T07:33:00Z",
      deliveryKind: "CODE",
    });
    expect(list.success).toBe(true);

    const detail = {
      orderId: "01HQ0ORDER000000000000001",
      orderNumber: "FRS-1",
      storeId: "s1",
      paymentStatus: "PAID",
      grossIdr: 79_000,
      createdAt: "2026-07-12T07:33:00Z",
      items: [
        {
          orderItemId: "oi_1",
          productId: "p1",
          productTitle: "Code Pack",
          unitPriceIdr: 79_000,
          quantity: 1,
          lineTotalIdr: 79_000,
          deliveryKind: "CODE",
        },
      ],
    };
    expect(buyerPurchaseDetailDtoSchema.safeParse(detail).success).toBe(true);
    const mapped = mapBuyerPurchaseDetailDto(detail);
    expect(mapped.code?.value).toBe("");
    expect(mapped).not.toHaveProperty("secrets");
  });
});

describe("CHK-140 api adapter — owner grant / foreign deny", () => {
  async function loadApiMode(domain: "buyer" | "checkout" = "buyer") {
    vi.resetModules();
    const domainMod = await import("@/shared/data/domain-source");
    vi.spyOn(domainMod, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domainMod, "getDomainSource").mockReturnValue("api");
    void domain;
    return import("@/features/commerce/delivery-access/api");
  }

  it("owner grant — POST buyer delivery/access maps secrets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: ownerAccessDto, meta }));
    vi.stubGlobal("fetch", fetchMock);

    const { accessBuyerDelivery } = await loadApiMode("buyer");
    const claim = await accessBuyerDelivery("01HQ0ORDER000000000000001");
    expect(claim?.secrets?.code).toBe("SECRET-OWNER-ONLY");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(
      "/v1/buyer/purchases/01HQ0ORDER000000000000001/delivery/access",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
  });

  it("foreign buyer — 404 → null (safe deny, no secret)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
        ),
    );
    const { accessBuyerDelivery } = await loadApiMode("buyer");
    const claim = await accessBuyerDelivery("not-owned");
    expect(claim).toBeNull();
  });

  it("order access sends guest token in body only (never query)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: downloadAccessDto, meta }));
    vi.stubGlobal("fetch", fetchMock);

    const { accessOrderDelivery } = await loadApiMode("checkout");
    await accessOrderDelivery("01HQ0ORDER000000000000001", {
      token: "guest_cap_memory_only",
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(
      "/v1/orders/01HQ0ORDER000000000000001/delivery/access",
    );
    expect(url).not.toContain("token=");
    expect(url).not.toContain("guest_cap");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("guest_cap_memory_only");
  });

  it("order access foreign/denied → null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(problemResponse(403, "DELIVERY_ACCESS_DENIED")),
    );
    const { accessOrderDelivery } = await loadApiMode("checkout");
    const claim = await accessOrderDelivery("x", { token: "bad" });
    expect(claim).toBeNull();
  });

  it("resend posts idempotency and never returns secrets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          grantId: "g1",
          orderId: "01HQ0ORDER000000000000001",
          status: "ACTIVE",
          queued: true,
        },
        meta,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { resendBuyerDelivery } = await loadApiMode("buyer");
    const result = await resendBuyerDelivery({
      orderId: "01HQ0ORDER000000000000001",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.queued).toBe(true);
    expect(result).not.toHaveProperty("secrets");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("401 rethrows on buyer access", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(problemResponse(401, PROBLEM_CODES.AUTH_REQUIRED)),
    );
    const { accessBuyerDelivery } = await loadApiMode("buyer");
    await expect(accessBuyerDelivery("x")).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("CHK-140 mock path", () => {
  it("buyer mock returns fixture claim without network", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { accessBuyerDelivery } =
      await import("@/features/commerce/delivery-access/api");
    const claim = await accessBuyerDelivery("FRS-mock");
    expect(claim?.secrets?.code).toBeTruthy();
    expect(claim?.deliveryKind).toBe("CODE");
  });

  it("buildMockDeliveryAccess supports DOWNLOAD without secrets", () => {
    const d = buildMockDeliveryAccess("DOWNLOAD");
    expect(d.downloadObjectId).toBeTruthy();
    expect(d.secrets).toBeUndefined();
  });
});

describe("CHK-140 semantics freeze", () => {
  it("documents claim boundary and download gap", () => {
    expect(DELIVERY_ACCESS_SEMANTICS.baseResponses).toMatch(/never include/);
    expect(DELIVERY_ACCESS_SEMANTICS.downloadGap).toMatch(/downloadObjectId/);
    expect(DELIVERY_ACCESS_SEMANTICS.claimBoundary).toMatch(/explicit/);
  });
});
