import type { ZodType } from "zod";
import { requireApiBaseUrl } from "@/shared/config/env";
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

export type RequestOptions<TBody, TResponse> = Omit<
  RequestInit,
  "body" | "signal"
> & {
  body?: TBody;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  schema?: ZodType<TResponse>;
  requestId?: string;
  csrfToken?: string;
  idempotencyKey?: string;
  auditReason?: string;
  recentMfaProof?: string;
};

function apiBaseUrl() {
  return requireApiBaseUrl();
}

export function buildApiUrl(
  pathname: string,
  query?: RequestOptions<never, never>["query"],
) {
  const url = new URL(pathname, apiBaseUrl());
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined)
      url.searchParams.set(key, String(value));
  });
  return url;
}

let fallbackRequestSequence = 0;

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackRequestSequence += 1;
  return `web_req_${fallbackRequestSequence.toString(36)}`;
}

function combineAbortSignals(signals: AbortSignal[]) {
  if (signals.length === 1) return { signal: signals[0], cleanup: () => {} };

  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();

  for (const source of signals) {
    const forward = () => {
      if (!controller.signal.aborted) controller.abort(source.reason);
    };
    if (source.aborted) {
      forward();
      break;
    }
    listeners.set(source, forward);
    source.addEventListener("abort", forward, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      listeners.forEach((listener, source) =>
        source.removeEventListener("abort", listener),
      );
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.ok ? 502 : response.status, {
      code: "INVALID_JSON_RESPONSE",
      message: "The API returned an invalid JSON response.",
      requestId: response.headers.get("x-request-id") || undefined,
    });
  }
}

export async function apiRequest<TResponse, TBody = never>(
  pathname: string,
  options: RequestOptions<TBody, TResponse> = {},
): Promise<TResponse> {
  const {
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    schema,
    requestId = createRequestId(),
    csrfToken,
    idempotencyKey,
    auditReason,
    recentMfaProof,
    body,
    headers: requestHeaders,
    ...requestInit
  } = options;
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(
      new DOMException("The request timed out.", "TimeoutError"),
    );
  }, timeoutMs);
  const combined = combineAbortSignals(
    [callerSignal, timeoutController.signal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    ),
  );
  const headers = new Headers(requestHeaders);
  headers.set("Accept", "application/json");
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (!headers.has("X-Request-ID")) headers.set("X-Request-ID", requestId);
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  if (auditReason) headers.set("X-Audit-Reason", auditReason);
  if (recentMfaProof) headers.set("X-Recent-MFA", recentMfaProof);

  try {
    const response = await fetch(buildApiUrl(pathname, query), {
      ...requestInit,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      headers,
      signal: combined.signal,
    });

    if (!response.ok) {
      const payload = await readJson(response).catch((error: unknown) => {
        if (error instanceof ApiError) return null;
        throw error;
      });
      const problem =
        payload && typeof payload === "object"
          ? (payload as Partial<ApiProblem>)
          : null;
      throw new ApiError(
        response.status,
        problem?.code && problem?.message
          ? {
              code: problem.code,
              message: problem.message,
              details: problem.details,
              requestId: problem.requestId || requestId,
            }
          : {
              code: "HTTP_ERROR",
              message: `Request failed with status ${response.status}`,
              requestId,
            },
      );
    }
    if (response.status === 204) return undefined as TResponse;
    const payload = await readJson(response);
    if (!schema) return payload as TResponse;

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(502, {
        code: "INVALID_API_CONTRACT",
        message: "The API response did not match the expected contract.",
        details: { issues: parsed.error.issues },
        requestId,
      });
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError(408, {
        code: "REQUEST_TIMEOUT",
        message: `The API request exceeded ${timeoutMs}ms.`,
        requestId,
      });
    }
    if (callerSignal?.aborted) {
      throw new ApiError(499, {
        code: "REQUEST_ABORTED",
        message: "The API request was cancelled.",
        requestId,
      });
    }
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "The API request could not reach the server.",
      requestId,
    });
  } finally {
    clearTimeout(timeout);
    combined.cleanup();
  }
}
