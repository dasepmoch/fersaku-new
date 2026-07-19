import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checksumSha256Schema,
  objectMetaDtoSchema,
  objectMetaEnvelopeSchema,
  objectUploadEnvelopeSchema,
  objectUploadRequestSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { queryKeyLooksSensitive } from "@/shared/query/query-policy";
import {
  completeStoreObjectUpload,
  createStoreObjectUpload,
  getStoreObjectMeta,
  putToPresignedUrl,
  runStoreObjectUpload,
} from "@/features/seller/objects/api";
import {
  assertNoSecretsInObjectMeta,
  mapObjectMetaDto,
  redactObjectSecretsForLog,
} from "@/features/seller/objects/mappers";
import {
  isMimeAllowedForPurpose,
  maxBytesForPurpose,
  validateClientFile,
} from "@/features/seller/objects/validate";
import { bufferToHex, normalizeChecksumHex } from "@/features/seller/objects/checksum";
import {
  PRODUCT_FILE_MAX_BYTES,
  PUBLIC_ASSET_MAX_BYTES,
} from "@/features/seller/objects/contracts";

const apiRequestMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/api/http-client")
  >("@/shared/api/http-client");
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

const meta = {
  requestId: "req_sel230",
  timestamp: "2026-07-17T10:00:00Z",
};

const objectDto = {
  id: "obj_live_1",
  purpose: "PRODUCT_FILE",
  visibility: "PRIVATE" as const,
  contentType: "application/zip",
  expectedSizeBytes: 1024,
  sizeBytes: 1024,
  checksumSha256: "b".repeat(64),
  status: "READY" as const,
  storeId: "store_live",
  merchantId: "merch_1",
  createdAt: "2026-07-17T09:00:00Z",
  updatedAt: "2026-07-17T09:05:00Z",
};

function installApiSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
});

describe("SEL-230 schemas", () => {
  it("parses upload request and meta envelope", () => {
    const req = objectUploadRequestSchema.parse({
      purpose: "PRODUCT_FILE",
      contentType: "application/zip",
      sizeBytes: 100,
      expectedChecksumSha256: "a".repeat(64),
    });
    expect(req.purpose).toBe("PRODUCT_FILE");

    const env = objectMetaEnvelopeSchema.parse({
      data: objectDto,
      meta,
    });
    expect(env.data.id).toBe("obj_live_1");
    expect(env.data.status).toBe("READY");
  });

  it("parses upload envelope including secret uploadUrl (wire only)", () => {
    const env = objectUploadEnvelopeSchema.parse({
      data: {
        object: { ...objectDto, status: "UPLOADING" },
        uploadUrl: "https://r2.example/presign?X-Amz-Signature=secret",
        uploadExpires: "2026-07-17T10:15:00Z",
        method: "PUT",
      },
      meta,
    });
    expect(env.data.uploadUrl).toContain("presign");
    expect(env.data.method).toBe("PUT");
  });

  it("validates lowercase hex checksum", () => {
    expect(checksumSha256Schema.parse("a".repeat(64))).toHaveLength(64);
    expect(() => checksumSha256Schema.parse("ZZ".repeat(32))).toThrow();
  });
});

describe("SEL-230 client validation", () => {
  it("enforces size and MIME bounds per purpose", () => {
    expect(maxBytesForPurpose("PRODUCT_FILE")).toBe(PRODUCT_FILE_MAX_BYTES);
    expect(maxBytesForPurpose("PUBLIC_ASSET")).toBe(PUBLIC_ASSET_MAX_BYTES);
    expect(isMimeAllowedForPurpose("PUBLIC_ASSET", "image/png")).toBe(true);
    expect(isMimeAllowedForPurpose("PUBLIC_ASSET", "application/zip")).toBe(
      false,
    );
    expect(isMimeAllowedForPurpose("PRODUCT_FILE", "text/html")).toBe(false);
    expect(isMimeAllowedForPurpose("PRODUCT_FILE", "application/zip")).toBe(
      true,
    );

    const huge = new File([new Uint8Array(10)], "x.zip", {
      type: "application/zip",
    });
    Object.defineProperty(huge, "size", { value: PRODUCT_FILE_MAX_BYTES + 1 });
    expect(validateClientFile(huge, "PRODUCT_FILE")?.kind).toBe("size");

    const html = new File(["<html>"], "x.html", { type: "text/html" });
    expect(validateClientFile(html, "PRODUCT_FILE")?.kind).toBe("mime");
  });
});

