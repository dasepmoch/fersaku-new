import { afterEach, describe, expect, it, vi } from "vitest";
import { statusEnvelopeSchema } from "@/shared/api/schemas";
import {
  formatUptimeSeconds,
  getPublicPlatformStatus,
  getPublicStatusDto,
  mapStatusDtoToPublicView,
  mapUnavailablePublicStatus,
  MOCK_STATUS_DTO,
  publicStatusBannerClasses,
  publicStatusDotClass,
  publicStatusLabelClass,
  PUBLIC_STATUS_SERVICE_NAMES,
} from "@/features/platform-status";

const meta = {
  requestId: "req_pub220",
  timestamp: "2026-07-17T10:00:00Z",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("PUB-220 status mapping", () => {
  it("accepts status envelope schema for public API contract", () => {
    const parsed = statusEnvelopeSchema.safeParse({
      data: {
        service: "fersaku-api",
        version: "1.2.3",
        appEnv: "production",
        uptimeSeconds: 3600,
      },
      meta,
    });
    expect(parsed.success).toBe(true);
  });

  it("formats process uptime without inventing SLA percentages", () => {
    expect(formatUptimeSeconds(12)).toBe("12s process uptime");
    expect(formatUptimeSeconds(120)).toBe("2m process uptime");
    expect(formatUptimeSeconds(7200)).toBe("2h process uptime");
    expect(formatUptimeSeconds(172800)).toBe("2d process uptime");
    expect(formatUptimeSeconds(-1)).toBe("");
  });

  it("maps reachable API process without claiming all systems operational", () => {
    const view = mapStatusDtoToPublicView(
      {
        service: "fersaku-api",
        version: "1.0.0",
        appEnv: "staging",
        uptimeSeconds: 90,
      },
      "api",
    );
    expect(view.mode).toBe("informational");
    expect(view.overallKind).toBe("unknown");
    expect(view.headline).not.toMatch(/all systems operational/i);
    expect(view.detail).not.toMatch(/less than a minute/i);
    expect(view.services).toHaveLength(PUBLIC_STATUS_SERVICE_NAMES.length);
    expect(view.incidents).toEqual([]);

    const apiRow = view.services.find((s) => s.name === "API & webhooks");
    expect(apiRow?.kind).toBe("ok");
    expect(apiRow?.label).toBe("Reachable");
    expect(apiRow?.secondary).toBe("1m process uptime");

    for (const s of view.services) {
      if (s.name === "API & webhooks") continue;
      expect(s.kind).toBe("not_reported");
      expect(s.label).toBe("Not reported");
      expect(s.secondary).toBe("");
    }
  });

  it("maps unavailable without green operational default", () => {
    const view = mapUnavailablePublicStatus();
    expect(view.source).toBe("unavailable");
    expect(view.overallKind).toBe("unknown");
    expect(view.headline).toMatch(/unavailable/i);
    expect(view.services.every((s) => s.kind === "unknown")).toBe(true);
    expect(view.services.every((s) => s.label === "Unavailable")).toBe(true);
    expect(view.incidents).toEqual([]);
    const banner = publicStatusBannerClasses(view.overallKind);
    expect(banner.bg).not.toBe("bg-[#edf8f1]");
    expect(publicStatusDotClass("unknown")).toBe("bg-[#9aa3ad]");
    expect(publicStatusLabelClass("ok")).toBe("text-[#2b7b4d]");
  });

  it("never paints green for non-ok kinds", () => {
    expect(publicStatusDotClass("ok")).toBe("bg-[#35a765]");
    expect(publicStatusDotClass("degraded")).not.toContain("35a765");
    expect(publicStatusDotClass("down")).not.toContain("35a765");
    expect(publicStatusDotClass("unknown")).not.toContain("35a765");
    expect(publicStatusDotClass("not_reported")).not.toContain("35a765");
  });
});

describe("PUB-220 public status adapter", () => {
  it("mock domain returns informational process fixture", async () => {
    const result = await getPublicStatusDto();
    expect(result).not.toBeNull();
    expect(result!.source).toBe("mock");
    expect(result!.dto).toEqual(MOCK_STATUS_DTO);

    const view = await getPublicPlatformStatus();
    expect(view.source).toBe("mock");
    expect(view.mode).toBe("informational");
    expect(view.overallKind).toBe("unknown");
    expect(view.headline).toBe("Status page is informational");
    expect(view.incidents).toEqual([]);
  });

  it("api mode maps GET /v1/status envelope", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SOURCE_PUBLIC_CATALOG", "api");

    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest").mockResolvedValue({
      data: {
        service: "fersaku-api",
        version: "9.9.9",
        appEnv: "production",
        uptimeSeconds: 4000,
      },
      meta,
    } as never);

    const { getPublicPlatformStatus: getStatus } =
      await import("@/features/platform-status/api");
    const view = await getStatus();
    expect(spy).toHaveBeenCalledWith(
      "/v1/status",
      expect.objectContaining({
        schema: expect.anything(),
      }),
    );
    expect(view.source).toBe("api");
    expect(view.apiVersion).toBe("9.9.9");
    expect(view.overallKind).toBe("unknown");
    expect(view.headline).not.toMatch(/operational/i);
    const payments = view.services.find((s) => s.name === "QRIS payments");
    expect(payments?.kind).toBe("not_reported");
    spy.mockRestore();
  });

  it("api outage maps unavailable without inventing uptime or incidents", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SOURCE_PUBLIC_CATALOG", "api");

    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi
      .spyOn(http, "apiRequest")
      .mockRejectedValue(new Error("network"));

    const { getPublicPlatformStatus: getStatus } =
      await import("@/features/platform-status/api");
    const view = await getStatus();
    expect(view.source).toBe("unavailable");
    expect(view.overallKind).toBe("unknown");
    expect(view.incidents).toEqual([]);
    expect(view.services.every((s) => s.label === "Unavailable")).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/99\.9/);
    expect(JSON.stringify(view)).not.toMatch(/All systems operational/i);
    spy.mockRestore();
  });

  it("does not call /metrics or admin health paths", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SOURCE_PUBLIC_CATALOG", "api");

    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest").mockResolvedValue({
      data: MOCK_STATUS_DTO,
      meta,
    } as never);

    const { getPublicStatusDto: getDto } =
      await import("@/features/platform-status/api");
    await getDto();
    expect(spy).toHaveBeenCalledTimes(1);
    const path = spy.mock.calls[0][0] as string;
    expect(path).toBe("/v1/status");
    expect(path).not.toMatch(/metrics|admin|health\/ready|health\/live/);
    spy.mockRestore();
  });
});

describe("PUB-220 page disposition source", () => {
  it("status page wires adapter and forbids hardcoded operational claims", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = process.cwd();
    const page = await fs.readFile(
      path.join(root, "app/(resources)/status/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/getPublicPlatformStatus/);
    expect(page).toMatch(/from ["']@\/features\/platform-status["']/);
    expect(page).not.toMatch(/All systems operational/);
    expect(page).not.toMatch(/99\.99%/);
    expect(page).not.toMatch(/Last checked less than a minute ago/);
    expect(page).not.toMatch(/Delayed seller webhook/);
    expect(page).not.toMatch(/Xendit sandbox latency/);
  });
});
