import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  invoiceDtoSchema,
  invoiceEnvelopeSchema,
  publicInvoiceVerifyDtoSchema,
  publicInvoiceVerifyEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  INVOICE_SEMANTICS,
  buildMockInvoiceProjection,
  buildMockInvoiceVerify,
  formatSignatureLabel,
  mapInvoiceDto,
  mapPublicInvoiceVerifyDto,
} from "@/features/commerce/invoice";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";

const meta = {
  requestId: "req_chk150",
  timestamp: "2026-07-17T10:00:00Z",
};

const ownerInvoiceDto = {
  id: "inv_01",
  orderId: "01HQ0ORDER000000000000001",
  storeId: "store_01",
  invoiceNumber: "INV-240717-0001",
  status: "READY",
  currency: "IDR",
  grossIdr: 129_000,
  paidAt: "2026-07-12T07:42:00Z",
  currentVersion: 1,
  payloadHash: "6AD891CE0000000000000000000000CB42",
  rendererVersion: "v1",
  renderStatus: "READY",
  snapshot: {
    invoiceNumber: "INV-240717-0001",
    orderId: "01HQ0ORDER000000000000001",
    orderNumber: "FRS-240717-0001",
    currency: "IDR",
    subtotalIdr: 118_000,
    discountIdr: 14_000,
    tipIdr: 25_000,
    feeIdr: 0,
    grossIdr: 129_000,
    couponCode: "LAUNCH10",
    paidAt: "2026-07-12T07:42:00Z",
    buyer: {
      name: "Nadia Putri",
      email: "nadia@studio.id",
    },
    issuer: {
      storeId: "store_01",
      storeName: "Asep AI Tools",
      merchantId: "m_01",
    },
    lines: [
      {
        title: "AI Prompt Pack",
        productType: "Digital download",
        version: "3.1",
        unitPriceIdr: 79_000,
        quantity: 1,
        lineTotalIdr: 79_000,
      },
      {
        title: "Cursor Rules Kit",
        productType: "Checkout offer",
        unitPriceIdr: 39_000,
        quantity: 1,
        lineTotalIdr: 39_000,
      },
    ],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_chk150",
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
        requestId: "req_chk150",
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

describe("CHK-150 schemas", () => {
  it("accepts invoice envelope with snapshot money", () => {
    expect(invoiceDtoSchema.safeParse(ownerInvoiceDto).success).toBe(true);
    const env = invoiceEnvelopeSchema.safeParse({
      data: ownerInvoiceDto,
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("rejects fractional gross", () => {
    expect(
      invoiceDtoSchema.safeParse({ ...ownerInvoiceDto, grossIdr: 129_000.5 })
        .success,
    ).toBe(false);
  });

  it("accepts public verify privacy-safe envelope", () => {
    const dto = {
      valid: true,
      invoiceNumber: "INV-1",
      orderNumber: "FRS-1",
      currency: "IDR",
      grossIdr: 50_000,
      storeName: "Store",
    };
    expect(publicInvoiceVerifyDtoSchema.safeParse(dto).success).toBe(true);
    expect(
      publicInvoiceVerifyEnvelopeSchema.safeParse({ data: dto, meta }).success,
    ).toBe(true);
  });
});

describe("CHK-150 mappers — immutable projection", () => {
  it("maps owner invoice without recomputing totals from lines", () => {
    const p = mapInvoiceDto(ownerInvoiceDto, { surface: "buyer" });
    expect(p.grossIdr).toBe(129_000);
    expect(p.subtotalIdr).toBe(118_000);
    expect(p.tipIdr).toBe(25_000);
    expect(p.discountIdr).toBe(14_000);
    expect(p.invoiceNumber).toBe("INV-240717-0001");
    expect(p.buyerName).toBe("Nadia Putri");
    expect(p.issuerName).toBe("Asep AI Tools");
    expect(p.lines).toHaveLength(2);
    expect(p.canPrint).toBe(true);
    expect(p.backHref).toContain("/account/purchases/");
    // No delivery secrets
    expect(p).not.toHaveProperty("secrets");
    expect(p).not.toHaveProperty("downloadUrl");
  });

  it("uses server gross even if lines would sum differently", () => {
    const p = mapInvoiceDto(
      {
        ...ownerInvoiceDto,
        grossIdr: 200_000,
        snapshot: {
          ...ownerInvoiceDto.snapshot,
          grossIdr: 200_000,
          // lines still sum to 118k — client must trust header/snapshot gross
        },
      },
      { surface: "order" },
    );
    expect(p.grossIdr).toBe(200_000);
    expect(p.backHref).toContain("/orders/");
  });

  it("formatSignatureLabel shortens hash", () => {
    expect(formatSignatureLabel("6AD891CE0000000000000000000000CB42")).toMatch(
      /^SHA256:6AD891CE\.\.\./,
    );
  });
});

describe("CHK-150 public verify mapper", () => {
  it("maps valid privacy-safe fields only", () => {
    const r = mapPublicInvoiceVerifyDto({
      valid: true,
      invoiceNumber: "INV-1",
      orderNumber: "FRS-240712-1848",
      currency: "IDR",
      grossIdr: 129_000,
      paidAt: "2026-07-12T07:42:00Z",
      storeName: "Asep AI Tools",
    });
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.invoiceNumber).toBe("INV-1");
      expect(r.grossIdr).toBe(129_000);
      expect(r.storeName).toBe("Asep AI Tools");
      expect(r.invoiceHref).toContain("/orders/FRS-240712-1848/invoice");
      expect(r).not.toHaveProperty("buyerEmail");
      expect(r).not.toHaveProperty("buyerName");
    }
  });

  it("invalid token / valid=false never fabricates invoice", () => {
    expect(mapPublicInvoiceVerifyDto({ valid: false })).toEqual({
      valid: false,
    });
    // valid without invoice number → fail closed
    expect(mapPublicInvoiceVerifyDto({ valid: true })).toEqual({
      valid: false,
    });
  });
});

describe("CHK-150 semantics freeze", () => {
  it("freezes login-gate guest + no client recompute + public privacy", () => {
    expect(INVOICE_SEMANTICS.projection).toMatch(/immutable/i);
    expect(INVOICE_SEMANTICS.guest).toMatch(/login-gated/i);
    expect(INVOICE_SEMANTICS.publicVerify).toMatch(/never includes buyer PII/i);
    expect(INVOICE_SEMANTICS.invalid).toMatch(/never fabricate/i);
  });
});

describe("CHK-150 api adapter — owner invoice (api mode)", () => {
  async function loadApiMode() {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");
    return import("@/features/commerce/invoice/api");
  }

  it("owner ok — GET buyer invoice maps projection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: ownerInvoiceDto, meta }));
    vi.stubGlobal("fetch", fetchMock);

    const { getBuyerInvoice } = await loadApiMode();
    const result = await getBuyerInvoice("01HQ0ORDER000000000000001");
    expect(result?.grossIdr).toBe(129_000);
    expect(result?.invoiceNumber).toBe("INV-240717-0001");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(
      "/v1/buyer/purchases/01HQ0ORDER000000000000001/invoice",
    );
  });

  it("owner ok — GET order invoice", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: ownerInvoiceDto, meta }));
    vi.stubGlobal("fetch", fetchMock);

    const { getOrderInvoice } = await loadApiMode();
    const result = await getOrderInvoice("01HQ0ORDER000000000000001");
    expect(result?.canPrint).toBe(true);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/orders/01HQ0ORDER000000000000001/invoice");
  });

  it("foreign buyer invoice → null (safe 404, no enumeration)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
        ),
    );
    const { getBuyerInvoice } = await loadApiMode();
    const missing = await getBuyerInvoice("not-owned");
    expect(missing).toBeNull();
  });

  it("foreign order invoice → null", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
        ),
    );
    const { getOrderInvoice } = await loadApiMode();
    expect(await getOrderInvoice("foreign")).toBeNull();
  });

  it("401 rethrows (login-gate, not not-found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(problemResponse(401, PROBLEM_CODES.AUTH_REQUIRED)),
    );
    const { getBuyerInvoice } = await loadApiMode();
    await expect(getBuyerInvoice("x")).rejects.toMatchObject({ status: 401 });
  });
});

