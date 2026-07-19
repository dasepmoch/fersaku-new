"use client";

import { writeVersionedStorage } from "@/shared/storage/versioned-storage";
import type { AdminAuditEvent } from "./contracts";
import { auditEvents as seedAuditEvents } from "@/lib/admin-mock-data";

const storageKey = "fersaku-admin-audit-events";
const storageVersion = 3;
const mockGenesisHash = "mock-fnv1a32:00000000";

type StoredAuditEvent = AdminAuditEvent & {
  createdAt: string;
  previousHash: string;
  integrityHash: string;
};

const canonicalAuditValue = (
  event: Omit<AdminAuditEvent, "previousHash" | "integrityHash">,
) =>
  JSON.stringify({
    action: event.action,
    actor: event.actor,
    context: event.context ?? null,
    id: event.id,
    ip: event.ip,
    result: event.result,
    target: event.target,
    time: event.time,
  });

/** Deterministic non-cryptographic hash used only by the local mock demo. */
function mockIntegrityHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `mock-fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

function hashAuditEvent(
  event: Omit<AdminAuditEvent, "previousHash" | "integrityHash">,
  previousHash: string,
) {
  return mockIntegrityHash(`${previousHash}\n${canonicalAuditValue(event)}`);
}

function seedHeadHash() {
  return (
    withMockAuditIntegrity(seedAuditEvents as AdminAuditEvent[])[0]
      ?.integrityHash ?? mockGenesisHash
  );
}

function readStoredEvents(): StoredAuditEvent[] {
  if (typeof window === "undefined") return [];
  const storage = window.localStorage;
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; data?: unknown };
    if (parsed.version !== storageVersion || !Array.isArray(parsed.data)) {
      return [];
    }
    return parsed.data.filter(isStoredEvent).slice(0, 100);
  } catch {
    return [];
  }
}

function isStoredEvent(value: unknown): value is StoredAuditEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<StoredAuditEvent>;
  const requiredFieldsValid = [
    event.id,
    event.actor,
    event.action,
    event.target,
    event.ip,
    event.result,
    event.time,
    event.createdAt,
    event.previousHash,
    event.integrityHash,
  ].every((item) => typeof item === "string");
  return (
    requiredFieldsValid &&
    (event.context === undefined || typeof event.context === "string")
  );
}

/** Append-only mock event seam. Production writes must happen server-side. */
export function appendMockAuditEvent(
  event: Omit<AdminAuditEvent, "id" | "time"> & { id?: string },
) {
  if (typeof window === "undefined") return;
  const now = new Date();
  const existing = readStoredEvents();
  const previousHash = existing[0]?.integrityHash ?? seedHeadHash();
  const unsignedEvent = {
    ...event,
    id: event.id || `evt_mock_${now.getTime().toString(36)}`,
    time: "baru saja",
    createdAt: now.toISOString(),
  };
  const next: StoredAuditEvent = {
    ...unsignedEvent,
    previousHash,
    integrityHash: hashAuditEvent(unsignedEvent, previousHash),
  };
  writeVersionedStorage({
    key: storageKey,
    version: storageVersion,
    data: [next, ...existing].slice(0, 100),
  });
  window.dispatchEvent(new CustomEvent("fersaku-admin-audit-updated"));
}

export function readMockAuditEvents(): AdminAuditEvent[] {
  return readStoredEvents().map((storedEvent) => {
    const { createdAt, ...event } = storedEvent;
    void createdAt;
    return event;
  });
}

/** Build one stable newest-first chain for fixtures plus locally appended rows. */
export function withMockAuditIntegrity(
  events: AdminAuditEvent[],
): AdminAuditEvent[] {
  let previousHash = mockGenesisHash;
  const oldestFirst = [...events].reverse().map((event) => {
    const {
      previousHash: _previous,
      integrityHash: _integrity,
      ...unsigned
    } = event;
    void _previous;
    void _integrity;
    const chained = {
      ...unsigned,
      previousHash,
      integrityHash: hashAuditEvent(unsigned, previousHash),
    };
    previousHash = chained.integrityHash;
    return chained;
  });
  return oldestFirst.reverse();
}

export function verifyMockAuditIntegrity(events: AdminAuditEvent[]): boolean {
  if (events.length === 0) return true;
  return events.every((event, index) => {
    if (!event.previousHash || !event.integrityHash) return false;
    const expectedPrevious =
      events[index + 1]?.integrityHash ?? mockGenesisHash;
    if (event.previousHash !== expectedPrevious) return false;
    const { previousHash, integrityHash, ...unsigned } = event;
    return integrityHash === hashAuditEvent(unsigned, previousHash);
  });
}

/** Preserve stored hashes while attaching a deterministic chain to seed data. */
export function combineMockAuditChains(
  storedEvents: AdminAuditEvent[],
  seedEvents: AdminAuditEvent[],
) {
  return [...storedEvents, ...withMockAuditIntegrity(seedEvents)];
}
