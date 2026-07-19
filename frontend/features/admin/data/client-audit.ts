/**
 * INT-170 — client audit append facade.
 * Browser mock audit is mock-mode only; API mode is a no-op (server is authority).
 * Presentation imports this module, never mock-audit.ts directly.
 */

import { getDomainSource } from "@/shared/data/domain-source";
import type { AdminAuditEvent } from "./contracts";
import {
  appendMockAuditEvent,
  combineMockAuditChains,
  readMockAuditEvents,
  verifyMockAuditIntegrity,
  withMockAuditIntegrity,
} from "./mock-audit";

export type ClientAuditAppendInput = Omit<AdminAuditEvent, "id" | "time"> & {
  id?: string;
};

/**
 * Append a local demo audit row only when admin domains are mock.
 * API mode: no-op — never writes browser mock audit as authority.
 */
export function appendClientAuditEvent(event: ClientAuditAppendInput): void {
  const write = getDomainSource("adminWrite");
  const read = getDomainSource("adminRead");
  if (write !== "mock" && read !== "mock") return;
  appendMockAuditEvent(event);
}

/** Re-export mock audit readers for data adapters only via this facade when needed. */
export {
  combineMockAuditChains,
  readMockAuditEvents,
  verifyMockAuditIntegrity,
  withMockAuditIntegrity,
};
