/**
 * ADM-340 — admin KYC DTO → existing queue/dialog view models.
 * Never map storage keys, presigned URLs, or decrypted content into list/query models.
 */

import type {
  AdminKycCaseDto,
  AdminKycDocumentDto,
  AdminKycTransitionRequest,
} from "@/shared/api/schemas";
import {
  canTransitionKyc,
  type ApiKycApplicant,
  type KycStatus,
} from "./data";

/** BE wire status → existing board column labels. */
const WIRE_TO_UI: Record<string, KycStatus> = {
  SUBMITTED: "Submitted",
  IN_REVIEW: "Submitted",
  VENDOR_CHECK: "Vendor check",
  NEEDS_CLARIFICATION: "Needs clarification",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  // Terminal / non-board statuses not shown as active columns stay mapped.
  EXPIRED: "Rejected",
  DRAFT: "Submitted",
};

/** UI board status → admin transition action. */
const UI_TO_ACTION: Partial<
  Record<KycStatus, AdminKycTransitionRequest["action"]>
> = {
  "Vendor check": "VENDOR_CHECK",
  "Needs clarification": "NEEDS_CLARIFICATION",
  Approved: "APPROVE",
  Rejected: "REJECT",
  // "Submitted" is not a transition target from UI controls
};

const DOC_TYPE_LABEL: Record<string, string> = {
  ID_FRONT: "KTP",
  ID_BACK: "KTP back",
  SELFIE: "Selfie",
  BUSINESS_LICENSE: "NIB",
  TAX_ID: "NPWP",
  OTHER: "Other",
};

export function mapAdminKycStatusToUi(status: string): KycStatus {
  return WIRE_TO_UI[status.toUpperCase()] ?? "Submitted";
}

export function mapUiKycStatusToAction(
  status: KycStatus,
): AdminKycTransitionRequest["action"] | null {
  return UI_TO_ACTION[status] ?? null;
}

export function mapDocumentTypeLabel(documentType: string | undefined): string {
  if (!documentType) return "Doc";
  return DOC_TYPE_LABEL[documentType.toUpperCase()] ?? documentType;
}

export function mapAdminKycDocumentMeta(dto: AdminKycDocumentDto): {
  id: string;
  type: string;
  label: string;
  status: string;
  contentType?: string;
  sizeBytes?: number;
  scanStatus?: string;
} {
  const type = dto.documentType ?? dto.type ?? "OTHER";
  return {
    id: dto.id,
    type,
    label: mapDocumentTypeLabel(type),
    status: dto.status ?? "UNKNOWN",
    contentType: dto.contentType,
    sizeBytes: dto.sizeBytes,
    scanStatus: dto.scanStatus,
  };
}

function relativeSubmittedLabel(
  submittedAt: string | null | undefined,
  ageMinutes: number | undefined,
): string {
  if (typeof ageMinutes === "number" && Number.isFinite(ageMinutes)) {
    if (ageMinutes < 60) return `${ageMinutes}m ago`;
    const hours = Math.floor(ageMinutes / 60);
    return `${hours}h ago`;
  }
  if (!submittedAt) return "—";
  const t = Date.parse(submittedAt);
  if (Number.isNaN(t)) return submittedAt;
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function deriveAgeMinutes(dto: AdminKycCaseDto): number {
  if (typeof dto.ageMinutes === "number" && Number.isFinite(dto.ageMinutes)) {
    return Math.max(0, Math.floor(dto.ageMinutes));
  }
  if (
    typeof dto.queueAgeSeconds === "number" &&
    Number.isFinite(dto.queueAgeSeconds)
  ) {
    return Math.max(0, Math.floor(dto.queueAgeSeconds / 60));
  }
  if (dto.submittedAt) {
    const t = Date.parse(dto.submittedAt);
    if (!Number.isNaN(t)) {
      return Math.max(0, Math.floor((Date.now() - t) / 60_000));
    }
  }
  return 0;
}

/**
 * Map queue/detail case to existing kanban card shape.
 * Risk is not invented from server when absent — show Low as neutral board default.
 */
export function mapAdminKycCaseDto(dto: AdminKycCaseDto): ApiKycApplicant {
  const ageMinutes = deriveAgeMinutes(dto);
  const docs = (dto.documents ?? []).map((d) =>
    mapDocumentTypeLabel(d.documentType ?? d.type),
  );
  const rejectionReason =
    dto.rejectionReason?.trim() ||
    dto.clarificationReason?.trim() ||
    dto.reason?.trim() ||
    undefined;

  return {
    id: dto.id,
    store: dto.businessName?.trim() || dto.legalName?.trim() || dto.id,
    owner: dto.legalName?.trim() || "—",
    application: dto.id,
    environment: "Live",
    submitted: relativeSubmittedLabel(dto.submittedAt, ageMinutes),
    risk: "Low",
    docs: docs.length > 0 ? docs : ["Pending docs"],
    status: mapAdminKycStatusToUi(dto.status),
    usage: dto.capability?.trim() || "Live QRIS API",
    ageMinutes,
    rejectionReason,
    merchantId: dto.merchantId,
    wireStatus: dto.status,
    version: dto.version,
    documentMeta: (dto.documents ?? []).map(mapAdminKycDocumentMeta),
  };
}

export function mapAdminKycListDto(
  data: AdminKycCaseDto[] | { items: AdminKycCaseDto[] },
): ApiKycApplicant[] {
  const items = Array.isArray(data) ? data : data.items;
  return items.map(mapAdminKycCaseDto);
}

/** Whether UI transition target is allowed from current wire/UI status. */
export function canTransitionKycUi(from: KycStatus, to: KycStatus): boolean {
  return canTransitionKyc(from, to);
}

export function toAdminKycTransitionBody(
  targetUi: KycStatus,
  reason: string,
): AdminKycTransitionRequest {
  const action = mapUiKycStatusToAction(targetUi);
  if (!action) {
    throw new Error(`Unsupported KYC transition target: ${targetUi}`);
  }
  const body: AdminKycTransitionRequest = { action };
  const trimmed = reason.trim();
  if (trimmed) body.reason = trimmed;
  return body;
}
