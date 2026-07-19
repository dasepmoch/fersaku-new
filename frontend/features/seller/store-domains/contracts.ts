/**
 * SEL-310 — store custom domain view models for existing Links & SEO chrome.
 * Geometry matches LinksPanel custom-domain card (no redesign).
 */

export type StoreDomainStatus =
  | "PENDING_DNS"
  | "VERIFYING"
  | "ACTIVE"
  | "FAILED"
  | "SUSPENDED"
  | "REMOVING"
  | "TOMBSTONED"
  | string;

export type StoreDomainTlsStatus =
  "NONE" | "PENDING" | "ACTIVE" | "FAILED" | "REMOVING" | "REMOVED" | string;

/** Existing custom-domain card row. */
export type StoreDomain = {
  id: string;
  storeId: string;
  hostname: string;
  hostnameNormalized: string;
  status: StoreDomainStatus;
  tlsStatus: StoreDomainTlsStatus;
  version: number;
  /** DNS TXT name for instructions (e.g. _fersaku-challenge.shop.example). */
  expectedDnsName: string;
  /** UI chip: Connected / Pending DNS / TLS pending / Failed / … */
  statusLabel: string;
  /** Secondary line under hostname (DNS / TLS / failure). */
  detailLabel: string;
  /** True only when status ACTIVE and tls ACTIVE (routable). */
  connected: boolean;
  failureCode?: string;
  lastCheckedAt?: string;
  verifiedAt?: string;
  cooldownUntil?: string;
};

/**
 * Create result: domain row + one-time verificationToken.
 * Token must stay component-local — never query cache / storage.
 */
export type StoreDomainCreateResult = {
  domain: StoreDomain;
  /** One-time plaintext token from create; required for verify. */
  verificationToken?: string;
};

export type CreateStoreDomainInput = {
  hostname: string;
  idempotencyKey?: string;
};

export type VerifyStoreDomainInput = {
  domainId: string;
  verificationToken: string;
  expectedVersion?: number;
};

export type DeleteStoreDomainInput = {
  domainId: string;
  expectedVersion?: number;
};
