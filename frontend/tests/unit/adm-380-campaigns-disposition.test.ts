import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_CAPABILITY_UNAVAILABLE_COPY,
  CAMPAIGN_COMMANDS_DISABLED_TITLE,
  campaignCommandsEnabled,
  campaignListFixturesAllowed,
} from "@/features/admin/commerce/campaigns/disposition";
import {
  canAccessAdminNavHref,
  canAccessAdminPage,
  getAdminPageMeta,
} from "@/features/admin/config/routes";
import { createMockClaims } from "@/shared/auth/session-model";

const root = path.resolve(__dirname, "../..");

describe("ADM-380 campaign disposition", () => {
  it("keeps route decision_pending so nav/boundary deny even superuser", () => {
    const meta = getAdminPageMeta(["campaigns"]);
    expect(meta.disposition).toBe("decision_pending");
    expect(meta.permission).toBe("campaigns.publish");

    const superuser = createMockClaims("admin");
    expect(canAccessAdminPage(meta, superuser)).toBe(false);
    expect(canAccessAdminNavHref("/admin/campaigns", superuser)).toBe(false);
  });

  it("enables commands and fixtures only on mock domain source", () => {
    expect(campaignCommandsEnabled("mock")).toBe(true);
    expect(campaignListFixturesAllowed("mock")).toBe(true);

    expect(campaignCommandsEnabled("api")).toBe(false);
    expect(campaignListFixturesAllowed("api")).toBe(false);

    expect(campaignCommandsEnabled("disabled")).toBe(false);
    expect(campaignListFixturesAllowed("disabled")).toBe(false);
  });

  it("exposes truthful disabled copy for API/live path", () => {
    expect(CAMPAIGN_COMMANDS_DISABLED_TITLE).toMatch(/ADM-380/);
    expect(CAMPAIGN_COMMANDS_DISABLED_TITLE).toMatch(/no backend route/i);
    expect(CAMPAIGN_CAPABILITY_UNAVAILABLE_COPY).toMatch(/not available for launch/i);
    expect(CAMPAIGN_CAPABILITY_UNAVAILABLE_COPY).not.toMatch(/published and audited/i);
  });

  it("announcements gate commands and never mount campaign transport", () => {
    const source = readFileSync(
      path.join(root, "features/admin/commerce/campaigns/announcements.tsx"),
      "utf8",
    );
    expect(source).toMatch(/campaignCommandsEnabled/);
    expect(source).toMatch(/getCampaignDomainSource/);
    expect(source).toMatch(/CAMPAIGN_COMMANDS_DISABLED_TITLE/);
    expect(source).toMatch(/CAMPAIGN_CAPABILITY_UNAVAILABLE_COPY/);
    expect(source).toMatch(/disabled=\{!commandsEnabled\}/);
    expect(source).toMatch(/if\s*\(\s*!commandsEnabled\s*\)\s*return/);
    expect(source).toMatch(/fixturesAllowed\s*\?\s*campaignSeed\s*:\s*\[\]/);
    expect(source).not.toMatch(/apiRequest|\/v1\/admin\/campaign/i);
    expect(source).not.toMatch(/queryKeys\.admin\.campaigns/);
  });

  it("preview CTAs are noninteractive presentation only", () => {
    const preview = readFileSync(
      path.join(root, "features/admin/commerce/campaigns/preview.tsx"),
      "utf8",
    );
    expect(preview).toMatch(/role="presentation"/);
    expect(preview).toMatch(/aria-hidden="true"/);
    expect(preview).not.toMatch(/<button[\s\S]*ctaLabel/);
    expect(preview).not.toMatch(/onClick/);
  });
});
