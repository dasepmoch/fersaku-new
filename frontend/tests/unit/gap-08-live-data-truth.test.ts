/**
 * GAP-08 P1 — live/API mode must not present fixture rows, fake metrics, or
 * active impersonation targets from demo catalogs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { demoSellerUsers, listAdminUsers } from "@/features/admin/data/access";

const root = path.resolve(__dirname, "../..");

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/api/http-client")
  >("@/shared/api/http-client");
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

function installApiAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const AS_OF = "2026-07-20T00:00:00Z";

describe("GAP-08 live data truth", () => {
  afterEach(() => {
    clearDomainSourceSnapshot();
    apiRequestMock.mockReset();
  });

  it("demoSellerUsers fixtures are mock-only catalog helpers", () => {
    installMockAdmin();
    expect(shouldUseMockFixtures("adminRead")).toBe(true);
    const rows = demoSellerUsers();
    expect(rows.some((r) => r[0] === "usr_01H8A2")).toBe(true);

    installApiAdmin();
    expect(shouldUseMockFixtures("adminRead")).toBe(false);
  });

  it("listAdminUsers API empty response stays empty (no demo inject)", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [],
      meta: { requestId: "req_users", timestamp: AS_OF },
    });
    const rows = await listAdminUsers({ limit: 20 });
    expect(apiRequestMock).toHaveBeenCalled();
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/users");
    expect(rows).toEqual([]);
    expect(rows.some((r) => String(r.id).startsWith("usr_01H8"))).toBe(false);
  });

  it("listAdminUsers API maps server rows without demo injection", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [
        {
          id: "user_live_1",
          name: "Live Operator",
          email: "ops@example.test",
          status: "ACTIVE",
          isAdmin: false,
          ownerMerchantId: "merch_live_1",
          impersonatable: true,
          createdAt: "2026-07-01T00:00:00Z",
        },
      ],
      meta: { requestId: "req_users2", timestamp: AS_OF },
    });
    const rows = await listAdminUsers();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("user_live_1");
    expect(rows[0]?.email).toBe("ops@example.test");
    expect(rows[0]?.impersonatable).toBe(true);
    expect(rows.some((r) => r.email === "asep@ai.tools")).toBe(false);
  });

  it("mock listAdminUsers may include demo sellers", async () => {
    installMockAdmin();
    const rows = await listAdminUsers();
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(rows.some((r) => r.id === "usr_01H8A2")).toBe(true);
  });

  it("presentation users screen does not import demoSellerUsers", () => {
    const source = readFileSync(
      path.join(root, "features/admin/screens/access/users.tsx"),
      "utf8",
    );
    expect(source).not.toContain("demoSellerUsers");
    expect(source).toContain("useAdminUsers");
    expect(source).toContain("impersonatable");
  });

  it("webhooks API branch does not hardcode median latency 92 ms", () => {
    const source = readFileSync(
      path.join(root, "features/admin/operations/webhooks/index.tsx"),
      "utf8",
    );
    expect(source).toMatch(/const medianLatency = isApi \? "—" : "92 ms"/);
  });

  it("contact submit stays disabled outside mock (PUB-200 honesty)", () => {
    const source = readFileSync(
      path.join(root, "app/(company)/contact/page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/contactSubmitEnabled = publicSource === "mock"/);
    expect(source).toMatch(/disabled=\{!contactSubmitEnabled\}/);
  });
});
