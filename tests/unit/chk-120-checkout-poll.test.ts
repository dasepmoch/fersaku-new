import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { CHECKOUT_QR_WALLET_SEMANTICS } from "@/features/commerce/checkout/contracts";
import {
  createCheckoutIntentPollController,
  formatCountdownMmSs,
  isCheckoutIntentNonPaidTerminal,
  isCheckoutIntentPaid,
  isCheckoutIntentPendingPoll,
  isCheckoutIntentTerminal,
  nextCheckoutPollDelayMs,
  remainingSecondsUntil,
} from "@/features/commerce/checkout/poll";

const meta = {
  requestId: "req_chk120",
  timestamp: "2026-07-17T10:00:00Z",
};

const sampleIntentDto = {
  paymentIntentId: "pi_chk120_01",
  orderId: "ord_chk120_01",
  orderNumber: "FRS-240717-0120",
  status: "PENDING" as const,
  source: "STOREFRONT",
  paymentMode: "SANDBOX",
  currency: "IDR",
  amount: 100_000,
  subtotal: 100_000,
  discount: 0,
  tip: 0,
  fee: 3_700,
  merchantNet: 96_300,
  gross: 100_000,
  expiresAt: "2026-07-17T11:00:00Z",
  qrString: "000201010212CHK120",
  qrImageUrl: null,
  publicToken: "ptok_poll",
  replayed: false,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("CHK-120 terminal status helpers", () => {
  it("only PAID is paid; expired/failed/cancelled are non-paid terminal", () => {
    expect(isCheckoutIntentPaid("PAID")).toBe(true);
    expect(isCheckoutIntentPaid("PENDING")).toBe(false);
    expect(isCheckoutIntentTerminal("PAID")).toBe(true);
    expect(isCheckoutIntentTerminal("EXPIRED")).toBe(true);
    expect(isCheckoutIntentTerminal("FAILED")).toBe(true);
    expect(isCheckoutIntentTerminal("CANCELLED")).toBe(true);
    expect(isCheckoutIntentTerminal("PENDING")).toBe(false);
    expect(isCheckoutIntentNonPaidTerminal("EXPIRED")).toBe(true);
    expect(isCheckoutIntentNonPaidTerminal("PAID")).toBe(false);
    expect(isCheckoutIntentPendingPoll("REQUIRES_PAYMENT")).toBe(true);
    expect(isCheckoutIntentPendingPoll("UNKNOWN_OUTCOME")).toBe(true);
    expect(isCheckoutIntentPendingPoll("PAID")).toBe(false);
  });

  it("countdown uses server expiresAt; never invents paid", () => {
    const now = Date.parse("2026-07-17T10:59:00Z");
    expect(remainingSecondsUntil("2026-07-17T11:00:00Z", now)).toBe(60);
    expect(remainingSecondsUntil("2026-07-17T10:00:00Z", now)).toBe(0);
    expect(remainingSecondsUntil(undefined, now)).toBeNull();
    expect(formatCountdownMmSs(125)).toBe("02:05");
    expect(formatCountdownMmSs(0)).toBe("00:00");
  });

  it("backoff is bounded, faster initially, slower when hidden, honors Retry-After", () => {
    const d0 = nextCheckoutPollDelayMs({ attempt: 0, random: () => 0 });
    const d3 = nextCheckoutPollDelayMs({ attempt: 3, random: () => 0 });
    expect(d0).toBeLessThan(d3);
    expect(d0).toBeGreaterThanOrEqual(1_500);
    expect(d3).toBeLessThanOrEqual(12_000);

    const hidden = nextCheckoutPollDelayMs({
      attempt: 1,
      hidden: true,
      random: () => 0,
    });
    expect(hidden).toBeGreaterThanOrEqual(8_000);
    expect(hidden).toBeLessThanOrEqual(30_000);

    const ra = nextCheckoutPollDelayMs({
      attempt: 0,
      retryAfterSeconds: 5,
      random: () => 0,
    });
    expect(ra).toBe(5_000);
  });
});

describe("CHK-120 poll controller", () => {
  it("PAID terminal invokes onPaid and stops (no further fetches)", async () => {
    const fetches: string[] = [];
    const onPaid = vi.fn();
    const onTerminal = vi.fn();
    const onUpdate = vi.fn();
    const scheduled: Array<() => void> = [];

    const controller = createCheckoutIntentPollController({
      fetchIntent: async (id) => {
        fetches.push(id);
        return {
          paymentIntentId: id,
          orderId: "ord_1",
          status: fetches.length === 1 ? "PENDING" : "PAID",
        };
      },
      mapResult: (raw) => raw,
      getStatus: (i) => i.status,
      onUpdate,
      onPaid,
      onTerminalNonPaid: onTerminal,
      schedule: (fn) => {
        scheduled.push(fn);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearSchedule: () => {},
      random: () => 0,
      isDocumentHidden: () => false,
    });

    controller.start("pi_1", { immediate: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(onUpdate).toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();
    expect(fetches).toHaveLength(1);

    // Drain next scheduled poll
    const next = scheduled.shift();
    expect(next).toBeTypeOf("function");
    next?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ status: "PAID" }),
    );
    expect(onTerminal).not.toHaveBeenCalled();

    // No more scheduled after terminal
    const after = scheduled.length;
    // Force would-be next — stop should prevent
    controller.refreshNow();
    await Promise.resolve();
    expect(fetches.length).toBe(2);
    expect(scheduled.length).toBe(after);
  });

  it("EXPIRED terminal never becomes paid", async () => {
    const onPaid = vi.fn();
    const onTerminal = vi.fn();

    const controller = createCheckoutIntentPollController({
      fetchIntent: async (id) => ({
        paymentIntentId: id,
        orderId: "ord_x",
        status: "EXPIRED" as const,
      }),
      mapResult: (raw) => raw,
      getStatus: (i) => i.status,
      onUpdate: () => {},
      onPaid,
      onTerminalNonPaid: onTerminal,
      schedule: (fn) => {
        fn();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearSchedule: () => {},
      random: () => 0,
    });

    controller.start("pi_exp", { immediate: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(onPaid).not.toHaveBeenCalled();
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ status: "EXPIRED" }),
    );
  });

  it("poll abort on stop cancels in-flight and does not mark paid", async () => {
    const onPaid = vi.fn();
    let resolveFetch!: (v: {
      paymentIntentId: string;
      orderId: string;
      status: "PAID";
    }) => void;
    const fetchPromise = new Promise<{
      paymentIntentId: string;
      orderId: string;
      status: "PAID";
    }>((resolve) => {
      resolveFetch = resolve;
    });
    let aborted = false;

    const controller = createCheckoutIntentPollController({
      fetchIntent: async (_id, signal) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return fetchPromise;
      },
      mapResult: (raw) => raw,
      getStatus: (i) => i.status,
      onUpdate: () => {},
      onPaid,
      onTerminalNonPaid: () => {},
      schedule: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearSchedule: () => {},
      random: () => 0,
    });

    controller.start("pi_abort", { immediate: true });
    await Promise.resolve();
    controller.stop();
    expect(aborted).toBe(true);

    resolveFetch({
      paymentIntentId: "pi_abort",
      orderId: "ord",
      status: "PAID",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onPaid).not.toHaveBeenCalled();
  });

  it("poll failure never becomes paid; continues without creating intent", async () => {
    const onPaid = vi.fn();
    let calls = 0;
    const scheduled: Array<() => void> = [];

    const controller = createCheckoutIntentPollController({
      fetchIntent: async () => {
        calls += 1;
        if (calls === 1) throw new Error("network");
        return {
          paymentIntentId: "pi_f",
          orderId: "ord",
          status: "PENDING" as const,
        };
      },
      mapResult: (raw) => raw,
      getStatus: (i) => i.status,
      onUpdate: () => {},
      onPaid,
      onTerminalNonPaid: () => {},
      schedule: (fn) => {
        scheduled.push(fn);
        return scheduled.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearSchedule: () => {},
      random: () => 0,
    });

    controller.start("pi_f", { immediate: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(onPaid).not.toHaveBeenCalled();
    expect(calls).toBe(1);

    scheduled.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    expect(onPaid).not.toHaveBeenCalled();
    controller.stop();
  });

  it("no overlapping polls while in-flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const controller = createCheckoutIntentPollController({
      fetchIntent: async (id) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gate;
        inFlight -= 1;
        return {
          paymentIntentId: id,
          orderId: "o",
          status: "PENDING" as const,
        };
      },
      mapResult: (raw) => raw,
      getStatus: (i) => i.status,
      onUpdate: () => {},
      onPaid: () => {},
      onTerminalNonPaid: () => {},
      schedule: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearSchedule: () => {},
      random: () => 0,
    });

    controller.start("pi_o", { immediate: true });
    controller.refreshNow();
    controller.refreshNow();
    await Promise.resolve();
    expect(maxInFlight).toBe(1);
    release();
    controller.stop();
  });
});

