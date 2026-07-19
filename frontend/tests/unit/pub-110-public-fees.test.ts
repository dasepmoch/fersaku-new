import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  formatFeePercentFromBps,
  formatTransactionFeeLabel,
  formatWithdrawalFeeLabel,
  mapFeePolicyDtoToMarketingCopy,
  LAUNCH_FEE_POLICY_DTO,
  getActiveFeePolicyDto,
  getPublicFeeMarketingCopy,
  resetPublicFeePolicyCacheForTests,
} from "@/features/platform-fees";
import { feePolicyEnvelopeSchema } from "@/shared/api/schemas";
import { FERSAKU_FEE_POLICY } from "@/shared/finance/fee-policy";

const meta = {
  requestId: "req_pub110",
  timestamp: "2026-07-17T10:00:00Z",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  resetPublicFeePolicyCacheForTests();
});

describe("PUB-110 fee mapping", () => {
  it("formats bps percent labels", () => {
    expect(formatFeePercentFromBps(300)).toBe("3%");
    expect(formatFeePercentFromBps(0)).toBe("0%");
    expect(formatFeePercentFromBps(350)).toBe("3.5%");
    expect(formatFeePercentFromBps(325)).toBe("3.25%");
  });

  it("maps launch DTO to existing marketing copy strings", () => {
    const copy = mapFeePolicyDtoToMarketingCopy(LAUNCH_FEE_POLICY_DTO, "mock");
    expect(copy.policyVersion).toBe("LAUNCH_FEE_POLICY_V1");
    expect(copy.transaction).toBe("3% + Rp700");
    expect(copy.withdrawal).toBe("3% + biaya proses");
    expect(copy.minimumWithdrawal).toBe("Rp50.000");
    expect(copy.transactionPercentBps).toBe(300);
    expect(copy.transactionFixedIdr).toBe(700);
    expect(copy.minimumWithdrawalIdr).toBe(50_000);
  });

  it("keeps formatter helpers aligned with launch policy constants", () => {
    expect(
      formatTransactionFeeLabel(
        FERSAKU_FEE_POLICY.transactionRatePercent * 100,
        FERSAKU_FEE_POLICY.transactionProcessingFee,
      ),
    ).toBe("3% + Rp700");
    expect(
      formatWithdrawalFeeLabel(FERSAKU_FEE_POLICY.withdrawalRatePercent * 100),
    ).toBe("3% + biaya proses");
  });

  it("accepts fee policy envelope schema for public API contract", () => {
    const parsed = feePolicyEnvelopeSchema.safeParse({
      data: LAUNCH_FEE_POLICY_DTO,
      meta,
    });
    expect(parsed.success).toBe(true);
  });

  it("maps alternate versioned policy amounts without inventing fields", () => {
    const copy = mapFeePolicyDtoToMarketingCopy(
      {
        ...LAUNCH_FEE_POLICY_DTO,
        policyVersion: "FEE_POLICY_V2_TEST",
        transactionPercentBps: 250,
        transactionFixedIdr: 1_000,
        withdrawalPercentBps: 250,
        minimumWithdrawalIdr: 75_000,
      },
      "api",
    );
    expect(copy.policyVersion).toBe("FEE_POLICY_V2_TEST");
    expect(copy.transaction).toBe("2.5% + Rp1.000");
    expect(copy.withdrawal).toBe("2.5% + biaya proses");
    expect(copy.minimumWithdrawal).toBe("Rp75.000");
    expect(copy.source).toBe("api");
  });
});

describe("PUB-110 public fee adapter", () => {
  it("mock domain returns launch policy version and copy", async () => {
    const { dto, source } = await getActiveFeePolicyDto();
    expect(source).toBe("mock");
    expect(dto.policyVersion).toBe("LAUNCH_FEE_POLICY_V1");
    expect(dto.transactionPercentBps).toBe(300);
    expect(dto.transactionFixedIdr).toBe(700);

    const copy = await getPublicFeeMarketingCopy();
    expect(copy.transaction).toBe("3% + Rp700");
    expect(copy.policyVersion).toBe("LAUNCH_FEE_POLICY_V1");
  });

  it("api mode maps GET /v1/platform/fees envelope", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SOURCE_PUBLIC_CATALOG", "api");

    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest").mockResolvedValue({
      data: {
        ...LAUNCH_FEE_POLICY_DTO,
        policyVersion: "LAUNCH_FEE_POLICY_V1",
        checksum: "abc",
      },
      meta,
    } as never);

    const {
      getPublicFeeMarketingCopy: getCopy,
      getActiveFeePolicyDto: getDto,
    } = await import("@/features/platform-fees/api");

    const { dto, source } = await getDto();
    expect(source).toBe("api");
    expect(dto.policyVersion).toBe("LAUNCH_FEE_POLICY_V1");
    expect(spy).toHaveBeenCalledWith(
      "/v1/platform/fees",
      expect.objectContaining({
        schema: expect.anything(),
      }),
    );
    const callOpts = spy.mock.calls[0]?.[1] as { schema?: unknown };
    expect(callOpts?.schema).toBeDefined();

    const copy = await getCopy();
    expect(copy.transaction).toBe("3% + Rp700");
    expect(copy.source).toBe("api");
    spy.mockRestore();
  });

  it("outage after success serves last known policy version (not invented)", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SOURCE_PUBLIC_CATALOG", "api");

    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const liveDto = {
      ...LAUNCH_FEE_POLICY_DTO,
      policyVersion: "LAUNCH_FEE_POLICY_V1",
      transactionFixedIdr: 700,
    };

    const http = await import("@/shared/api/http-client");
    const { ApiError: LiveApiError } = await import("@/shared/api/api-error");
    const spy = vi
      .spyOn(http, "apiRequest")
      .mockResolvedValueOnce({ data: liveDto, meta } as never)
      .mockRejectedValueOnce(
        new LiveApiError(503, {
          code: PROBLEM_CODES.SERVICE_UNAVAILABLE,
          message: "down",
          requestId: "req_down",
        }),
      );

    const {
      getActiveFeePolicyDto: getDto,
      resetPublicFeePolicyCacheForTests: reset,
    } = await import("@/features/platform-fees/api");
    reset();

    const first = await getDto();
    expect(first.source).toBe("api");
    expect(first.dto.policyVersion).toBe("LAUNCH_FEE_POLICY_V1");

    const second = await getDto();
    expect(second.source).toBe("last_known");
    expect(second.dto.policyVersion).toBe(first.dto.policyVersion);
    expect(second.dto.transactionFixedIdr).toBe(700);
    spy.mockRestore();
  });

  it("cold outage falls back to launch policy (release-installed), not free-form numbers", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SOURCE_PUBLIC_CATALOG", "api");

    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const { ApiError: LiveApiError } = await import("@/shared/api/api-error");
    const spy = vi.spyOn(http, "apiRequest").mockRejectedValue(
      new LiveApiError(502, {
        code: PROBLEM_CODES.INTERNAL_ERROR,
        message: "gateway",
        requestId: "req_502",
      }),
    );

    const {
      getActiveFeePolicyDto: getDto,
      resetPublicFeePolicyCacheForTests: reset,
      LAUNCH_FEE_POLICY_DTO: launch,
    } = await import("@/features/platform-fees/api");
    reset();

    const result = await getDto();
    expect(result.source).toBe("launch_fallback");
    expect(result.dto).toEqual(launch);
    expect(result.dto.transactionPercentBps).toBe(300);
    expect(result.dto.transactionFixedIdr).toBe(700);
    spy.mockRestore();
  });
});
