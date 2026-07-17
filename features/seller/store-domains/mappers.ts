/**
 * Store domain transport DTO → existing Links & SEO card (SEL-310).
 * verificationToken never mapped into list/query models.
 */

import type { StoreDomainDto } from "@/shared/api/schemas";
import { invalidApiContract } from "@/shared/api/mappers";
import type { StoreDomain } from "./contracts";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Connected",
  PENDING_DNS: "Pending DNS",
  VERIFYING: "Verifying",
  FAILED: "Failed",
  SUSPENDED: "Suspended",
  REMOVING: "Removing",
  TOMBSTONED: "Removed",
};

const TLS_LABEL: Record<string, string> = {
  NONE: "TLS not started",
  PENDING: "TLS pending",
  ACTIVE: "TLS active",
  FAILED: "TLS failed",
  REMOVING: "TLS removing",
  REMOVED: "TLS removed",
};

export function mapDomainStatusLabel(
  status: string,
  tlsStatus: string,
): string {
  const s = status.trim().toUpperCase();
  const t = tlsStatus.trim().toUpperCase();
  if (s === "ACTIVE" && t === "ACTIVE") return "Connected";
  if (s === "ACTIVE" && t === "PENDING") return "TLS pending";
  if (s === "ACTIVE" && t === "FAILED") return "TLS failed";
  return STATUS_LABEL[s] ?? status;
}

export function mapDomainDetailLabel(dto: {
  status: string;
  tlsStatus: string;
  expectedDnsName?: string;
  failureCode?: string;
  hostname: string;
}): string {
  const s = dto.status.trim().toUpperCase();
  const t = dto.tlsStatus.trim().toUpperCase();
  if (dto.failureCode?.trim()) {
    return dto.failureCode.trim();
  }
  if (s === "ACTIVE" && t === "ACTIVE") {
    return "DNS verified · TLS active";
  }
  if (s === "ACTIVE") {
    return TLS_LABEL[t] ?? `TLS ${t || "unknown"}`;
  }
  if (s === "PENDING_DNS" || s === "VERIFYING") {
    const dns = dto.expectedDnsName?.trim();
    if (dns) return `Add TXT at ${dns}`;
    return "Awaiting DNS verification";
  }
  if (s === "FAILED") return "DNS verification failed";
  if (s === "SUSPENDED") return "Domain suspended";
  if (s === "REMOVING" || s === "TOMBSTONED") return "Domain removed";
  return dto.hostname;
}

export function isDomainConnected(status: string, tlsStatus: string): boolean {
  return (
    status.trim().toUpperCase() === "ACTIVE" &&
    tlsStatus.trim().toUpperCase() === "ACTIVE"
  );
}

/**
 * BE StoreDomain → card view.
 * Strips verificationToken from list/cache model.
 */
export function mapStoreDomainDto(dto: StoreDomainDto): StoreDomain {
  const id = dto.id.trim();
  if (!id) {
    return invalidApiContract("Store domain missing id", {
      issues: [{ path: "id", message: "empty" }],
    });
  }
  const hostname = dto.hostname.trim();
  if (!hostname) {
    return invalidApiContract("Store domain missing hostname", {
      issues: [{ path: "hostname", message: "empty" }],
    });
  }
  const version = Math.trunc(dto.version);
  if (version < 1) {
    return invalidApiContract("Store domain version invalid", {
      issues: [{ path: "version", message: String(dto.version) }],
    });
  }
  // Fail closed if hash-like secret fields leak on wire.
  const raw = dto as StoreDomainDto & {
    verificationTokenHash?: string;
    verification_token_hash?: string;
  };
  if (raw.verificationTokenHash || raw.verification_token_hash) {
    return invalidApiContract("Store domain must not expose token hash", {
      issues: [{ path: "verificationTokenHash", message: "forbidden" }],
    });
  }

  const status = String(dto.status).trim();
  const tlsStatus = String(dto.tlsStatus).trim();
  const expectedDnsName = (dto.expectedDnsName ?? "").trim();

  return {
    id,
    storeId: dto.storeId.trim(),
    hostname,
    hostnameNormalized:
      (dto.hostnameNormalized ?? "").trim() || hostname.toLowerCase(),
    status,
    tlsStatus,
    version,
    expectedDnsName,
    statusLabel: mapDomainStatusLabel(status, tlsStatus),
    detailLabel: mapDomainDetailLabel({
      status,
      tlsStatus,
      expectedDnsName,
      failureCode: dto.failureCode,
      hostname,
    }),
    connected: isDomainConnected(status, tlsStatus),
    failureCode: dto.failureCode?.trim() || undefined,
    lastCheckedAt:
      dto.lastCheckedAt == null ? undefined : String(dto.lastCheckedAt),
    verifiedAt: dto.verifiedAt == null ? undefined : String(dto.verifiedAt),
    cooldownUntil:
      dto.cooldownUntil == null ? undefined : String(dto.cooldownUntil),
  };
}

export function mapStoreDomainListDto(items: StoreDomainDto[]): StoreDomain[] {
  return items
    .map(mapStoreDomainDto)
    .filter((d) => d.status.toUpperCase() !== "TOMBSTONED");
}

/** Prefer ACTIVE, else first non-removing row for single-card chrome. */
export function pickPrimaryDomain(
  domains: StoreDomain[],
): StoreDomain | undefined {
  if (domains.length === 0) return undefined;
  const active = domains.find((d) => d.connected);
  if (active) return active;
  const pending = domains.find((d) => {
    const s = d.status.toUpperCase();
    return s !== "REMOVING" && s !== "TOMBSTONED";
  });
  return pending ?? domains[0];
}

/** Assert list models never carry one-time tokens. */
export function assertNoDomainSecretsInView(domain: StoreDomain): void {
  const flat = JSON.stringify(domain);
  if (/"verificationToken"\s*:/.test(flat)) {
    return invalidApiContract("View must not carry verificationToken", {
      issues: [{ path: "verificationToken", message: "present" }],
    });
  }
}