describe("SEL-230 mappers / redaction", () => {
  it("maps meta without storage secrets", () => {
    const view = mapObjectMetaDto(objectMetaDtoSchema.parse(objectDto));
    expect(view.id).toBe("obj_live_1");
    expect(view.status).toBe("READY");
    assertNoSecretsInObjectMeta(view);
    expect(JSON.stringify(view)).not.toMatch(/uploadUrl|presign|bucket/i);
  });

  it("redacts signed URLs for logs", () => {
    const redacted = redactObjectSecretsForLog({
      objectId: "obj_1",
      uploadUrl: "https://r2.example/put?X-Amz-Signature=abc",
      status: "UPLOADING",
    });
    expect(redacted.uploadUrl).toBe("[redacted]");
    expect(redacted.objectId).toBe("obj_1");
  });

  it("checksum helpers normalize hex", () => {
    expect(normalizeChecksumHex("  AbCd  ")).toBe("abcd");
    const buf = new Uint8Array([0x0a, 0xff]).buffer;
    expect(bufferToHex(buf)).toBe("0aff");
  });
});

describe("SEL-230 query keys — no secrets", () => {
  it("objectMeta key uses opaque ids only", () => {
    const key = queryKeys.seller.objectMeta("store_live", "obj_live_1");
    expect(key).toEqual([
      "seller",
      "store_live",
      "objects",
      "obj_live_1",
      "meta",
    ]);
    expect(queryKeyLooksSensitive(key)).toBe(false);
    expect(JSON.stringify(key)).not.toMatch(
      /uploadUrl|downloadUrl|presign|http|checksum/i,
    );
  });

  it("mutation keys never embed signed URLs", () => {
    const keys = [
      ["seller", "objects", "presign"],
      ["seller", "objects", "complete"],
      ["seller", "objects", "upload"],
    ] as const;
    for (const k of keys) {
      expect(queryKeyLooksSensitive(k)).toBe(false);
      expect(JSON.stringify(k)).not.toMatch(/https?:|Signature|presign-url/i);
    }
  });
});

