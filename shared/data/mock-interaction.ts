/**
 * INT-170 — mock interaction feedback gate.
 * Mock-only toast/feedback must never run when any active domain is API.
 * Presentation markup stays unchanged; only the click-feedback path is gated.
 */

import {
  DATA_DOMAINS,
  getDomainSource,
  getDomainSourceSnapshot,
  type DataDomain,
  type DomainSourceSnapshot,
} from "./domain-source";

/**
 * True when mock-only interaction feedback is allowed.
 * Fail closed: any domain on `api` (or bootstrap not pure-mock) disables feedback.
 * `disabled` does not enable mock feedback either.
 */
export function isMockInteractionFeedbackEnabled(
  snapshot?: DomainSourceSnapshot,
): boolean {
  const snap = snapshot ?? getDomainSourceSnapshot();
  // Live stage never shows mock interaction copy.
  if (snap.stage === "live") return false;
  for (const domain of DATA_DOMAINS) {
    const source = snap.domains[domain];
    if (source === "api") return false;
  }
  // Pure mock prototype only.
  return DATA_DOMAINS.every((domain) => snap.domains[domain] === "mock");
}

/** Domain-scoped check when a surface knows its registry key. */
export function isMockInteractionFeedbackEnabledForDomain(
  domain: DataDomain,
): boolean {
  if (getDomainSource(domain) !== "mock") return false;
  return isMockInteractionFeedbackEnabled();
}

/**
 * Stable mock-only feedback copy. Must not be shown in API mode.
 * Existing Indonesian phrasing preserved (UI freeze).
 */
export function mockInteractionFeedbackMessage(label: string): string {
  return `${label} diproses dalam mode mock.`;
}
