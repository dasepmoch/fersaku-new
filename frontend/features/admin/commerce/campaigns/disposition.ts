import { getDomainSource } from "@/shared/data/domain-source";

/**
 * ADM-380: campaign/announcement commands are launch OUT-OF-SCOPE.
 * No canonical BE route exists; API/disabled must never publish/send/pause.
 * Mock may retain local prototype affordances only.
 */
export const CAMPAIGN_COMMANDS_DISABLED_TITLE =
  "Campaign commands are out of scope for launch (ADM-380 deferred — no backend route)";

export const CAMPAIGN_CAPABILITY_UNAVAILABLE_COPY =
  "Campaigns & announcements are not available for launch. There is no canonical campaign backend route; publish, test-send, and pause remain disabled until product re-opens ADM-380 as IMPLEMENT.";

export type CampaignDomainSource = "mock" | "api" | "disabled";

export function getCampaignDomainSource(): CampaignDomainSource {
  try {
    return getDomainSource("adminWrite");
  } catch {
    return "api";
  }
}

/** True only on mock domain — prototype local seed/actions allowed. */
export function campaignCommandsEnabled(
  source: CampaignDomainSource = getCampaignDomainSource(),
): boolean {
  return source === "mock";
}

/** Live/API path must never surface mock campaign rows as authority. */
export function campaignListFixturesAllowed(
  source: CampaignDomainSource = getCampaignDomainSource(),
): boolean {
  return source === "mock";
}
