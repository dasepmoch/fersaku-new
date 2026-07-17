/**
 * API credential / KYC DTO → existing api-keys screen view (SEL-330).
 * Raw apiKey never mapped into list/query models.
 * Separate from webhook signingSecret (SEL-320).
 */

import type {
  SellerApiCredentialClaimOfferData,
  SellerApiCredentialDto,
  SellerApiCredentialRequest,
  SellerApiCredentialSecretClaimData,
  SellerKycCaseDto,
  SellerKycCreateCaseRequest,
  SellerKycStatusDto,
} from "@/shared/api/schemas";
import type {
  ApiCredentialClaimOffer,
  CreateKycCaseInput,
  RequestApiCredentialInput,
  SellerApiCredential,
  SellerKycCase,
  SellerKycStatus,
  ApiKeyReveal,
} from "./contracts";

const CREDENTIAL_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktif",
  PENDING_CLAIM: "Menunggu claim",
  PENDING_KYC: "Menunggu KYC",
  AUTHORIZED: "Siap claim",
  SUSPENDED: "Ditangguhkan",
  REVOKED: "Dicabut",
};

const KYC_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "belum dimulai",
  DRAFT: "draft",
  SUBMITTED: "menunggu review",
  IN_REVIEW: "menunggu review",
  NEEDS_CLARIFICATION: "perlu klarifikasi",
  APPROVED: "disetujui",
  ACTIVE: "disetujui",
  REJECTED: "ditolak",
};

export function mapCredentialStatusLabel(status: string): string {
  return CREDENTIAL_STATUS_LABEL[status] ?? status;
}

export function mapKycStatusLabel(status: string): string {
  return KYC_STATUS_LABEL[status] ?? status.toLowerCase();
}

function maskDisplayValue(dto: SellerApiCredentialDto): string {
  const prefix = dto.keyPrefix?.trim();
  if (prefix) {
    if (prefix.includes("•") || prefix.includes("*")) return prefix;
    return `${prefix}••••`;
  }
  if (dto.fingerprint?.trim()) {
    return `••••${dto.fingerprint.slice(-8)}`;
  }
  return "••••••••••••••••";
}

export function mapApiCredentialDto(
  dto: SellerApiCredentialDto,
): SellerApiCredential {
  return {
    id: dto.id,
    storeId: dto.storeId,
    merchantId: dto.merchantId,
    displayValue: maskDisplayValue(dto),
    keyPrefix: dto.keyPrefix,
    fingerprint: dto.fingerprint,
    paymentMode: dto.paymentMode ?? "SANDBOX",
    status: dto.status,
    statusLabel: mapCredentialStatusLabel(dto.status),
    keyVersion: dto.keyVersion,
    lastUsedAt: dto.lastUsedAt,
    revokedAt: dto.revokedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function mapApiCredentialListDto(
  items: SellerApiCredentialDto[],
): SellerApiCredential[] {
  return items.map(mapApiCredentialDto);
}

export function mapClaimOfferDto(
  data: SellerApiCredentialClaimOfferData,
): ApiCredentialClaimOffer {
  return {
    credential: data.credential
      ? mapApiCredentialDto(data.credential)
      : undefined,
    issuanceStatus: data.issuance?.status ?? data.status,
    claimId: data.claimId,
    claimToken: data.claimToken,
    claimExpiresAt: data.claimExpiresAt,
    paymentMode: data.paymentMode ?? data.issuance?.paymentMode,
  };
}

/**
 * Strip apiKey from any accidental spread into cacheable models.
 * Callers must hold reveal only in component state.
 */
export function mapSecretClaimDto(
  data: SellerApiCredentialSecretClaimData,
): ApiKeyReveal {
  return {
    apiKey: data.apiKey,
    fingerprint: data.fingerprint,
    keyPrefix: data.keyPrefix,
    keyVersion: data.keyVersion,
    credential: data.credential
      ? mapApiCredentialDto(data.credential)
      : undefined,
  };
}

export function toRequestCredentialBody(
  input: RequestApiCredentialInput,
): SellerApiCredentialRequest {
  const body: SellerApiCredentialRequest = {};
  if (input.paymentMode != null) body.paymentMode = input.paymentMode;
  if (input.purpose != null) body.purpose = input.purpose;
  if (input.reason != null) body.reason = input.reason;
  if (input.mfaCode != null) body.mfaCode = input.mfaCode;
  if (input.expectedKeyVersion != null) {
    body.expectedKeyVersion = input.expectedKeyVersion;
  }
  return body;
}

export function mapKycStatusDto(dto: SellerKycStatusDto): SellerKycStatus {
  const status = dto.status;
  const approved =
    status === "APPROVED" ||
    status === "ACTIVE" ||
    dto.liveApiEligible === true;
  return {
    status,
    statusLabel: mapKycStatusLabel(status),
    capability: dto.capability,
    paymentMode: dto.paymentMode,
    liveApiEligible: dto.liveApiEligible ?? approved,
    openCaseId: dto.openCaseId,
    caseStatus: dto.caseStatus,
    requiredDocuments: dto.requiredDocuments ?? [],
    clarificationReason: dto.clarificationReason,
    approvedAt: dto.approvedAt,
    updatedAt: dto.updatedAt,
  };
}

export function mapKycCaseDto(dto: SellerKycCaseDto): SellerKycCase {
  return {
    id: dto.id,
    status: dto.status,
    statusLabel: mapKycStatusLabel(dto.status),
    legalName: dto.legalName,
    businessName: dto.businessName,
    clarificationReason: dto.clarificationReason,
    documentCount: dto.documents?.length ?? 0,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toCreateKycCaseBody(
  input: CreateKycCaseInput,
): SellerKycCreateCaseRequest {
  const body: SellerKycCreateCaseRequest = {
    legalName: input.legalName.trim(),
  };
  if (input.businessName != null) body.businessName = input.businessName.trim();
  if (input.registrationNumber != null) {
    body.registrationNumber = input.registrationNumber.trim();
  }
  if (input.countryCode != null) body.countryCode = input.countryCode;
  if (input.consentVersion != null) body.consentVersion = input.consentVersion;
  if (input.submit != null) body.submit = input.submit;
  return body;
}

/** Prefer ACTIVE live, then ACTIVE sandbox, then first non-revoked. */
export function pickPrimaryCredential(
  list: SellerApiCredential[],
): SellerApiCredential | undefined {
  const activeLive = list.find(
    (c) => c.status === "ACTIVE" && c.paymentMode === "LIVE",
  );
  if (activeLive) return activeLive;
  const active = list.find((c) => c.status === "ACTIVE");
  if (active) return active;
  return list.find((c) => c.status !== "REVOKED") ?? list[0];
}
