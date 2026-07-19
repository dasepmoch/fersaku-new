import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDomainSourceChange,
  buildDomainSourceTelemetry,
  buildEmergencyAuditEvent,
  canaryBucket,
  DEFAULT_KILL_SWITCH_PROPAGATION_SLO_MS,
  domainsWithSourceChange,
  domainSourceKeySegment,
  evaluateDomainFlags,
  isEmergencyActive,
  purgeDomainCachesOnSourceChange,
  queryKeyTouchesDomain,
  readServerOwnedCanary,
  readServerOwnedEmergencyControls,
  resolveCanarySource,
  type DomainCacheClient,
  type EmergencyKillSwitch,
} from "@/shared/data/domain-flags";
import {
  clearDomainSourceSnapshot,
  DATA_DOMAINS,
  DomainDisabledError,
  DomainSourceConfigError,
  evaluateDomainSources,
  getDomainSource,
  installDomainSourceSnapshot,
  shouldUseMockFixtures,
  withDomainSource,
} from "@/shared/data/domain-source";

afterEach(() => {
  clearDomainSourceSnapshot();
});

function kill(
  partial: Partial<EmergencyKillSwitch> & Pick<EmergencyKillSwitch, "domain">,
): EmergencyKillSwitch {
  return {
    source: "disabled",
    version: "em-1",
    actor: "ops:test",
    reason: "unit-test-kill",
    ...partial,
  };
}

describe("QLT-400 domain flags — precedence", () => {
  it("bootstrap default applies when no layers set", () => {
    const snap = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "mock",
    });
    for (const d of DATA_DOMAINS) {
      expect(snap.domains[d]).toBe("mock");
    }
  });

  it("server overrides beat bootstrap", () => {
    const snap = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "mock",
      overrides: { publicCatalog: "api", sellerFinance: "disabled" },
    });
    expect(snap.domains.publicCatalog).toBe("api");
    expect(snap.domains.sellerFinance).toBe("disabled");
    expect(snap.domains.buyer).toBe("mock");
  });

  it("canary allowlist beats overrides for listed subject", () => {
    const snap = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "mock",
      overrides: { publicCatalog: "disabled" },
      canary: [
        {
          domain: "publicCatalog",
          source: "api",
          subjectAllowlist: ["cohort-a"],
        },
      ],
      subjectKey: "cohort-a",
    });
    expect(snap.domains.publicCatalog).toBe("api");
  });

  it("emergency kill beats canary and overrides", () => {
    const snap = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "api",
      overrides: { checkout: "api" },
      canary: [{ domain: "checkout", source: "api", percent: 100 }],
      subjectKey: "any",
      emergency: [kill({ domain: "checkout", source: "disabled" })],
    });
    expect(snap.domains.checkout).toBe("disabled");
    expect(snap.domains.publicCatalog).toBe("api");
  });

  it("expired emergency is ignored", () => {
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const snap = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "api",
      nowMs: now,
      emergency: [
        kill({
          domain: "sellerFinance",
          expiresAt: "2026-07-17T11:00:00.000Z",
        }),
      ],
    });
    expect(snap.domains.sellerFinance).toBe("api");
  });

  it("live rewrites residual mock to disabled (never fixtures)", () => {
    const snap = evaluateDomainFlags({
      stage: "live",
      bootstrapSource: "api",
      overrides: { buyer: "mock" },
    });
    expect(snap.domains.buyer).toBe("disabled");
    expect(snap.domains.publicCatalog).toBe("api");
  });
});

