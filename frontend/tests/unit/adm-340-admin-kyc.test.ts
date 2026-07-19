import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminKycCaseDtoSchema,
  adminKycDocumentDtoSchema,
  adminKycListEnvelopeSchema,
  adminKycTransitionRequestSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  getAdminKycCase,
  listAdminKycCases,
  revokeAdminKycDocumentView,
  transitionAdminKyc,
  viewAdminKycDocument,
} from "@/features/admin/operations/kyc/api";
import {
  mapAdminKycCaseDto,
  mapAdminKycStatusToUi,
  mapUiKycStatusToAction,
  toAdminKycTransitionBody,
} from "@/features/admin/operations/kyc/mappers";
import { canTransitionKyc } from "@/features/admin/operations/kyc/data";
import { queryKeys } from "@/shared/query/query-keys";

const apiRequestMock = vi.hoisted(() => vi.fn());
const apiBinaryRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/api/http-client")
  >("@/shared/api/http-client");
  return {
    ...actual,
    apiRequest: apiRequestMock,
    apiBinaryRequest: apiBinaryRequestMock,
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
  requestId: "req_adm340",
  timestamp: "2026-07-17T12:00:00Z",
};

const sampleCase = {
  id: "kyc_case_1",
  merchantId: "mrc_1",
  status: "SUBMITTED",
  legalName: "Raka Pratama",
  businessName: "Studio Reka",
  capability: "QRIS_API_LIVE",
  ageMinutes: 8,
  submittedAt: "2026-07-17T11:52:00Z",
  documents: [
    {
      id: "kyd_1",
      documentType: "ID_FRONT",
      status: "READY",
      contentType: "image/jpeg",
      sizeBytes: 1200,
      uploadMode: "SERVER_MEDIATED",
    },
    {
      id: "kyd_2",
      documentType: "SELFIE",
      status: "READY",
      contentType: "image/jpeg",
    },
  ],
};

