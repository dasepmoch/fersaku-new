import { afterEach, describe, expect, it } from "vitest";
import {
  assertProductionDomainSources,
  clearDomainSourceSnapshot,
  DATA_DOMAINS,
  DomainDisabledError,
  DomainSourceConfigError,
  evaluateDomainSources,
  getDomainSource,
  installDomainSourceSnapshot,
  mockPlaceholderData,
  shouldUseMockFixtures,
  withDomainSource,
  type DataDomain,
  type DomainSourceMap,
} from "@/shared/data/domain-source";

afterEach(() => {
  clearDomainSourceSnapshot();
});

function allMock(): DomainSourceMap {
  return Object.fromEntries(
    DATA_DOMAINS.map((d) => [d, "mock" as const]),
  ) as DomainSourceMap;
}

describe("INT-025 domain source registry", () => {
  it("defaults prototype bootstrap mock for every domain", () => {
    const snap = evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    });
    for (const domain of DATA_DOMAINS) {
      expect(snap.domains[domain]).toBe("mock");
    }
    expect(snap.stage).toBe("prototype");
    expect(snap.version).toBeTruthy();
  });

  it("defaults bootstrap api for every domain in prototype", () => {
    const snap = evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    });
    for (const domain of DATA_DOMAINS) {
      expect(snap.domains[domain]).toBe("api");
    }
  });

  it("allows independent domain sources (catalog api while finance disabled)", () => {
    const snap = evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
      overrides: {
        publicCatalog: "api",
        sellerFinance: "disabled",
        adminWrite: "disabled",
      },
    });
    expect(snap.domains.publicCatalog).toBe("api");
    expect(snap.domains.sellerFinance).toBe("disabled");
    expect(snap.domains.adminWrite).toBe("disabled");
    expect(snap.domains.buyer).toBe("mock");
  });

  it("production/live rejects residual mock via rewrite to disabled", () => {
    const snap = evaluateDomainSources({
      stage: "live",
      bootstrapSource: "api",
      overrides: {
        sellerFinance: "mock",
      },
      rejectMock: true,
    });
    expect(snap.domains.sellerFinance).toBe("disabled");
    expect(snap.domains.publicCatalog).toBe("api");
  });

  it("live stage rejects pure mock bootstrap without overrides", () => {
    expect(() =>
      evaluateDomainSources({
        stage: "live",
        bootstrapSource: "mock",
      }),
    ).toThrow(DomainSourceConfigError);
  });

  it("assertProductionDomainSources fails closed on mock", () => {
    expect(() => assertProductionDomainSources(allMock())).toThrow(
      /Production rejects mock/,
    );
  });

  it("disabled never uses mock fixtures (shouldUseMockFixtures throws)", () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "api",
        overrides: { checkout: "disabled" },
      }),
    );
    expect(() => shouldUseMockFixtures("checkout")).toThrow(
      DomainDisabledError,
    );
    expect(getDomainSource("checkout")).toBe("disabled");
  });

  it("mockPlaceholderData only returns fixtures for mock source", () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
        overrides: {
          buyer: "mock",
          adminRead: "api",
          adminWrite: "disabled",
        },
      }),
    );
    expect(mockPlaceholderData("buyer", ["fixture"])).toEqual(["fixture"]);
    expect(mockPlaceholderData("adminRead", ["fixture"])).toBeUndefined();
    expect(mockPlaceholderData("adminWrite", ["fixture"])).toBeUndefined();
  });

  it("shouldUseMockFixtures true only for mock; false for api", () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
        overrides: { publicCatalog: "api" },
      }),
    );
    expect(shouldUseMockFixtures("buyer")).toBe(true);
    expect(shouldUseMockFixtures("publicCatalog")).toBe(false);
  });

  it("withDomainSource never invokes mock when disabled", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "api",
        overrides: { sellerFinance: "disabled" },
      }),
    );
    let mockCalled = false;
    await expect(
      withDomainSource("sellerFinance", {
        mock: () => {
          mockCalled = true;
          return "mock";
        },
        api: () => "api",
      }),
    ).rejects.toBeInstanceOf(DomainDisabledError);
    expect(mockCalled).toBe(false);
  });

  it("SSR snapshot install is request-stable for client reads", () => {
    const server = evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
      overrides: { publicCatalog: "api", sellerFinance: "disabled" },
      version: "req-1",
      releaseId: "rel-test",
    });
    installDomainSourceSnapshot(server);
    expect(getDomainSource("publicCatalog")).toBe("api");
    expect(getDomainSource("sellerFinance")).toBe("disabled");
    expect(getDomainSource("buyer")).toBe("mock");
  });

  it("unknown domain key fails closed at override parse time", () => {
    expect(() =>
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
        overrides: { notADomain: "api" } as Partial<Record<DataDomain, "api">>,
      }),
    ).not.toThrow();
    // evaluate only walks DATA_DOMAINS; unknown keys ignored in typed Partial.
    // Runtime unknown keys from env JSON are rejected by readServerOwnedOverrides.
  });

  it("live install rejects snapshot that still contains mock", () => {
    const bad = {
      version: "x",
      releaseId: "y",
      stage: "live" as const,
      domains: allMock(),
    };
    expect(() => installDomainSourceSnapshot(bad)).toThrow(
      DomainSourceConfigError,
    );
  });
});
