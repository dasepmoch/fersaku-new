import type { StoreDomain, StoreDomainCreateResult } from "./contracts";

/** Snapshot-style demo domain for mock/prototype mode (LinksPanel was shop.asep.ai). */
export function demoStoreDomains(storeId = "demo_store"): StoreDomain[] {
  return [
    {
      id: "dom_demo_01",
      storeId,
      hostname: "shop.asep.ai",
      hostnameNormalized: "shop.asep.ai",
      status: "ACTIVE",
      tlsStatus: "ACTIVE",
      version: 1,
      expectedDnsName: "_fersaku-challenge.shop.asep.ai",
      statusLabel: "Connected",
      detailLabel: "DNS verified · TLS active",
      connected: true,
      verifiedAt: "2026-07-01T00:00:00Z",
    },
  ];
}

export function mockCreateStoreDomain(
  storeId: string,
  hostname: string,
): StoreDomainCreateResult {
  const host = hostname.trim().toLowerCase() || "shop.example.com";
  return {
    domain: {
      id: `dom_mock_${Date.now()}`,
      storeId,
      hostname: host,
      hostnameNormalized: host,
      status: "PENDING_DNS",
      tlsStatus: "NONE",
      version: 1,
      expectedDnsName: `_fersaku-challenge.${host}`,
      statusLabel: "Pending DNS",
      detailLabel: `Add TXT at _fersaku-challenge.${host}`,
      connected: false,
    },
    verificationToken: "mock_verify_token_once",
  };
}