describe("CHK-120 getCheckoutIntent API", () => {
  it("api path GETs /v1/checkout/intents/{id}", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest").mockResolvedValue({
      data: sampleIntentDto,
      meta,
    } as never);

    const { getCheckoutIntent } = await import(
      "@/features/commerce/checkout/api"
    );
    const intent = await getCheckoutIntent("pi_chk120_01");
    expect(intent.status).toBe("PENDING");
    expect(intent.qrString).toBe("000201010212CHK120");
    expect(spy).toHaveBeenCalledWith(
      "/v1/checkout/intents/pi_chk120_01",
      expect.objectContaining({ method: "GET" }),
    );
    spy.mockRestore();
  });

  it("getCheckoutIntent rejects mock domain (no live poll in mock)", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(true);

    const { getCheckoutIntent } = await import(
      "@/features/commerce/checkout/api"
    );
    await expect(getCheckoutIntent("pi_x")).rejects.toThrow(/api-only|mock/i);
  });

  it("mock simulate path unchanged — never hits intent GET", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(true);

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest");

    const { simulateCheckoutPayment } = await import(
      "@/features/commerce/checkout/api"
    );
    const result = await simulateCheckoutPayment({
      productId: "prod_01",
      storeSlug: "asep",
      customer: { name: "A", email: "a@example.test" },
      total: 1,
      tip: 0,
      upsell: false,
    });
    expect(result.accepted).toBe(true);
    expect(result.status).toBe("paid");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("poll error classification never yields paid intent", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);

    const http = await import("@/shared/api/http-client");
    vi.spyOn(http, "apiRequest").mockRejectedValue(
      new ApiError(503, {
        code: "SERVICE_UNAVAILABLE",
        message: "down",
        requestId: "req_down",
      }),
    );

    const { getCheckoutIntent } = await import(
      "@/features/commerce/checkout/api"
    );
    await expect(getCheckoutIntent("pi_x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("CHK-120 disposition freeze", () => {
  it("poll + QR live after create; expiry server-authoritative; no auto-create", () => {
    expect(CHECKOUT_QR_WALLET_SEMANTICS.poll).toMatch(/GET.*intents/i);
    expect(CHECKOUT_QR_WALLET_SEMANTICS.poll).toMatch(/PAID/i);
    expect(CHECKOUT_QR_WALLET_SEMANTICS.qrDisplay).toMatch(/LIVE_AFTER_CREATE|qrString/i);
    expect(CHECKOUT_QR_WALLET_SEMANTICS.expiryCountdown).toMatch(/expiresAt/i);
    expect(CHECKOUT_QR_WALLET_SEMANTICS.unknownNetworkOutcome).toMatch(
      /LOOKUP_RECOVERY|same idempotency/i,
    );
  });
});