describe("CHK-150 public verify adapter", () => {
  async function loadApiMode() {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");
    return import("@/features/commerce/invoice/api");
  }

  it("valid code maps privacy-safe result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          valid: true,
          invoiceNumber: "INV-1",
          orderNumber: "FRS-1",
          currency: "IDR",
          grossIdr: 50_000,
          storeName: "Store A",
          paidAt: "2026-07-12T07:42:00Z",
        },
        meta,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { verifyInvoiceByCode } = await loadApiMode();
    const r = await verifyInvoiceByCode("public-code-opaque");
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.grossIdr).toBe(50_000);
      expect(r).not.toHaveProperty("buyerEmail");
    }
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/invoices/verify/");
  });

  it("invalid token → valid false (never fabricate)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
        ),
    );
    const { verifyInvoiceByCode } = await loadApiMode();
    expect(await verifyInvoiceByCode("tampered-or-unknown")).toEqual({
      valid: false,
    });
  });

  it("POST body verify never puts token in query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { valid: true, invoiceNumber: "INV-9", grossIdr: 1_000 },
        meta,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { verifyInvoiceByTokenBody } = await loadApiMode();
    await verifyInvoiceByTokenBody("secret-public-code");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/public/invoices/verify");
    expect(url).not.toContain("secret-public-code");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("secret-public-code");
  });
});

describe("CHK-150 mock path", () => {
  it("buyer mock fixture via adapter", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { getBuyerInvoice } = await import(
      "@/features/commerce/invoice/api"
    );
    const result = await getBuyerInvoice("FRS-240712-1848");
    expect(result?.grossIdr).toBe(129_000);
    expect(result?.issuerName).toBe("Asep AI Tools");
    expect(result?.canPrint).toBe(true);
  });

  it("verify mock invalid token", () => {
    expect(buildMockInvoiceVerify("invalid")).toEqual({ valid: false });
    expect(buildMockInvoiceVerify("ab")).toEqual({ valid: false });
  });

  it("verify mock valid demo token", () => {
    const r = buildMockInvoiceVerify("FRS-240712-1848-6AD891CE");
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.grossIdr).toBe(129_000);
      expect(r.storeName).toBe("Asep AI Tools");
    }
  });

  it("buildMockInvoiceProjection print-ready", () => {
    const p = buildMockInvoiceProjection({
      orderId: "FRS-240712-1848",
      surface: "order",
    });
    expect(p.verificationPath).toContain("/invoices/verify/");
    expect(p.lines.length).toBeGreaterThan(0);
  });
});
