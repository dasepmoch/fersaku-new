/**
 * Delivery access DTO → claim view (CHK-140). Pure; no React.
 */

import type { DeliveryAccessDto, DeliveryResendDto } from "@/shared/api/schemas";
import { invalidApiContract } from "@/shared/api/mappers";
import type {
  DeliveryAccessClaim,
  DeliveryAccessKind,
  DeliveryResendResult,
} from "./contracts";

const KINDS = new Set<DeliveryAccessKind>([
  "DOWNLOAD",
  "PROTECTED_LINK",
  "CREDENTIAL",
  "CODE",
]);

function asKind(raw: string): DeliveryAccessKind {
  const u = raw.trim().toUpperCase() as DeliveryAccessKind;
  if (!KINDS.has(u)) {
    return invalidApiContract("Unknown deliveryKind on access", {
      issues: [{ path: "deliveryKind", message: raw }],
    });
  }
  return u;
}

/** Map access envelope data → component-memory claim (includes secrets when present). */
export function mapDeliveryAccessDto(
  dto: DeliveryAccessDto,
  claimedAtMs: number = Date.now(),
): DeliveryAccessClaim {
  const claim: DeliveryAccessClaim = {
    grantId: dto.grantId,
    orderId: dto.orderId,
    orderItemId: dto.orderItemId,
    deliveryKind: asKind(dto.deliveryKind),
    status: dto.status,
    accessCount: dto.accessCount ?? 0,
    maxAccesses: dto.maxAccesses ?? 0,
    claimedAtMs,
  };
  if (dto.expiresAt) {
    claim.expiresAt =
      typeof dto.expiresAt === "string"
        ? dto.expiresAt
        : String(dto.expiresAt);
  }
  if (dto.downloadObjectId) {
    claim.downloadObjectId = dto.downloadObjectId;
  }
  if (dto.secrets && Object.keys(dto.secrets).length > 0) {
    claim.secrets = { ...dto.secrets };
  }
  return claim;
}

export function mapDeliveryResendDto(
  dto: DeliveryResendDto | null | undefined,
): DeliveryResendResult {
  if (!dto || typeof dto !== "object") {
    return { queued: true };
  }
  return {
    grantId: dto.grantId,
    orderId: dto.orderId,
    status: dto.status,
    queued: dto.queued !== false,
  };
}

/**
 * Map CODE/CREDENTIAL secrets → existing credential field rows.
 * Prefer known keys; otherwise one row per secret entry.
 */
export function secretsToCredentialFields(
  secrets: Record<string, string>,
): Array<{ label: string; value: string; secret?: boolean }> {
  const preferred = [
    ["username", "Username", false],
    ["email", "Email", false],
    ["password", "Password", true],
    ["secret", "Secret", true],
    ["token", "Token", true],
    ["code", "Kode", true],
  ] as const;

  const used = new Set<string>();
  const rows: Array<{ label: string; value: string; secret?: boolean }> = [];

  for (const [key, label, secret] of preferred) {
    const v = secrets[key];
    if (v !== undefined && v !== "") {
      used.add(key);
      rows.push({ label, value: v, secret });
    }
  }
  for (const [key, value] of Object.entries(secrets)) {
    if (used.has(key) || value === "") continue;
    const lower = key.toLowerCase();
    const secret =
      lower.includes("pass") ||
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("key");
    rows.push({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      value,
      secret,
    });
  }
  return rows;
}

/** Primary code value from secrets map. */
export function secretsToCodeValue(
  secrets: Record<string, string>,
): string {
  return (
    secrets.code ||
    secrets.license ||
    secrets.licenseKey ||
    secrets.value ||
    Object.values(secrets)[0] ||
    ""
  );
}

/**
 * Optional short-lived open URL if BE placed one in secrets (not downloadObjectId).
 * Never treat downloadObjectId as a navigable URL.
 */
export function extractOpenUrlFromClaim(
  claim: DeliveryAccessClaim,
): string | undefined {
  const s = claim.secrets;
  if (!s) return undefined;
  const raw = s.url || s.link || s.href || s.downloadUrl || s.signedUrl;
  if (!raw || typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t.startsWith("https://") && !t.startsWith("http://")) return undefined;
  return t;
}

/** True when claim secrets should be cleared (TTL / BE expiry). */
export function isDeliveryClaimExpired(
  claim: DeliveryAccessClaim,
  nowMs: number = Date.now(),
  memoryTtlMs: number,
): boolean {
  if (claim.expiresAt) {
    const exp = Date.parse(claim.expiresAt);
    if (!Number.isNaN(exp) && exp <= nowMs) return true;
  }
  return nowMs - claim.claimedAtMs >= memoryTtlMs;
}

/** Strip secrets for safe logging/assert (tests). */
export function redactDeliveryClaim(
  claim: DeliveryAccessClaim,
): Omit<DeliveryAccessClaim, "secrets"> & { hasSecrets: boolean } {
  const { secrets, ...rest } = claim;
  return { ...rest, hasSecrets: Boolean(secrets && Object.keys(secrets).length) };
}