describe("SEL-230 API adapters", () => {
  it("presign posts correct path/body and returns intent with uploadUrl only in memory", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        object: { ...objectDto, status: "UPLOADING", sizeBytes: undefined },
        uploadUrl: "https://storage.example/put?sig=SECRET_TOKEN",
        uploadExpires: "2026-07-17T10:15:00Z",
        method: "PUT",
      },
      meta,
    });

    const intent = await createStoreObjectUpload({
      storeId: "store/live",
      purpose: "PRODUCT_FILE",
      contentType: "application/zip",
      sizeBytes: 1024,
      expectedChecksumSha256: "c".repeat(64),
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store%2Flive/objects/uploads");
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual({
      purpose: "PRODUCT_FILE",
      contentType: "application/zip",
      sizeBytes: 1024,
      expectedChecksumSha256: "c".repeat(64),
    });
    expect(intent.object.id).toBe("obj_live_1");
    expect(intent.uploadUrl).toContain("SECRET_TOKEN");
    assertNoSecretsInObjectMeta(intent.object);
  });

  it("complete posts checksum and maps READY status", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: objectDto,
      meta,
    });

    const result = await completeStoreObjectUpload({
      storeId: "store_a",
      objectId: "obj_1",
      checksumSha256: "b".repeat(64),
    });

    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe(
      "/v1/stores/store_a/objects/obj_1/complete",
    );
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual({ checksumSha256: "b".repeat(64) });
    expect(result.status).toBe("READY");
    expect(result.id).toBe("obj_live_1");
  });

  it("getObjectMeta encodes ids and returns null on 404", async () => {
    installApiSeller();
    const { ApiError } = await import("@/shared/api/api-error");
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "NOT_FOUND",
        message: "gone",
        requestId: "r1",
      }),
    );
    await expect(
      getStoreObjectMeta({ storeId: "s1", objectId: "missing" }),
    ).resolves.toBeNull();

    apiRequestMock.mockResolvedValueOnce({ data: objectDto, meta });
    const found = await getStoreObjectMeta({
      storeId: "s/1",
      objectId: "o/1",
    });
    expect(apiRequestMock.mock.calls.at(-1)![0]).toBe(
      "/v1/stores/s%2F1/objects/o%2F1",
    );
    expect(found?.id).toBe("obj_live_1");
  });

  it("direct PUT uses fetch to signed URL with content type (not apiRequest)", async () => {
    installApiSeller();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    await putToPresignedUrl(
      "https://storage.example/put?sig=x",
      new Blob(["hello"]),
      { contentType: "application/zip" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://storage.example/put?sig=x");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("application/zip");
  });

  it("mock path never calls apiRequest for presign/complete/run", async () => {
    installMockSeller();

    const intent = await createStoreObjectUpload({
      storeId: "store_mock",
      purpose: "PRODUCT_FILE",
      contentType: "application/zip",
      sizeBytes: 10,
    });
    expect(intent.object.storeId).toBe("store_mock");
    expect(intent.object.status).toBe("UPLOADING");

    const done = await completeStoreObjectUpload({
      storeId: "store_mock",
      objectId: intent.object.id,
      checksumSha256: "d".repeat(64),
    });
    expect(done.status).toBe("READY");

    const file = new File([new Uint8Array([1, 2, 3])], "pack.zip", {
      type: "application/zip",
    });
    // Mock crypto.subtle if needed
    const digest = new Uint8Array(32).fill(1);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockResolvedValue(digest.buffer),
      },
    });

    const uploaded = await runStoreObjectUpload({
      storeId: "store_mock",
      purpose: "PRODUCT_FILE",
      file,
    });
    expect(uploaded.status).toBe("READY");
    expect(uploaded.id).toBeTruthy();
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runStoreObjectUpload api path: presign → PUT → complete", async () => {
    installApiSeller();
    const digest = new Uint8Array(32).fill(2);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockResolvedValue(digest.buffer),
      },
    });

    apiRequestMock
      .mockResolvedValueOnce({
        data: {
          object: {
            ...objectDto,
            id: "obj_new",
            status: "UPLOADING",
            sizeBytes: undefined,
            checksumSha256: undefined,
          },
          uploadUrl: "https://storage.example/put?sig=LIVE",
          uploadExpires: "2026-07-17T10:15:00Z",
          method: "PUT",
        },
        meta,
      })
      .mockResolvedValueOnce({
        data: {
          ...objectDto,
          id: "obj_new",
          status: "READY",
          checksumSha256: bufferToHex(digest.buffer),
        },
        meta,
      });

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const file = new File([new Uint8Array([9, 8, 7])], "asset.zip", {
      type: "application/zip",
    });
    const result = await runStoreObjectUpload({
      storeId: "store_live",
      purpose: "PRODUCT_FILE",
      file,
      waitUntilReady: false,
    });

    expect(result.id).toBe("obj_new");
    expect(result.status).toBe("READY");
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock.mock.calls[0]![0]).toContain("/objects/uploads");
    expect(apiRequestMock.mock.calls[1]![0]).toContain(
      "/objects/obj_new/complete",
    );
  });
});
