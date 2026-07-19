import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafePublicEnvironment,
  DEFAULT_API_INTERNAL_URL,
  getApiInternalUrl,
  getBrowserApiBaseUrl,
  getBrowserApiTopology,
  publicEnv,
  requireApiBaseUrl,
  requireApiInternalUrl,
  resolveApiProxyTarget,
} from "@/shared/config/env";

const envKeys = [
  "NEXT_PUBLIC_DATA_SOURCE",
  "NEXT_PUBLIC_APP_STAGE",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_MOCK_SCENARIO",
  "API_INTERNAL_URL",
  "API_PROXY_TARGET",
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("public environment contract", () => {
  it("defaults to the deterministic mock prototype", () => {
    delete process.env.NEXT_PUBLIC_DATA_SOURCE;
    delete process.env.NEXT_PUBLIC_APP_STAGE;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_MOCK_SCENARIO;
    delete process.env.API_INTERNAL_URL;

    expect(publicEnv.dataSource).toBe("mock");
    expect(publicEnv.appStage).toBe("prototype");
    expect(publicEnv.mockScenario).toBe("default");
    expect(publicEnv.apiUrl).toBeUndefined();
    expect(getBrowserApiTopology()).toBe("same-origin");
    expect(getBrowserApiBaseUrl()).toBe("");
    expect(requireApiBaseUrl()).toBe("");
    expect(() => assertSafePublicEnvironment()).not.toThrow();
  });

  it("rejects unknown source and stage values", () => {
    process.env.NEXT_PUBLIC_DATA_SOURCE = "fixture";
    expect(() => publicEnv.dataSource).toThrow(/Expected "mock" or "api"/);

    process.env.NEXT_PUBLIC_DATA_SOURCE = "mock";
    process.env.NEXT_PUBLIC_APP_STAGE = "staging";
    expect(() => publicEnv.appStage).toThrow(/Expected "prototype" or "live"/);
  });

  it("uses same-origin relative base without NEXT_PUBLIC_API_URL", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_DATA_SOURCE = "api";
    process.env.NEXT_PUBLIC_APP_STAGE = "prototype";

    expect(getBrowserApiTopology()).toBe("same-origin");
    expect(getBrowserApiBaseUrl()).toBe("");
    expect(requireApiBaseUrl()).toBe("");
    expect(() => assertSafePublicEnvironment()).not.toThrow();
  });

  it("supports deprecated absolute NEXT_PUBLIC_API_URL for cross-origin escape hatch", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/v1";
    expect(getBrowserApiTopology()).toBe("absolute");
    expect(getBrowserApiBaseUrl()).toBe("https://api.example.test/v1");
    expect(requireApiBaseUrl()).toBe("https://api.example.test/v1");
  });

  it("rejects invalid absolute NEXT_PUBLIC_API_URL", () => {
    process.env.NEXT_PUBLIC_API_URL = "not a URL";
    expect(() => getBrowserApiBaseUrl()).toThrow(/absolute http/);
    expect(() => assertSafePublicEnvironment()).toThrow(/absolute http/);
  });

  it("rejects unsafe live mock mode", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_APP_STAGE = "live";
    process.env.NEXT_PUBLIC_DATA_SOURCE = "mock";
    process.env.API_INTERNAL_URL = "http://api:8080";
    expect(() => assertSafePublicEnvironment()).toThrow(/prototype-only/);
  });

  it("supports explicit mock scenarios", () => {
    process.env.NEXT_PUBLIC_MOCK_SCENARIO = "empty";
    expect(publicEnv.mockScenario).toBe("empty");
  });
});

describe("server-only API_INTERNAL_URL (INT-030)", () => {
  it("defaults to compose host port when unset in prototype", () => {
    delete process.env.API_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_APP_STAGE;
    expect(getApiInternalUrl()).toBe(DEFAULT_API_INTERNAL_URL);
    expect(resolveApiProxyTarget()).toBe("http://127.0.0.1:18080");
  });

  it("normalizes configured internal URL", () => {
    process.env.API_INTERNAL_URL = "http://api:8080/";
    expect(getApiInternalUrl()).toBe("http://api:8080");
    expect(requireApiInternalUrl()).toBe("http://api:8080");
    expect(resolveApiProxyTarget()).toBe("http://api:8080");
  });

  it("rejects empty internal URL on live", () => {
    process.env.NEXT_PUBLIC_APP_STAGE = "live";
    process.env.NEXT_PUBLIC_DATA_SOURCE = "api";
    delete process.env.API_INTERNAL_URL;

    expect(() => getApiInternalUrl()).toThrow(/API_INTERNAL_URL is required/);
    expect(() => requireApiInternalUrl()).toThrow(
      /API_INTERNAL_URL is required/,
    );
    expect(() => assertSafePublicEnvironment()).toThrow(
      /API_INTERNAL_URL is required/,
    );
  });

  it("rejects mock/placeholder internal URL on live", () => {
    process.env.NEXT_PUBLIC_APP_STAGE = "live";
    process.env.NEXT_PUBLIC_DATA_SOURCE = "api";
    process.env.API_INTERNAL_URL = "http://mock.example.test";

    expect(() => requireApiInternalUrl()).toThrow(/mock\/placeholder/);
    expect(() => assertSafePublicEnvironment()).toThrow(/mock\/placeholder/);
  });

  it("rejects placeholder internal URL in prototype api mode when set", () => {
    process.env.NEXT_PUBLIC_APP_STAGE = "prototype";
    process.env.NEXT_PUBLIC_DATA_SOURCE = "api";
    process.env.API_INTERNAL_URL = "http://fake.example.com";

    expect(() => assertSafePublicEnvironment()).toThrow(/mock\/placeholder/);
  });

  it("accepts live + api with real internal URL", () => {
    process.env.NEXT_PUBLIC_APP_STAGE = "live";
    process.env.NEXT_PUBLIC_DATA_SOURCE = "api";
    process.env.API_INTERNAL_URL = "http://api:8080";
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(() => assertSafePublicEnvironment()).not.toThrow();
    expect(getApiInternalUrl()).toBe("http://api:8080");
    expect(getBrowserApiBaseUrl()).toBe("");
  });

  it("does not expose API_INTERNAL_URL on publicEnv", () => {
    process.env.API_INTERNAL_URL = "http://api:8080";
    expect(
      Object.getOwnPropertyNames(publicEnv).includes("apiInternalUrl"),
    ).toBe(false);
    expect("API_INTERNAL_URL" in publicEnv).toBe(false);
    // publicEnv only surfaces NEXT_PUBLIC_* keys
    expect(publicEnv.apiUrl).toBeUndefined();
  });

  it("rejects invalid internal URL strings", () => {
    process.env.API_INTERNAL_URL = "not-a-url";
    expect(() => getApiInternalUrl()).toThrow(/absolute http/);
  });
});
