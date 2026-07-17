/**
 * @deprecated INT-025 — use getDomainSource(domain) from domain-source.ts.
 * Global live switch is not a rollout mechanism; kept only for transitional
 * tooling that has not yet migrated. Prefer typed per-domain registry.
 */
import { publicEnv } from "@/shared/config/env";
import {
  getDomainSourceSnapshot,
  type DataDomain,
} from "@/shared/data/domain-source";

/** @deprecated Prefer getDomainSource(domain) === "api". */
export function isLiveApi() {
  return publicEnv.dataSource === "api";
}

/**
 * True when every registered domain is on api (full cutover signal).
 * Not a substitute for per-domain checks during gradual rollout.
 */
export function isFullApiCutover(): boolean {
  const { domains } = getDomainSourceSnapshot();
  return (Object.keys(domains) as DataDomain[]).every(
    (domain) => domains[domain] === "api",
  );
}
