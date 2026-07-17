/**
 * Store-scoped object upload lifecycle adapters (SEL-230).
 * Product/public assets only — never personal avatar (INT-175).
 *
 * Flow: presign → direct PUT to signed URL → complete → poll READY.
 * Signed URLs never enter React Query keys or localStorage.
 */

import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  objectCompleteRequestSchema,
  objectMetaEnvelopeSchema,
  objectUploadEnvelopeSchema,
  objectUploadRequestSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  CompleteStoreObjectUploadInput,
  CreateStoreObjectUploadInput,
  GetStoreObjectMetaInput,
  RunStoreObjectUploadInput,
  StoreObjectMeta,
  StoreObjectUploadIntent,
} from "./contracts";
import {
  OBJECT_SCAN_POLL_INTERVAL_MS,
  OBJECT_SCAN_POLL_MAX_ATTEMPTS,
} from "./contracts";
import { sha256HexOfFile } from "./checksum";
import {
  assertNoSecretsInObjectMeta,
  mapObjectMetaDto,
} from "./mappers";
import { mockObjectMeta, mockUploadIntent } from "./mock";
import { validateClientFile } from "./validate";

type UploadEnvelope = z.infer<typeof objectUploadEnvelopeSchema>;
type MetaEnvelope = z.infer<typeof objectMetaEnvelopeSchema>;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * POST upload intent + short-lived presigned PUT URL.
 * Caller must use uploadUrl only for immediate PUT, then drop it.
 */
export async function createStoreObjectUpload(
  input: CreateStoreObjectUploadInput,
  signal?: AbortSignal,
): Promise<StoreObjectUploadIntent> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return mockUploadIntent(input.storeId, {
      purpose: input.purpose,
      contentType: input.contentType,
      expectedSizeBytes: input.sizeBytes,
      status: "UPLOADING",
    });
  }

  const body = objectUploadRequestSchema.parse({
    purpose: input.purpose,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    ...(input.expectedChecksumSha256
      ? { expectedChecksumSha256: input.expectedChecksumSha256 }
      : {}),
  });

  const response = await apiRequest<UploadEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/objects/uploads`,
    {
      method: "POST",
      body,
      schema: objectUploadEnvelopeSchema,
      signal,
    },
  );

  const object = mapObjectMetaDto(response.data.object);
  assertNoSecretsInObjectMeta(object);

  return {
    object,
    uploadUrl: response.data.uploadUrl,
    uploadExpires: response.data.uploadExpires,
    method: response.data.method || "PUT",
  };
}

/**
 * Direct PUT to presigned URL (not via Next / apiRequest).
 * Do not set multipart Content-Type; send declared content type only.
 */
export async function putToPresignedUrl(
  uploadUrl: string,
  file: Blob,
  options: { contentType: string; signal?: AbortSignal },
): Promise<void> {
  if (!uploadUrl) {
    // Mock path: no real storage PUT.
    return;
  }
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": options.contentType,
    },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status, {
      code: "UPLOAD_PUT_FAILED",
      message: `Direct upload failed (${response.status})`,
      requestId: "client-put",
    });
  }
}

/**
 * POST complete with checksum after successful PUT.
 * Maps READY / REJECTED / (possible SCANNING residual) from object meta.
 */
export async function completeStoreObjectUpload(
  input: CompleteStoreObjectUploadInput,
  signal?: AbortSignal,
): Promise<StoreObjectMeta> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return mockObjectMeta(input.storeId, {
      id: input.objectId,
      checksumSha256: input.checksumSha256,
      status: "READY",
    });
  }

  const body = objectCompleteRequestSchema.parse({
    checksumSha256: input.checksumSha256,
  });

  const response = await apiRequest<MetaEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/objects/${encodeURIComponent(input.objectId)}/complete`,
    {
      method: "POST",
      body,
      schema: objectMetaEnvelopeSchema,
      signal,
    },
  );

  const meta = mapObjectMetaDto(response.data);
  assertNoSecretsInObjectMeta(meta);
  return meta;
}

/** GET object metadata (safe to cache by opaque objectId). */
export async function getStoreObjectMeta(
  input: GetStoreObjectMetaInput,
  signal?: AbortSignal,
): Promise<StoreObjectMeta | null> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return mockObjectMeta(input.storeId, { id: input.objectId });
  }

  try {
    const response = await apiRequest<MetaEnvelope>(
      `/v1/stores/${encodeURIComponent(input.storeId)}/objects/${encodeURIComponent(input.objectId)}`,
      {
        schema: objectMetaEnvelopeSchema,
        signal,
      },
    );
    const meta = mapObjectMetaDto(response.data);
    assertNoSecretsInObjectMeta(meta);
    return meta;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Poll metadata until READY|REJECTED|EXPIRED or attempts exhausted.
 * Does not invent UI; callers map status to existing feedback.
 */
export async function pollStoreObjectUntilTerminal(
  storeId: string,
  objectId: string,
  signal?: AbortSignal,
): Promise<StoreObjectMeta> {
  let last: StoreObjectMeta | null = null;
  for (let i = 0; i < OBJECT_SCAN_POLL_MAX_ATTEMPTS; i += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    last = await getStoreObjectMeta({ storeId, objectId }, signal);
    if (!last) {
      throw new ApiError(404, {
        code: "NOT_FOUND",
        message: "Object not found",
        requestId: "client-poll",
      });
    }
    if (
      last.status === "READY" ||
      last.status === "REJECTED" ||
      last.status === "EXPIRED"
    ) {
      return last;
    }
    await sleep(OBJECT_SCAN_POLL_INTERVAL_MS, signal);
  }
  if (!last) {
    throw new ApiError(408, {
      code: "SCAN_TIMEOUT",
      message: "Object scan did not complete in time",
      requestId: "client-poll",
    });
  }
  return last;
}

/**
 * Full product/public asset upload lifecycle.
 * Returns opaque object meta only (no uploadUrl retained).
 */
export async function runStoreObjectUpload(
  input: RunStoreObjectUploadInput,
  signal?: AbortSignal,
): Promise<StoreObjectMeta> {
  const validation = validateClientFile(input.file, input.purpose);
  if (validation) {
    throw new ApiError(400, {
      code: "VALIDATION_FAILED",
      message: validation.message,
      requestId: "client-validate",
      details: { fields: [{ field: "file", code: validation.kind }] },
    });
  }

  const contentType =
    input.file.type?.trim() || "application/octet-stream";
  const checksum = await sha256HexOfFile(input.file, signal);

  const intent = await createStoreObjectUpload(
    {
      storeId: input.storeId,
      purpose: input.purpose,
      contentType,
      sizeBytes: input.file.size,
      expectedChecksumSha256: checksum,
    },
    signal,
  );

  try {
    if (!shouldUseMockFixtures("sellerCatalog")) {
      await putToPresignedUrl(intent.uploadUrl, input.file, {
        contentType,
        signal,
      });
    }

    let meta = await completeStoreObjectUpload(
      {
        storeId: input.storeId,
        objectId: intent.object.id,
        checksumSha256: checksum,
      },
      signal,
    );

    const wait = input.waitUntilReady !== false;
    if (
      wait &&
      (meta.status === "SCANNING" || meta.status === "UPLOADING")
    ) {
      meta = await pollStoreObjectUntilTerminal(
        input.storeId,
        intent.object.id,
        signal,
      );
    }

    assertNoSecretsInObjectMeta(meta);
    return meta;
  } finally {
    // Drop reference to secret URL as soon as possible (GC).
    (intent as { uploadUrl?: string }).uploadUrl = undefined;
  }
}
