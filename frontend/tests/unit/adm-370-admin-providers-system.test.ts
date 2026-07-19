import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminComponentHealthDtoSchema,
  adminEmergencyControlDtoSchema,
  adminEmergencyControlListEnvelopeSchema,
  adminFeePreviewEnvelopeSchema,
  adminProviderHealthDtoSchema,
  adminProviderHealthListEnvelopeSchema,
  adminSetEmergencyControlRequestSchema,
  adminSystemSnapshotEnvelopeSchema,
  feePolicyEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import {
  claimsHavePermission,
  ADMIN_ACTION_PERMISSIONS,
} from "@/features/admin/config/permissions";
import {
  getAdminSystemFees,
  getAdminSystemSnapshot,
  listAdminEmergencyControls,
  listAdminProviderInfrastructure,
  listAdminProviders,
  previewAdminSystemFees,
  setAdminEmergencyControl,
} from "@/features/admin/operations/emergency/api";
import {
  classifyHealthStatus,
  composeProviderRows,
  healthStatusLabel,
  mapComponentHealthDto,
  mapEmergencyControlList,
  mapFeePolicyDto,
  mapFeePreviewDto,
  mapProviderHealthDto,
  mapSystemSnapshotDto,
  overallHealthKind,
  overallHealthLabel,
} from "@/features/admin/operations/emergency/mappers";
import { EMERGENCY_SWITCH_NAMES } from "@/features/admin/operations/emergency/data";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/api-error";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/api/http-client")
  >("@/shared/api/http-client");
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

function installApiAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const meta = {
  requestId: "req_adm370",
  timestamp: "2026-07-17T12:00:00Z",
};

const sampleEmergency = {
  switchName: "QRIS_CHECKOUT",
  enabled: true,
  version: 3,
  reason: "prior",
  incidentTicket: "INC-0",
  effectiveAt: "2026-07-17T10:00:00Z",
  updatedAt: "2026-07-17T10:00:00Z",
};

const sampleProvider = {
  provider: "XENDIT",
  status: "DEGRADED",
  latencyMs: 400,
  accountScope: "xendit-primary",
  checkedAt: "2026-07-17T12:00:00Z",
  message: "elevated latency",
};

const sampleComponents = [
  {
    component: "xendit",
    status: "OK",
    latencyMs: 120,
    checkedAt: "2026-07-17T12:00:00Z",
  },
  {
    component: "r2",
    status: "DEGRADED",
    checkedAt: "2026-07-17T12:00:00Z",
    message: "noop/unconfigured",
  },
  {
    component: "redis",
    status: "DOWN",
    checkedAt: "2026-07-17T12:00:00Z",
    message: "ping failed",
  },
  {
    component: "mail",
    status: "UNKNOWN",
    checkedAt: "2026-07-17T12:00:00Z",
  },
];

beforeEach(() => {
  apiRequestMock.mockReset();
  clearDomainSourceSnapshot();
});

afterEach(() => {
  clearDomainSourceSnapshot();
});

describe("ADM-370 schemas", () => {
  it("parses provider health and rejects empty status", () => {
    expect(adminProviderHealthDtoSchema.parse(sampleProvider).status).toBe(
      "DEGRADED",
    );
    expect(() =>
      adminProviderHealthDtoSchema.parse({ ...sampleProvider, status: "" }),
    ).toThrow();
  });

  it("parses emergency control list envelope", () => {
    const parsed = adminEmergencyControlListEnvelopeSchema.parse({
      data: { items: [sampleEmergency] },
      meta,
    });
    expect(parsed.data.items[0]?.switchName).toBe("QRIS_CHECKOUT");
  });

  it("parses system snapshot with component health", () => {
    const parsed = adminSystemSnapshotEnvelopeSchema.parse({
      data: {
        emergencyControls: [sampleEmergency],
        feePolicyVersion: "LAUNCH_FEE_POLICY_V1",
        componentHealth: sampleComponents,
        note: "read-only",
      },
      meta,
    });
    expect(parsed.data.componentHealth).toHaveLength(4);
  });

  it("parses fee preview envelope", () => {
    const parsed = adminFeePreviewEnvelopeSchema.parse({
      data: {
        policyVersion: "LAUNCH_FEE_POLICY_V1",
        kind: "transaction",
        amount: 100_000,
        platformFee: 3000,
        processingFee: 700,
        totalFee: 3700,
        netAmount: 96_300,
      },
      meta,
    });
    expect(parsed.data.totalFee).toBe(3700);
  });

  it("requires expectedVersion >= 1 on set emergency", () => {
    expect(() =>
      adminSetEmergencyControlRequestSchema.parse({
        switchName: "WITHDRAWALS",
        enabled: false,
        reason: "incident drill long enough",
        expectedVersion: 0,
      }),
    ).toThrow();
  });
});

