import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  orderResultDtoSchema,
  orderResultEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  ORDER_RESULT_CAPABILITY_SEMANTICS,
  buildMockOrderResult,
  canonicalOrderResultPath,
  isKnownOrderResultPathStatus,
  mapOrderResultDto,
  mapPaymentStatusToDisplayState,
  resolveOrderResultDisplayState,
} from "@/features/commerce/order-result";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";

const meta = {
  requestId: "req_chk130",
  timestamp: "2026-07-17T10:00:00Z",
};

const paidDto = {
  orderId: "01HQ0ORDER000000000000001",
  orderNumber: "FRS-240717-0001",
  orderStatus: "PAID",
  paymentStatus: "PAID",
  source: "STOREFRONT",
  currency: "IDR",
  subtotal: 79_000,
  discount: 0,
  tip: 0,
  fee: 2_900,
  gross: 79_000,
  merchantNet: 76_100,
  amount: 79_000,
  paymentIntentId: "pi_chk130",
  createdAt: "2026-07-17T09:00:00Z",
  productTitle: "AI Prompt Pack",
  productId: "prod_01",
  productSlug: "ai-prompt-pack",
  storeSlug: "asep-ai-tools",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_chk130",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_chk130",
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

describe("CHK-130 schemas", () => {
  it("accepts orderPublicDTO-shaped envelope", () => {
    expect(orderResultDtoSchema.safeParse(paidDto).success).toBe(true);
    const env = orderResultEnvelopeSchema.safeParse({
      data: paidDto,
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("rejects fractional money", () => {
    expect(
      orderResultDtoSchema.safeParse({ ...paidDto, gross: 79_000.5 }).success,
    ).toBe(false);
  });
});

describe("CHK-130 mappers — backend state only", () => {
  it("maps PAID owner order to success chrome fields", () => {
    const result = mapOrderResultDto(paidDto);
    expect(result.displayState).toBe("success");
    expect(result.orderId).toBe(paidDto.orderId);
    expect(result.orderNumber).toBe("FRS-240717-0001");
    expect(result.gross).toBe(79_000);
    expect(result.productTitle).toBe("AI Prompt Pack");
    expect(result.deliveryReadyShell).toBe(true);
    // No delivery secrets on base result
    expect(result).not.toHaveProperty("downloadUrl");
    expect(result).not.toHaveProperty("secrets");
  });

  it("maps PENDING / FAILED / EXPIRED without consulting URL", () => {
    expect(mapPaymentStatusToDisplayState("PENDING")).toBe("pending");
    expect(mapPaymentStatusToDisplayState("UNPAID")).toBe("pending");
    expect(mapPaymentStatusToDisplayState("FAILED")).toBe("failed");
    expect(mapPaymentStatusToDisplayState("EXPIRED")).toBe("failed");
    expect(mapPaymentStatusToDisplayState("CANCELLED")).toBe("failed");
  });

  it("URL status is ignored as authority (resolveOrderResultDisplayState)", () => {
    const paid = mapOrderResultDto(paidDto);
    expect(resolveOrderResultDisplayState(paid, "failed")).toBe("success");
    expect(resolveOrderResultDisplayState(paid, "pending")).toBe("success");
    expect(resolveOrderResultDisplayState(paid, "success")).toBe("success");

    const pending = mapOrderResultDto({
      ...paidDto,
      paymentStatus: "PENDING",
      orderStatus: "PENDING",
    });
    expect(resolveOrderResultDisplayState(pending, "success")).toBe("pending");
  });

  it("canonical path uses backend display state not URL", () => {
    const paid = mapOrderResultDto(paidDto);
    expect(canonicalOrderResultPath(paid)).toBe(
      "/orders/FRS-240717-0001/success",
    );
    expect(isKnownOrderResultPathStatus("success")).toBe(true);
    expect(isKnownOrderResultPathStatus("bogus")).toBe(false);
  });
});

describe("CHK-130 capability semantics freeze", () => {
  it("freezes path status non-authority and no-query capability", () => {
    expect(ORDER_RESULT_CAPABILITY_SEMANTICS.pathStatus).toMatch(
      /PRESENTATIONAL_ONLY/,
    );
    expect(ORDER_RESULT_CAPABILITY_SEMANTICS.capabilityTransport).toMatch(
      /never query/i,
    );
    expect(ORDER_RESULT_CAPABILITY_SEMANTICS.deliverySecrets).toMatch(
      /OUT_OF_SCOPE/,
    );
  });
});

describe("CHK-130 api adapter (api mode)", () => {
  async function loadApiMode() {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");
    return import("@/features/commerce/order-result/api");
  }

  it("owner ok — GET /v1/orders/{id} maps paid snapshot", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: paidDto, meta }));
    vi.stubGlobal("fetch", fetchMock);

    const { getOrderResult, ORDER_CAPABILITY_HEADER } = await loadApiMode();
    const result = await getOrderResult("01HQ0ORDER000000000000001");
    expect(result?.displayState).toBe("success");
    expect(result?.gross).toBe(79_000);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/orders/01HQ0ORDER000000000000001");
    // No capability in query
    expect(url).not.toContain("token=");
    expect(url).not.toContain("capability=");
    void ORDER_CAPABILITY_HEADER;
  });

  it("sends capability only as header when provided (never query)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: paidDto, meta }));
    vi.stubGlobal("fetch", fetchMock);

    const { getOrderResult, ORDER_CAPABILITY_HEADER } = await loadApiMode();
    await getOrderResult("ord_1", { capability: "cap_secret_memory_only" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get(ORDER_CAPABILITY_HEADER)).toBe("cap_secret_memory_only");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain("cap_secret");
  });

  it("foreign / invalid order → null (safe not-found, no enumeration)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
        ),
    );
    const { getOrderResult } = await loadApiMode();
    const missing = await getOrderResult("not-owned-or-missing");
    expect(missing).toBeNull();
  });

  it("401 rethrows (auth flow, not not-found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(problemResponse(401, PROBLEM_CODES.AUTH_REQUIRED)),
    );
    const { getOrderResult } = await loadApiMode();
    await expect(getOrderResult("x")).rejects.toMatchObject({ status: 401 });
  });

  it("5xx rethrows without mock fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(problemResponse(502, "UPSTREAM_ERROR")),
    );
    const { getOrderResult } = await loadApiMode();
    await expect(getOrderResult("x")).rejects.toMatchObject({ status: 502 });
  });
});

describe("CHK-130 mock path", () => {
  it("returns fixture via adapter when checkout domain is mock", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { getOrderResult } = await import(
      "@/features/commerce/order-result/api"
    );
    const result = await getOrderResult("FRS-240712-1848");
    expect(result?.displayState).toBe("success");
    expect(result?.productTitle).toBe("AI Prompt Pack");
    expect(result?.gross).toBe(79_000);
  });

  it("buildMockOrderResult respects paymentStatus not a fake URL status", () => {
    const pending = buildMockOrderResult({
      orderId: "FRS-1",
      paymentStatus: "PENDING",
    });
    expect(pending.displayState).toBe("pending");
    expect(resolveOrderResultDisplayState(pending, "success")).toBe("pending");
  });
});
