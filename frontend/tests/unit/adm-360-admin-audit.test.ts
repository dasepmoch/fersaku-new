import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminAuditEventDtoSchema,
  adminAuditExportDtoSchema,
  adminAuditIntegrityDtoSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  createAuditExport,
  getAuditEvent,
  getAuditIntegrity,
  listAuditEvents,
} from "@/features/admin/data";
import {
  mapAdminAuditEventDto,
  mapAdminAuditExportDto,
  mapAdminAuditIntegrityDto,
  normalizeAdminAuditSearchFilters,
} from "@/features/admin/data/mappers";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";
import { queryKeys } from "@/shared/query/query-keys";

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

const beWireEvent = {
  id: "ae_01LIVE",
  sequenceNo: 42,
  payloadHash: "abc123deadbeef",
  createdAt: "2026-07-17T10:00:00Z",
  actorUserId: "usr_admin_1",
  action: "merchants.status.update",
  resourceType: "merchant",
  resourceId: "m_1",
  reason: "Policy review completed",
  requestId: "req_abc",
  merchantId: "m_1",
  metadata: {
    result: "Success",
    ip: "10.0.0.8",
    actorEmail: "ops@fersaku.id",
  },
};

describe("ADM-360 admin audit search/detail/integrity/export", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps BE wire fields to display contract without inventing hashes", () => {
    const dto = adminAuditEventDtoSchema.parse(beWireEvent);
    const view = mapAdminAuditEventDto(dto);
    expect(view.id).toBe("ae_01LIVE");
    expect(view.actor).toBe("ops@fersaku.id");
    expect(view.action).toBe("merchants.status.update");
    expect(view.target).toBe("merchant:m_1");
    expect(view.ip).toBe("10.0.0.8");
    expect(view.result).toBe("Success");
    expect(view.time).toBe("2026-07-17T10:00:00Z");
    expect(view.context).toBe("Policy review completed");
    expect(view.integrityHash).toBe("abc123deadbeef");
    expect(view.previousHash).toBeUndefined();
    expect(view.requestId).toBe("req_abc");
    expect(view.sequenceNo).toBe(42);
  });

  it("does not fabricate previousHash/integrityHash when BE omits them", () => {
    const dto = adminAuditEventDtoSchema.parse({
      id: "ae_nohash",
      action: "login",
      createdAt: "2026-07-17T11:00:00Z",
    });
    const view = mapAdminAuditEventDto(dto);
    expect(view.previousHash).toBeUndefined();
    expect(view.integrityHash).toBeUndefined();
    expect(view.ip).toBe("—");
    expect(view.result).toBe("—");
  });

  it("maps integrity OK vs AUDIT_CHAIN_BROKEN from server status only", () => {
    const ok = mapAdminAuditIntegrityDto(
      adminAuditIntegrityDtoSchema.parse({
        eventCount: 10,
        headSequence: 10,
        minSequence: 1,
        headPayloadHash: "ff00",
        chainMode: "JCS-1",
        verifierStatus: "OK",
      }),
    );
    expect(ok.chainValid).toBe(true);
    expect(ok.chainMode).toBe("JCS-1");

    const broken = mapAdminAuditIntegrityDto(
      adminAuditIntegrityDtoSchema.parse({
        eventCount: 10,
        headSequence: 10,
        minSequence: 1,
        chainMode: "JCS-1",
        verifierStatus: "AUDIT_CHAIN_BROKEN",
      }),
    );
    expect(broken.chainValid).toBe(false);
    expect(broken.verifierStatus).toBe("AUDIT_CHAIN_BROKEN");
  });

  it("maps export job handle without inventing downloadUrl", () => {
    const job = mapAdminAuditExportDto(
      adminAuditExportDtoSchema.parse({
        id: "aex_1",
        status: "COMPLETE",
        redactionPolicy: "LAUNCH_AUDIT_REDACTION_V1",
        reason: "Compliance review export",
        rowCount: 12,
        createdAt: "2026-07-17T12:00:00Z",
      }),
    );
    expect(job.id).toBe("aex_1");
    expect(job.status).toBe("COMPLETE");
    expect(job.downloadUrl).toBeUndefined();
    expect(job.rowCount).toBe(12);
  });

  it("normalizes audit search filters and clamps limit", () => {
    expect(
      normalizeAdminAuditSearchFilters({
        action: "  merchants.write  ",
        limit: 500,
        actorUserId: "  ",
      }),
    ).toEqual({ action: "merchants.write", limit: 100 });
  });

  it("permission gate: audit.read required; unknown audit.export denied", () => {
    expect(claimsHavePermission(["audit.read"], "audit.read")).toBe(true);
    expect(claimsHavePermission(["*"], "audit.read")).toBe(true);
    expect(claimsHavePermission(["merchants.read"], "audit.read")).toBe(false);
    expect(claimsHavePermission(["*"], "audit.export")).toBe(false);
  });

  it("mock path never hits transport for list/detail/integrity", async () => {
    installMockAdmin();
    const list = await listAuditEvents();
    expect(list.length).toBeGreaterThan(0);
    expect(apiRequestMock).not.toHaveBeenCalled();

    const first = list[0]!;
    const detail = await getAuditEvent(first.id);
    expect(detail.id).toBe(first.id);
    expect(apiRequestMock).not.toHaveBeenCalled();

    const integrity = await getAuditIntegrity();
    expect(integrity.chainMode).toContain("mock");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("API list uses items envelope + schema mapper", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { items: [beWireEvent] },
      meta: { requestId: "r1", timestamp: "2026-07-17T10:00:00Z" },
    });
    const rows = await listAuditEvents({ action: "merchants.status.update" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.integrityHash).toBe("abc123deadbeef");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/audit-logs",
      expect.objectContaining({
        query: expect.objectContaining({
          action: "merchants.status.update",
          limit: 50,
        }),
      }),
    );
  });

  it("API detail and integrity call typed endpoints", async () => {
    installApiAdmin();
    apiRequestMock
      .mockResolvedValueOnce({
        data: beWireEvent,
        meta: { requestId: "r2", timestamp: "2026-07-17T10:00:00Z" },
      })
      .mockResolvedValueOnce({
        data: {
          eventCount: 1,
          headSequence: 42,
          minSequence: 1,
          headPayloadHash: "abc123deadbeef",
          chainMode: "JCS-1",
          verifierStatus: "OK",
        },
        meta: { requestId: "r3", timestamp: "2026-07-17T10:00:00Z" },
      });

    const detail = await getAuditEvent("ae_01LIVE");
    expect(detail.action).toBe("merchants.status.update");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/audit-logs/ae_01LIVE",
    );

    const integrity = await getAuditIntegrity();
    expect(integrity.chainValid).toBe(true);
    expect(apiRequestMock.mock.calls[1]![0]).toBe("/v1/admin/audit-integrity");
  });

  it("API export posts reason and does not require client CSV", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        id: "aex_live",
        status: "COMPLETE",
        redactionPolicy: "LAUNCH_AUDIT_REDACTION_V1",
        reason: "Admin console audit trail export request",
        rowCount: 3,
        createdAt: "2026-07-17T12:00:00Z",
      },
      meta: { requestId: "r4", timestamp: "2026-07-17T12:00:00Z" },
    });
    const job = await createAuditExport({
      reason: "Admin console audit trail export request",
      filter: { action: "login" },
    });
    expect(job.id).toBe("aex_live");
    expect(job.downloadUrl).toBeUndefined();
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/audit-exports",
      expect.objectContaining({
        method: "POST",
        auditReason: "Admin console audit trail export request",
        body: expect.objectContaining({
          reason: "Admin console audit trail export request",
        }),
      }),
    );
  });

  it("appendClientAuditEvent is no-op on API path", () => {
    installApiAdmin();
    expect(() =>
      appendClientAuditEvent({
        actor: "x",
        action: "audit.event.inspect",
        target: "ae_1",
        ip: "1.1.1.1",
        result: "Success",
      }),
    ).not.toThrow();
  });

  it("query keys include bounded filters and detail/integrity segments", () => {
    expect(queryKeys.admin.auditLogs({ limit: 50, action: "login" })).toEqual([
      "admin",
      "audit-logs",
      "bounded",
      { limit: 50, action: "login" },
    ]);
    expect(queryKeys.admin.auditLog("ae_1")).toEqual([
      "admin",
      "audit-logs",
      "detail",
      "ae_1",
    ]);
    expect(queryKeys.admin.auditIntegrity()).toEqual([
      "admin",
      "audit-integrity",
    ]);
  });
});