describe("ADM-370 health classification (truthful)", () => {
  it("never maps degraded/down/unknown to ok", () => {
    expect(classifyHealthStatus("OK")).toBe("ok");
    expect(classifyHealthStatus("DEGRADED")).toBe("degraded");
    expect(classifyHealthStatus("DOWN")).toBe("down");
    expect(classifyHealthStatus("WEIRD")).toBe("unknown");
    expect(classifyHealthStatus("")).toBe("unknown");
    expect(healthStatusLabel("ok", "OK")).toBe("Live");
    expect(healthStatusLabel("degraded", "DEGRADED")).toBe("Degraded");
    expect(healthStatusLabel("down", "DOWN")).toBe("Down");
    expect(healthStatusLabel("unknown", "WEIRD")).toBe("WEIRD");
  });

  it("overall kind fails closed on down/unknown", () => {
    expect(
      overallHealthKind([{ statusKind: "ok" }, { statusKind: "degraded" }]),
    ).toBe("degraded");
    expect(
      overallHealthKind([{ statusKind: "ok" }, { statusKind: "down" }]),
    ).toBe("down");
    expect(
      overallHealthKind([{ statusKind: "ok" }, { statusKind: "unknown" }]),
    ).toBe("unknown");
    expect(overallHealthKind([])).toBe("unknown");
    expect(overallHealthLabel("ok")).not.toMatch(/unknown/i);
    expect(overallHealthLabel("unknown")).toMatch(/unknown/i);
  });

  it("maps provider DTO without inventing Live on degraded", () => {
    const row = mapProviderHealthDto(
      adminProviderHealthDtoSchema.parse(sampleProvider),
    );
    expect(row.statusKind).toBe("degraded");
    expect(row.statusLabel).toBe("Degraded");
    expect(row.latencyLabel).toBe("400ms");
  });

  it("maps components and prefers them over inventing healthy peers", () => {
    const components = sampleComponents.map((c) =>
      mapComponentHealthDto(adminComponentHealthDtoSchema.parse(c)),
    );
    expect(components.map((c) => c.statusKind)).toEqual([
      "ok",
      "degraded",
      "down",
      "unknown",
    ]);
    const providers = [
      mapProviderHealthDto(adminProviderHealthDtoSchema.parse(sampleProvider)),
    ];
    expect(composeProviderRows(components, providers)).toHaveLength(4);
    expect(composeProviderRows([], providers)).toHaveLength(1);
  });
});

describe("ADM-370 emergency mapping", () => {
  it("returns exactly three approved switches in stable order", () => {
    const list = mapEmergencyControlList([
      adminEmergencyControlDtoSchema.parse(sampleEmergency),
      adminEmergencyControlDtoSchema.parse({
        switchName: "MAINTENANCE",
        enabled: true,
        version: 1,
      }),
    ]);
    expect(list).toHaveLength(3);
    expect(list.map((c) => c.switchName)).toEqual([...EMERGENCY_SWITCH_NAMES]);
    const qris = list.find((c) => c.switchName === "QRIS_CHECKOUT");
    expect(qris?.version).toBe(3);
    expect(qris?.enabled).toBe(true);
    // Missing BE rows are not fake-enabled
    const reg = list.find((c) => c.switchName === "SELLER_REGISTRATION");
    expect(reg?.enabled).toBe(false);
    expect(reg?.version).toBe(0);
  });

  it("maps system snapshot overall from component health", () => {
    const snap = mapSystemSnapshotDto({
      emergencyControls: [sampleEmergency],
      feePolicyVersion: "LAUNCH_FEE_POLICY_V1",
      componentHealth: sampleComponents,
      note: "n",
    });
    expect(snap.overallKind).toBe("down");
    expect(snap.overallLabel).toMatch(/unavailable/i);
    expect(snap.emergencyControls).toHaveLength(3);
  });
});