describe("QLT-400 canary helpers", () => {
  it("canaryBucket is stable and in 0..99", () => {
    const a = canaryBucket("subj-1", "checkout");
    const b = canaryBucket("subj-1", "checkout");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  it("resolveCanarySource uses allowlist then percent", () => {
    expect(
      resolveCanarySource(
        "buyer",
        [{ domain: "buyer", subjectAllowlist: ["x"], source: "api" }],
        "x",
      ),
    ).toBe("api");
    expect(
      resolveCanarySource(
        "buyer",
        [{ domain: "buyer", subjectAllowlist: ["x"], source: "api" }],
        "y",
      ),
    ).toBeUndefined();
    expect(
      resolveCanarySource(
        "buyer",
        [{ domain: "buyer", percent: 100, source: "api" }],
        "anyone",
      ),
    ).toBe("api");
    expect(
      resolveCanarySource(
        "buyer",
        [{ domain: "buyer", percent: 0, source: "api" }],
        "anyone",
      ),
    ).toBeUndefined();
  });
});

describe("QLT-400 emergency audit + kill switch", () => {
  it("isEmergencyActive requires version/actor/reason", () => {
    expect(
      isEmergencyActive({
        domain: "checkout",
        source: "disabled",
        version: "",
        actor: "a",
        reason: "r",
      }),
    ).toBe(false);
    expect(isEmergencyActive(kill({ domain: "checkout" }))).toBe(true);
  });

  it("buildEmergencyAuditEvent is public-safe and includes SLO", () => {
    const evt = buildEmergencyAuditEvent(
      kill({
        domain: "adminWrite",
        propagationSloMs: 15_000,
      }),
      "rel-1",
      Date.parse("2026-07-17T12:00:00.000Z"),
    );
    expect(evt.kind).toBe("domain_emergency_kill");
    expect(evt.domain).toBe("adminWrite");
    expect(evt.source).toBe("disabled");
    expect(evt.version).toBe("em-1");
    expect(evt.actor).toBe("ops:test");
    expect(evt.reason).toBe("unit-test-kill");
    expect(evt.releaseId).toBe("rel-1");
    expect(evt.propagationSloMs).toBe(15_000);
    expect(evt.at).toBeTruthy();
    // no raw email/phone fields
    expect(JSON.stringify(evt)).not.toMatch(/@|password|phone/i);
  });

  it("default propagation SLO is 30s", () => {
    expect(DEFAULT_KILL_SWITCH_PROPAGATION_SLO_MS).toBe(30_000);
    const evt = buildEmergencyAuditEvent(kill({ domain: "checkout" }), "rel");
    expect(evt.propagationSloMs).toBe(30_000);
  });

  it("kill switch stops adapter path (disabled throws; other domains run)", async () => {
    const snap = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "api",
      emergency: [kill({ domain: "sellerFinance" })],
    });
    installDomainSourceSnapshot(snap);
    expect(getDomainSource("sellerFinance")).toBe("disabled");
    expect(getDomainSource("publicCatalog")).toBe("api");
    expect(() => shouldUseMockFixtures("sellerFinance")).toThrow(
      DomainDisabledError,
    );
    let mockCalled = false;
    await expect(
      withDomainSource("sellerFinance", {
        mock: () => {
          mockCalled = true;
          return "m";
        },
        api: () => "a",
      }),
    ).rejects.toBeInstanceOf(DomainDisabledError);
    expect(mockCalled).toBe(false);
    await expect(
      withDomainSource("publicCatalog", {
        mock: () => "m",
        api: () => "a",
      }),
    ).resolves.toBe("a");
  });
});

describe("QLT-400 hydration parity + telemetry", () => {
  it("SSR install matches client getDomainSource reads", () => {
    const server = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "mock",
      overrides: { publicCatalog: "api" },
      emergency: [kill({ domain: "adminWrite" })],
      version: "cfg-9",
      releaseId: "rel-9",
    });
    installDomainSourceSnapshot(server);
    expect(getDomainSource("publicCatalog")).toBe("api");
    expect(getDomainSource("adminWrite")).toBe("disabled");
    expect(getDomainSource("buyer")).toBe("mock");
  });

  it("buildDomainSourceTelemetry is public-safe", () => {
    const snap = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "api",
      version: "v2",
      releaseId: "r2",
    });
    const t = buildDomainSourceTelemetry(snap, "checkout");
    expect(t).toEqual({
      domain: "checkout",
      source: "api",
      configVersion: "v2",
      releaseId: "r2",
      stage: "prototype",
    });
  });

  it("domainSourceKeySegment embeds domain/source/version", () => {
    expect(domainSourceKeySegment("buyer", "api", "v1")).toEqual({
      domain: "buyer",
      source: "api",
      v: "v1",
    });
  });
});

