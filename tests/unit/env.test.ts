import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafePublicEnvironment,
  publicEnv,
  requireApiBaseUrl,
} from "@/shared/config/env";

const envKeys = [
  "NEXT_PUBLIC_DATA_SOURCE",
  "NEXT_PUBLIC_APP_STAGE",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_MOCK_SCENARIO",
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

    expect(publicEnv.dataSource).toBe("mock");
    expect(publicEnv.appStage).toBe("prototype");
    expect(publicEnv.mockScenario).toBe("default");
    expect(publicEnv.apiUrl).toBeUndefined();
    expect(requireApiBaseUrl()).toBe("http://localhost:8080");
    expect(() => assertSafePublicEnvironment()).not.toThrow();
  });

  it("rejects unknown source and stage values", () => {
    process.env.NEXT_PUBLIC_DATA_SOURCE = "fixture";
    expect(() => publicEnv.dataSource).toThrow(/Expected "mock" or "api"/);

    process.env.NEXT_PUBLIC_DATA_SOURCE = "mock";
    process.env.NEXT_PUBLIC_APP_STAGE = "staging";
    expect(() => publicEnv.appStage).toThrow(/Expected "prototype" or "live"/);
  });

  it("requires an absolute API URL for live or API mode", () => {
    process.env.NEXT_PUBLIC_API_URL = "not a URL";
    expect(() => requireApiBaseUrl()).toThrow(/absolute URL/);

    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_DATA_SOURCE = "api";
    expect(() => requireApiBaseUrl()).toThrow(/required in API data-source/);

    process.env.NEXT_PUBLIC_DATA_SOURCE = "mock";
    process.env.NEXT_PUBLIC_APP_STAGE = "live";
    expect(() => requireApiBaseUrl()).toThrow(/required in API data-source/);
  });

  it("normalizes valid API URLs and rejects unsafe live mock mode", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/v1";
    expect(requireApiBaseUrl()).toBe("https://api.example.test/v1");

    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_APP_STAGE = "live";
    process.env.NEXT_PUBLIC_DATA_SOURCE = "mock";
    expect(() => assertSafePublicEnvironment()).toThrow(/prototype-only/);
  });

  it("supports explicit mock scenarios", () => {
    process.env.NEXT_PUBLIC_MOCK_SCENARIO = "empty";
    expect(publicEnv.mockScenario).toBe("empty");
  });
});