describe("ADM-370 fee mappers", () => {
  it("maps fee policy bps to percent display fields", () => {
    const view = mapFeePolicyDto({
      policyVersion: "LAUNCH_FEE_POLICY_V1",
      scope: "GLOBAL",
      transactionPercentBps: 300,
      transactionFixedIdr: 700,
      withdrawalPercentBps: 300,
      minimumWithdrawalIdr: 50_000,
      immutable: true,
      currency: "IDR",
      adminMutationAllowed: false,
    });
    expect(view.transactionPercent).toBe(3);
    expect(view.adminMutationAllowed).toBe(false);
  });

  it("maps fee preview without inventing totals", () => {
    const view = mapFeePreviewDto({
      policyVersion: "LAUNCH_FEE_POLICY_V1",
      kind: "withdrawal",
      amount: 40_000,
      platformFee: 1200,
      minimumAmount: 50_000,
    });
    expect(view.kind).toBe("withdrawal");
    expect(view.processingFee).toBeNull();
    expect(view.totalFee).toBeNull();
    expect(view.belowMinimum).toBe(true);
  });
});

describe("ADM-370 API adapters", () => {
  it("mock domain returns fixtures without transport", async () => {
    installMockAdmin();
    const snap = await getAdminSystemSnapshot();
    expect(snap.emergencyControls).toHaveLength(3);
    expect(apiRequestMock).not.toHaveBeenCalled();
    const fees = await getAdminSystemFees();
    expect(fees.policyVersion).toBe("LAUNCH_FEE_POLICY_V1");
  });

  it("api mode loads system + providers compose", async () => {
    installApiAdmin();
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/v1/admin/system") {
        return {
          data: {
            emergencyControls: [
              sampleEmergency,
              {
                switchName: "SELLER_REGISTRATION",
                enabled: true,
                version: 1,
              },
              { switchName: "WITHDRAWALS", enabled: true, version: 2 },
            ],
            feePolicyVersion: "LAUNCH_FEE_POLICY_V1",
            componentHealth: sampleComponents,
            note: "note",
          },
          meta,
        };
      }
      if (path === "/v1/admin/providers") {
        return {
          data: { items: [sampleProvider] },
          meta,
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    const infra = await listAdminProviderInfrastructure();
    expect(infra.rows).toHaveLength(4);
    expect(infra.overallKind).toBe("down");
    expect(infra.systemError).toBeNull();
    expect(infra.emergencyControls).toHaveLength(3);

    const providers = await listAdminProviders();
    expect(providers[0]?.statusKind).toBe("degraded");
  });

  it("api mode partial system failure still returns provider rows", async () => {
    installApiAdmin();
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/v1/admin/system") {
        throw new Error("system down");
      }
      if (path === "/v1/admin/providers") {
        return {
          data: { items: [sampleProvider] },
          meta,
        };
      }
      if (path === "/v1/admin/system/emergency-controls") {
        return {
          data: {
            items: [
              sampleEmergency,
              {
                switchName: "SELLER_REGISTRATION",
                enabled: true,
                version: 1,
              },
              { switchName: "WITHDRAWALS", enabled: true, version: 1 },
            ],
          },
          meta,
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    const infra = await listAdminProviderInfrastructure();
    expect(infra.systemError).toMatch(/system down/i);
    expect(infra.rows).toHaveLength(1);
    expect(infra.rows[0]?.statusLabel).toBe("Degraded");
  });

  it("list emergency controls uses items envelope", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        items: [
          sampleEmergency,
          { switchName: "SELLER_REGISTRATION", enabled: true, version: 1 },
          { switchName: "WITHDRAWALS", enabled: false, version: 4 },
        ],
      },
      meta,
    });
    const list = await listAdminEmergencyControls();
    expect(list.find((c) => c.switchName === "WITHDRAWALS")?.enabled).toBe(
      false,
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/system/emergency-controls",
      expect.objectContaining({
        schema: adminEmergencyControlListEnvelopeSchema,
      }),
    );
  });

  it("set emergency requires reason length, MFA, version, idempotency", async () => {
    installApiAdmin();
    await expect(
      setAdminEmergencyControl({
        switchName: "QRIS_CHECKOUT",
        enabled: false,
        reason: "short",
        expectedVersion: 3,
      }),
    ).rejects.toThrow(/12 characters/);

    await expect(
      setAdminEmergencyControl({
        switchName: "QRIS_CHECKOUT",
        enabled: false,
        reason: "incident drill long enough",
        expectedVersion: 0,
      }),
    ).rejects.toThrow(/expectedVersion/);

    apiRequestMock.mockResolvedValueOnce({
      data: {
        ...sampleEmergency,
        enabled: false,
        version: 4,
        reason: "incident drill long enough",
      },
      meta,
    });

    const result = await setAdminEmergencyControl({
      switchName: "QRIS_CHECKOUT",
      enabled: false,
      reason: "incident drill long enough",
      incidentTicket: "INC-99",
      expectedVersion: 3,
      idempotencyKey: "idem_emg_1",
    });
    expect(result.control.enabled).toBe(false);
    expect(result.control.version).toBe(4);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/system/emergency-controls",
      expect.objectContaining({
        method: "POST",
        requireRecentMfa: true,
        idempotencyKey: "idem_emg_1",
        auditReason: "incident drill long enough",
        ifMatch: "3",
        body: expect.objectContaining({
          switchName: "QRIS_CHECKOUT",
          enabled: false,
          expectedVersion: 3,
          incidentTicket: "INC-99",
        }),
      }),
    );
  });

  it("set emergency surfaces version conflict", async () => {
    installApiAdmin();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(409, {
        code: PROBLEM_CODES.CONFLICT,
        message: "Emergency control version conflict",
        requestId: "req_conflict",
      }),
    );
    await expect(
      setAdminEmergencyControl({
        switchName: "QRIS_CHECKOUT",
        enabled: false,
        reason: "incident drill long enough",
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ status: 409, code: PROBLEM_CODES.CONFLICT });
  });

  it("mock write rejects version conflict without fake success", async () => {
    installMockAdmin();
    await expect(
      setAdminEmergencyControl({
        switchName: "QRIS_CHECKOUT",
        enabled: false,
        reason: "incident drill long enough",
        expectedVersion: 99,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("get fees + pure preview never publish", async () => {
    installApiAdmin();
    apiRequestMock
      .mockResolvedValueOnce({
        data: {
          policyVersion: "LAUNCH_FEE_POLICY_V1",
          scope: "GLOBAL",
          transactionPercentBps: 300,
          transactionFixedIdr: 700,
          withdrawalPercentBps: 300,
          minimumWithdrawalIdr: 50_000,
          immutable: true,
          currency: "IDR",
          adminMutationAllowed: false,
        },
        meta,
      })
      .mockResolvedValueOnce({
        data: {
          policyVersion: "LAUNCH_FEE_POLICY_V1",
          kind: "transaction",
          amount: 100_000,
          platformFee: 3000,
          processingFee: 700,
          totalFee: 3700,
          netAmount: 96_300,
        },
        meta,
      });

    const fees = await getAdminSystemFees();
    expect(fees.transactionFixedIdr).toBe(700);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/system/fees",
      expect.objectContaining({ schema: feePolicyEnvelopeSchema }),
    );

    const preview = await previewAdminSystemFees({
      kind: "transaction",
      amount: 100_000,
    });
    expect(preview.totalFee).toBe(3700);
    expect(apiRequestMock).toHaveBeenLastCalledWith(
      "/v1/admin/system/fees/preview",
      expect.objectContaining({
        method: "POST",
        schema: adminFeePreviewEnvelopeSchema,
      }),
    );
  });

  it("mock fee preview uses pure local math", async () => {
    installMockAdmin();
    const preview = await previewAdminSystemFees({
      kind: "transaction",
      amount: 100_000,
    });
    expect(preview.platformFee).toBe(3000);
    expect(preview.processingFee).toBe(700);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

describe("ADM-370 permissions + query keys", () => {
  it("uses platform.emergency and payments.read / fees.preview", () => {
    expect(ADMIN_ACTION_PERMISSIONS.platformEmergency).toBe(
      "platform.emergency",
    );
    expect(ADMIN_ACTION_PERMISSIONS.platformFeesPreview).toBe(
      "platform.fees.preview",
    );
    expect(claimsHavePermission(["payments.read"], "payments.read")).toBe(true);
    expect(claimsHavePermission(["webhooks.read"], "platform.emergency")).toBe(
      false,
    );
  });

  it("query keys are stable and separated", () => {
    expect(queryKeys.admin.providers()).toEqual(["admin", "providers"]);
    expect(queryKeys.admin.system()).toEqual(["admin", "system"]);
    expect(queryKeys.admin.emergencyControls()).toEqual([
      "admin",
      "emergency-controls",
    ]);
    expect(queryKeys.admin.systemFees()).toEqual(["admin", "system", "fees"]);
  });

  it("provider list envelope shape", () => {
    const parsed = adminProviderHealthListEnvelopeSchema.parse({
      data: { items: [sampleProvider] },
      meta,
    });
    expect(parsed.data.items).toHaveLength(1);
  });
});
