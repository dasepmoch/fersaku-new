export type DataSource = "mock" | "api";
export type AppStage = "prototype" | "live";

function readDataSource(): DataSource {
  const value = process.env.NEXT_PUBLIC_DATA_SOURCE || "mock";
  if (value === "mock" || value === "api") return value;
  throw new Error(
    `Invalid NEXT_PUBLIC_DATA_SOURCE=${value}. Expected "mock" or "api".`,
  );
}

function readAppStage(): AppStage {
  const value = process.env.NEXT_PUBLIC_APP_STAGE || "prototype";
  if (value === "prototype" || value === "live") return value;
  throw new Error(
    `Invalid NEXT_PUBLIC_APP_STAGE=${value}. Expected "prototype" or "live".`,
  );
}

export const publicEnv = {
  get dataSource(): DataSource {
    return readDataSource();
  },
  get appStage(): AppStage {
    return readAppStage();
  },
  get apiUrl(): string | undefined {
    return process.env.NEXT_PUBLIC_API_URL || undefined;
  },
  get mockScenario(): string {
    return process.env.NEXT_PUBLIC_MOCK_SCENARIO || "default";
  },
};

export function requireApiBaseUrl(): string {
  const apiUrl = publicEnv.apiUrl;
  if (apiUrl) {
    try {
      return new URL(apiUrl).toString();
    } catch {
      throw new Error("NEXT_PUBLIC_API_URL must be an absolute URL.");
    }
  }

  if (publicEnv.dataSource === "api" || publicEnv.appStage === "live") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is required in API data-source or live stage.",
    );
  }

  return "http://localhost:8080";
}

export function assertSafePublicEnvironment() {
  if (publicEnv.appStage === "live" && publicEnv.dataSource !== "api") {
    throw new Error(
      'Live deployments must use NEXT_PUBLIC_DATA_SOURCE="api". Mock mode is prototype-only.',
    );
  }
  if (publicEnv.dataSource === "api") requireApiBaseUrl();
}
