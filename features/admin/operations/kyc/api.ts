/**
 * ADM-340 — admin KYC list/detail/transition + server-decrypted document access.
 * Domain: adminRead (list/detail), adminWrite (transition/content).
 * Decrypted bytes never enter React Query / storage / logs.
 */

import type { z } from "zod";
import {
  apiBinaryRequest,
  apiRequest,
} from "@/shared/api/http-client";
import {
  adminKycCaseEnvelopeSchema,
  adminKycListEnvelopeSchema,
  adminKycTransitionEnvelopeSchema,
  adminKycTransitionRequestSchema,
  type AdminKycTransitionRequest,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import type { ApiKycApplicant, KycStatus } from "./data";
import {
  mapAdminKycCaseDto,
  mapAdminKycListDto,
  toAdminKycTransitionBody,
} from "./mappers";
import { demoAdminKycCase, demoAdminKycQueue } from "./mock";

type ListEnvelope = z.infer<typeof adminKycListEnvelopeSchema>;
type CaseEnvelope = z.infer<typeof adminKycCaseEnvelopeSchema>;
type TransitionEnvelope = z.infer<typeof adminKycTransitionEnvelopeSchema>;

/** Bounded first-result default for board without TablePagination. */
export const ADMIN_KYC_QUEUE_LIMIT = 50;

export type AdminKycListFilters = {
  status?: string;
  age?: "all" | "30m" | "2h";
  limit?: number;
};

export type TransitionAdminKycInput = {
  caseId: string;
  /** UI column status (Approved, Rejected, …). */
  status: KycStatus;
  reason: string;
  idempotencyKey?: string;
  mfaCode?: string;
  recentMfaProof?: string;
};

export type TransitionAdminKycResult = {
  case: ApiKycApplicant;
  requestId: string;
};

export type ViewAdminKycDocumentInput = {
  caseId: string;
  documentId: string;
  reason: string;
  recentMfaProof?: string;
};

export type AdminKycDocumentView = {
  blob: Blob;
  contentType: string;
  documentId: string;
  documentType?: string;
  objectUrl: string;
  requestId: string;
};

export function isAdminKycApiDomain(): boolean {
  return getDomainSource("adminRead") === "api";
}

export function isAdminKycWriteApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

export async function listAdminKycCases(
  filters: AdminKycListFilters = {},
  signal?: AbortSignal,
): Promise<ApiKycApplicant[]> {
  if (shouldUseMockFixtures("adminRead")) {
    let rows = demoAdminKycQueue();
    if (filters.age === "30m") {
      rows = rows.filter((r) => r.ageMinutes >= 30);
    } else if (filters.age === "2h") {
      rows = rows.filter((r) => r.ageMinutes >= 120);
    }
    const limit = Math.min(
      100,
      Math.max(1, filters.limit ?? ADMIN_KYC_QUEUE_LIMIT),
    );
    return rows.slice(0, limit);
  }

  const query: Record<string, string | number | undefined> = {
    limit: filters.limit ?? ADMIN_KYC_QUEUE_LIMIT,
  };
  if (filters.status?.trim()) query.status = filters.status.trim();
  if (filters.age && filters.age !== "all") query.age = filters.age;

  const response = await apiRequest<ListEnvelope>("/v1/admin/kyc", {
    schema: adminKycListEnvelopeSchema,
    query,
    signal,
  });
  return mapAdminKycListDto(response.data);
}

export async function getAdminKycCase(
  caseId: string,
  signal?: AbortSignal,
): Promise<ApiKycApplicant | null> {
  const id = caseId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("adminRead")) {
    return demoAdminKycCase(id);
  }

  const response = await apiRequest<CaseEnvelope>(
    `/v1/admin/kyc/${encodeURIComponent(id)}`,
    {
      schema: adminKycCaseEnvelopeSchema,
      signal,
    },
  );
  return mapAdminKycCaseDto(response.data);
}

/**
 * POST /v1/admin/kyc/{caseId}/transition
 * Reason required for reject/clarify (enforced BE); FE requires ≥12 for all.
 */
export async function transitionAdminKyc(
  input: TransitionAdminKycInput,
  signal?: AbortSignal,
): Promise<TransitionAdminKycResult> {
  const caseId = input.caseId.trim();
  const reason = input.reason.trim();
  if (!caseId) throw new Error("caseId required");
  if (reason.length < 12) {
    throw new Error("A reason of at least 12 characters is required for audit");
  }

  const body = adminKycTransitionRequestSchema.parse(
    toAdminKycTransitionBody(input.status, reason),
  ) as AdminKycTransitionRequest;

  const idempotencyKey = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const existing = demoAdminKycCase(caseId) ?? demoAdminKycQueue()[0]!;
    return {
      case: {
        ...existing,
        id: caseId,
        status: input.status,
        rejectionReason:
          input.status === "Rejected" ||
          input.status === "Needs clarification"
            ? reason
            : undefined,
      },
      requestId: `mock_kyc_transition_${caseId}`,
    };
  }

  const response = await apiRequest<
    TransitionEnvelope,
    AdminKycTransitionRequest
  >(`/v1/admin/kyc/${encodeURIComponent(caseId)}/transition`, {
    method: "POST",
    body,
    schema: adminKycTransitionEnvelopeSchema,
    signal,
    idempotencyKey,
    auditReason: reason,
    // Approve is privileged; attach recent MFA when available.
    requireRecentMfa: input.status === "Approved",
    recentMfaProof: input.recentMfaProof,
  });

  return {
    case: mapAdminKycCaseDto(response.data),
    requestId: response.meta.requestId,
  };
}

/**
 * GET server-decrypt stream. Blob + object URL held only by caller memory.
 * Never write to query cache / localStorage / logs.
 */
export async function viewAdminKycDocument(
  input: ViewAdminKycDocumentInput,
  signal?: AbortSignal,
): Promise<AdminKycDocumentView> {
  const caseId = input.caseId.trim();
  const documentId = input.documentId.trim();
  const reason = input.reason.trim();
  if (!caseId || !documentId) throw new Error("caseId and documentId required");
  if (reason.length < 12) {
    throw new Error("A reason of at least 12 characters is required");
  }

  if (shouldUseMockFixtures("adminWrite") || shouldUseMockFixtures("adminRead")) {
    // 1x1 transparent PNG — metadata only path for mock chrome.
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const blob = new Blob([png], { type: "image/png" });
    const objectUrl = URL.createObjectURL(blob);
    return {
      blob,
      contentType: "image/png",
      documentId,
      documentType: "MOCK",
      objectUrl,
      requestId: `mock_kyc_doc_${documentId}`,
    };
  }

  const result = await apiBinaryRequest(
    `/v1/admin/kyc/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/content`,
    {
      method: "GET",
      signal,
      auditReason: reason,
      requireRecentMfa: true,
      recentMfaProof: input.recentMfaProof,
      cache: "no-store",
    },
  );

  const objectUrl = URL.createObjectURL(result.blob);
  return {
    blob: result.blob,
    contentType: result.contentType,
    documentId: result.documentId ?? documentId,
    documentType: result.documentType,
    objectUrl,
    requestId: result.requestId,
  };
}

/** Revoke blob URL; call on unmount / TTL / visibility hidden. */
export function revokeAdminKycDocumentView(
  view: AdminKycDocumentView | null | undefined,
): void {
  if (view?.objectUrl) {
    try {
      URL.revokeObjectURL(view.objectUrl);
    } catch {
      /* ignore */
    }
  }
}