describe("QLT-400 cache cleanup on source change", () => {
  it("domainsWithSourceChange lists only changed domains", () => {
    const prev = evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    });
    const next = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "api",
      emergency: [kill({ domain: "checkout" })],
    });
    expect(domainsWithSourceChange(prev, next)).toEqual(["checkout"]);
  });

  it("purgeDomainCachesOnSourceChange cancels and removes matching keys", () => {
    const cancel = vi.fn();
    const remove = vi.fn();
    const client: DomainCacheClient = {
      cancelQueries: cancel,
      removeQueries: remove,
    };
    const prev = evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    });
    const next = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "api",
      emergency: [kill({ domain: "buyer" })],
    });
    const changed = purgeDomainCachesOnSourceChange(client, prev, next);
    expect(changed).toEqual(["buyer"]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);

    const pred = cancel.mock.calls[0][0].predicate as (q: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(pred({ queryKey: ["buyer", "subj", "purchases"] })).toBe(true);
    expect(pred({ queryKey: ["public", "products", "p1", "reviews"] })).toBe(
      false,
    );
    expect(
      pred({
        queryKey: ["x", domainSourceKeySegment("buyer", "disabled", "v")],
      }),
    ).toBe(true);
  });

  it("applyDomainSourceChange skips purge when no previous snapshot", () => {
    const client: DomainCacheClient = {
      cancelQueries: vi.fn(),
      removeQueries: vi.fn(),
    };
    const next = evaluateDomainFlags({
      stage: "prototype",
      bootstrapSource: "api",
    });
    expect(applyDomainSourceChange(client, null, next)).toEqual([]);
    expect(client.cancelQueries).not.toHaveBeenCalled();
  });

  it("queryKeyTouchesDomain maps roots", () => {
    expect(queryKeyTouchesDomain(["admin", "orders"], "adminRead")).toBe(true);
    expect(
      queryKeyTouchesDomain(["seller", "s1", "finance"], "sellerFinance"),
    ).toBe(true);
    expect(queryKeyTouchesDomain(["public", "x"], "checkout")).toBe(false);
  });
});

describe("QLT-400 server-owned env parsers", () => {
  it("readServerOwnedEmergencyControls parses valid array", () => {
    const list = readServerOwnedEmergencyControls(
      JSON.stringify([
        {
          domain: "checkout",
          source: "disabled",
          version: "1",
          actor: "ops",
          reason: "incident",
        },
      ]),
    );
    expect(list).toHaveLength(1);
    expect(list[0].domain).toBe("checkout");
  });

  it("readServerOwnedEmergencyControls rejects unknown domain", () => {
    expect(() =>
      readServerOwnedEmergencyControls(
        JSON.stringify([
          {
            domain: "notADomain",
            source: "disabled",
            version: "1",
            actor: "ops",
            reason: "x",
          },
        ]),
      ),
    ).toThrow(DomainSourceConfigError);
  });

  it("readServerOwnedCanary parses allowlist + percent", () => {
    const list = readServerOwnedCanary(
      JSON.stringify([
        {
          domain: "publicCatalog",
          source: "api",
          subjectAllowlist: ["a"],
          percent: 10,
        },
      ]),
    );
    expect(list[0].percent).toBe(10);
    expect(list[0].subjectAllowlist).toEqual(["a"]);
  });

  it("unknown canary domain fails closed", () => {
    expect(() =>
      readServerOwnedCanary(JSON.stringify([{ domain: "nope" }])),
    ).toThrow(DomainSourceConfigError);
  });
});
