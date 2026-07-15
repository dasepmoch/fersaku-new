import type { ApiProblem } from "./contracts";

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ApiProblem,
  ) {
    super(problem.message);
    this.name = "ApiError";
  }
}

type RequestOptions<TBody> = Omit<RequestInit, "body"> & {
  body?: TBody;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
};

function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
}

function buildUrl(pathname: string, query?: RequestOptions<never>["query"]) {
  const url = new URL(pathname, apiBaseUrl());
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined)
      url.searchParams.set(key, String(value));
  });
  return url;
}

export async function apiRequest<TResponse, TBody = never>(
  pathname: string,
  options: RequestOptions<TBody> = {},
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");

  try {
    const response = await fetch(buildUrl(pathname, options.query), {
      ...options,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "include",
      headers,
      signal: options.signal || controller.signal,
    });

    if (!response.ok) {
      const problem = (await response
        .json()
        .catch(() => null)) as ApiProblem | null;
      throw new ApiError(
        response.status,
        problem || {
          code: "HTTP_ERROR",
          message: `Request failed with status ${response.status}`,
        },
      );
    }
    if (response.status === 204) return undefined as TResponse;
    return (await response.json()) as TResponse;
  } finally {
    clearTimeout(timeout);
  }
}