describe("ADM-340 admin KYC review", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiBinaryRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps wire status to existing board columns", () => {
    expect(mapAdminKycStatusToUi("SUBMITTED")).toBe("Submitted");
    expect(mapAdminKycStatusToUi("IN_REVIEW")).toBe("Submitted");
    expect(mapAdminKycStatusToUi("VENDOR_CHECK")).toBe("Vendor check");
    expect(mapAdminKycStatusToUi("NEEDS_CLARIFICATION")).toBe(
      "Needs clarification",
    );
    expect(mapAdminKycStatusToUi("APPROVED")).toBe("Approved");
    expect(mapAdminKycStatusToUi("REJECTED")).toBe("Rejected");
    expect(mapUiKycStatusToAction("Approved")).toBe("APPROVE");
    expect(mapUiKycStatusToAction("Rejected")).toBe("REJECT");
    expect(mapUiKycStatusToAction("Vendor check")).toBe("VENDOR_CHECK");
    expect(mapUiKycStatusToAction("Needs clarification")).toBe(
      "NEEDS_CLARIFICATION",
    );
  });

  it("preserves client transition allowlist for UI chrome", () => {
    expect(canTransitionKyc("Submitted", "Vendor check")).toBe(true);
    expect(canTransitionKyc("Vendor check", "Approved")).toBe(true);
    expect(canTransitionKyc("Approved", "Rejected")).toBe(false);
  });

  it("accepts case/document schemas without storage URLs", () => {
    expect(adminKycCaseDtoSchema.parse(sampleCase).id).toBe("kyc_case_1");
    expect(() =>
      adminKycDocumentDtoSchema.parse({
        id: "kyd_x",
        documentType: "ID_FRONT",
        storageKey: "private-kyc/secret",
      }),
    ).toThrow();
    expect(() =>
      adminKycDocumentDtoSchema.parse({
        id: "kyd_x",
        downloadUrl: "https://r2.example/x",
      }),
    ).toThrow();
  });

  it("builds transition body from UI status", () => {
    expect(
      adminKycTransitionRequestSchema.parse(
        toAdminKycTransitionBody("Approved", "Enable after full review pass"),
      ),
    ).toEqual({
      action: "APPROVE",
      reason: "Enable after full review pass",
    });
    expect(
      toAdminKycTransitionBody("Rejected", "KTP name mismatch documented"),
    ).toEqual({
      action: "REJECT",
      reason: "KTP name mismatch documented",
    });
  });

  it("maps list DTO to kanban applicant without inventing risk", () => {
    const row = mapAdminKycCaseDto(sampleCase);
    expect(row.id).toBe("kyc_case_1");
    expect(row.store).toBe("Studio Reka");
    expect(row.owner).toBe("Raka Pratama");
    expect(row.status).toBe("Submitted");
    expect(row.docs).toEqual(["KTP", "Selfie"]);
    expect(row.documentMeta?.[0]?.id).toBe("kyd_1");
    expect(row.environment).toBe("Live");
  });

  it("permission: kyc.review required; not confused with merchants.write", () => {
    expect(claimsHavePermission(["kyc.review"], "kyc.review")).toBe(true);
    expect(claimsHavePermission(["merchants.write"], "kyc.review")).toBe(false);
    expect(claimsHavePermission(["reviews.moderate"], "kyc.review")).toBe(
      false,
    );
  });

  it("query keys never include document content or secrets", () => {
    const listKey = queryKeys.admin.kyc({ age: "30m", limit: 50 });
    const caseKey = queryKeys.admin.kycCase("kyc_case_1");
    expect(listKey).toEqual([
      "admin",
      "kyc",
      "bounded",
      { age: "30m", limit: 50 },
    ]);
    expect(caseKey).toEqual(["admin", "kyc", "case", "kyc_case_1"]);
    const flat = JSON.stringify([listKey, caseKey]);
    expect(flat).not.toMatch(/blob|objectUrl|plaintext|storageKey|apiKey/i);
  });

  it("mock path: list/detail/transition without network", async () => {
    installMockAdmin();
    const list = await listAdminKycCases({ age: "all" });
    expect(list.length).toBeGreaterThan(0);
    expect(apiRequestMock).not.toHaveBeenCalled();

    const detail = await getAdminKycCase(list[0]!.id);
    expect(detail?.id).toBe(list[0]!.id);
    expect(apiRequestMock).not.toHaveBeenCalled();

    const moved = await transitionAdminKyc({
      caseId: list[0]!.id,
      status: "Needs clarification",
      reason: "Please re-upload clearer identity document",
    });
    expect(moved.case.status).toBe("Needs clarification");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("API list path maps items envelope", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { items: [sampleCase] },
      meta,
    });
    const list = await listAdminKycCases({ age: "30m", limit: 50 });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/kyc",
      expect.objectContaining({
        query: expect.objectContaining({ age: "30m", limit: 50 }),
      }),
    );
    expect(list[0]?.store).toBe("Studio Reka");
  });

  it("API detail path", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: sampleCase,
      meta,
    });
    const detail = await getAdminKycCase("kyc_case_1");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/kyc/kyc_case_1",
      expect.any(Object),
    );
    expect(detail?.status).toBe("Submitted");
  });

  it("API transition sends action+reason+idempotency", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...sampleCase, status: "APPROVED" },
      meta,
    });
    const result = await transitionAdminKyc({
      caseId: "kyc_case_1",
      status: "Approved",
      reason: "Full document set verified for live API",
      idempotencyKey: "idem_kyc_1",
    });
    expect(result.case.status).toBe("Approved");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/kyc/kyc_case_1/transition",
      expect.objectContaining({
        method: "POST",
        body: {
          action: "APPROVE",
          reason: "Full document set verified for live API",
        },
        idempotencyKey: "idem_kyc_1",
        auditReason: "Full document set verified for live API",
        requireRecentMfa: true,
      }),
    );
  });

  it("rejects short transition reason", async () => {
    installApiAdmin();
    await expect(
      transitionAdminKyc({
        caseId: "kyc_case_1",
        status: "Rejected",
        reason: "too short",
      }),
    ).rejects.toThrow(/12 characters/);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("document view uses binary stream + MFA; never caches bytes in list schema", async () => {
    installApiAdmin();
    const png = new Blob([new Uint8Array([0x89, 0x50])], {
      type: "image/png",
    });
    apiBinaryRequestMock.mockResolvedValueOnce({
      blob: png,
      contentType: "image/png",
      documentId: "kyd_1",
      documentType: "ID_FRONT",
      requestId: "req_doc",
    });

    const view = await viewAdminKycDocument({
      caseId: "kyc_case_1",
      documentId: "kyd_1",
      reason: "Review identity front for live API approval",
    });
    expect(apiBinaryRequestMock).toHaveBeenCalledWith(
      "/v1/admin/kyc/kyc_case_1/documents/kyd_1/content",
      expect.objectContaining({
        method: "GET",
        requireRecentMfa: true,
        auditReason: "Review identity front for live API approval",
        cache: "no-store",
      }),
    );
    expect(view.objectUrl.startsWith("blob:")).toBe(true);
    expect(view.documentId).toBe("kyd_1");
    revokeAdminKycDocumentView(view);

    // list schema still rejects storage URLs
    const listParsed = adminKycListEnvelopeSchema.parse({
      data: { items: [sampleCase] },
      meta,
    });
    expect(JSON.stringify(listParsed)).not.toMatch(/storageKey|downloadUrl/);
  });

  it("mock document view returns object URL without network", async () => {
    installMockAdmin();
    const view = await viewAdminKycDocument({
      caseId: "API-2198",
      documentId: "mock_doc",
      reason: "Mock review of identity document set",
    });
    expect(apiBinaryRequestMock).not.toHaveBeenCalled();
    expect(view.objectUrl).toBeTruthy();
    revokeAdminKycDocumentView(view);
  });
});
