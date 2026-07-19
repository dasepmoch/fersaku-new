import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  buyerSessionDtoSchema,
  buyerSessionListEnvelopeSchema,
  buyerSessionRevokeEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  formatSessionActiveLabel,
  mapBuyerSessionDto,
  mapBuyerSessionListDto,
  sanitizeSessionDisplayText,
} from "@/features/buyer/data/mappers";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";

const meta = {
  requestId: "req_buy130",
  timestamp: "2026-07-17T10:00:00Z",
};

const sessionDto = {
  id: "ses_current",
  surface: "BUYER",
  createdAt: "2026-07-17T08:00:00Z",
  lastSeenAt: "2026-07-17T09:59:30Z",
  expiresAt: "2026-07-18T08:00:00Z",
  current: true,
  mfaVerified: false,
  deviceLabel: "Chrome di Linux",
};

const otherDto = {
  id: "ses_mobile",
  surface: "BUYER",
  createdAt: "2026-07-17T06:00:00Z",
  lastSeenAt: "2026-07-17T07:00:00Z",
  expiresAt: "2026-07-18T06:00:00Z",
  current: false,
  deviceLabel: "Chrome di Android",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_buy130",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_buy130",
      },
    },
    status,
  );
}

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadApiMode() {
  vi.resetModules();
  const domain = await import("@/shared/data/domain-source");
  vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
  vi.spyOn(domain, "getDomainSource").mockReturnValue("api");
  return import("@/features/buyer/data/api");
}

describe("BUY-130 buyer session schemas", () => {
  it("parses session list envelope { sessions: [...] }", () => {
    const parsed = buyerSessionListEnvelopeSchema.parse({
      data: { sessions: [sessionDto, otherDto] },
      meta,
    });
    expect(parsed.data.sessions).toHaveLength(2);
    expect(parsed.data.sessions[0].current).toBe(true);
    expect(buyerSessionDtoSchema.parse(sessionDto).id).toBe("ses_current");
  });

  it("parses revoke results", () => {
    expect(
      buyerSessionRevokeEnvelopeSchema.parse({
        data: { revoked: true },
        meta,
      }).data.revoked,
    ).toBe(true);
    expect(
      buyerSessionRevokeEnvelopeSchema.parse({
        data: { revokedCount: 2 },
        meta,
      }).data.revokedCount,
    ).toBe(2);
  });
});

describe("BUY-130 session mappers", () => {
  it("maps SessionView to BuyerSession; current from backend only", () => {
    const now = Date.parse("2026-07-17T10:00:00Z");
    const view = mapBuyerSessionDto(sessionDto);
    expect(view.id).toBe("ses_current");
    expect(view.device).toBe("Chrome di Linux");
    expect(view.current).toBe(true);
    expect(view.location).toBe("—");
    expect(view.ip).toBe("—");
    expect(view.active).toBe(
      formatSessionActiveLabel(sessionDto.lastSeenAt, now),
    );
  });

  it("sanitizes untrusted device text and masks empty label", () => {
    expect(sanitizeSessionDisplayText("Chrome\u0000 di Android")).toBe(
      "Chrome di Android",
    );
    const unknown = mapBuyerSessionDto({
      ...otherDto,
      deviceLabel: "",
    });
    expect(unknown.device).toBe("Perangkat tidak dikenal");
  });

  it("maps list and preserves current flags from server", () => {
    const list = mapBuyerSessionListDto([sessionDto, otherDto]);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(list.find((s) => s.id === "ses_mobile")?.current).toBe(false);
  });

  it("formats relative active labels", () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    expect(formatSessionActiveLabel("2026-07-17T11:59:30Z", now)).toBe(
      "Sekarang",
    );
    expect(formatSessionActiveLabel("2026-07-17T10:00:00Z", now)).toBe(
      "2 jam lalu",
    );
    expect(formatSessionActiveLabel("2026-07-12T12:00:00Z", now)).toBe(
      "5 hari lalu",
    );
  });
});

describe("BUY-130 query key subject boundary", () => {
  it("isolates sessions by subject:session", () => {
    expect(queryKeys.buyer.sessions("a:s1")).not.toEqual(
      queryKeys.buyer.sessions("b:s1"),
    );
    expect(queryKeys.buyer.sessions("a:s1")).not.toEqual(
      queryKeys.buyer.sessions("a:s2"),
    );
  });
});

describe("BUY-130 mock path", () => {
  it("lists mock sessions with a current device", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { listBuyerSessions, revokeBuyerSession, revokeOtherBuyerSessions } =
      await import("@/features/buyer/data/api");
    const sessions = await listBuyerSessions();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.some((s) => s.current)).toBe(true);

    const other = sessions.find((s) => !s.current);
    expect(other).toBeTruthy();
    const revoked = await revokeBuyerSession({ sessionId: other!.id });
    expect(revoked.accepted).toBe(true);
    expect(revoked.revokedCurrent).toBe(false);

    const bulk = await revokeOtherBuyerSessions();
    expect(bulk.accepted).toBe(true);
    expect(bulk.revokedCount).toBeGreaterThan(0);
  });

  it("marks revoke of current mock session", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { listBuyerSessions, revokeBuyerSession, revokeAllBuyerSessions } =
      await import("@/features/buyer/data/api");
    const current = (await listBuyerSessions()).find((s) => s.current)!;
    const result = await revokeBuyerSession({
      sessionId: current.id,
      currentSessionId: current.id,
    });
    expect(result.revokedCurrent).toBe(true);

    const all = await revokeAllBuyerSessions();
    expect(all.clearedCookie).toBe(true);
    expect(all.revokedCount).toBeGreaterThan(0);
  });
});

describe("BUY-130 api adapters", () => {
  it("lists sessions from { sessions } envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { sessions: [sessionDto, otherDto] },
        meta,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const list = await api.listBuyerSessions();
    expect(list).toHaveLength(2);
    expect(list[0].current).toBe(true);
    expect(list[0].device).toBe("Chrome di Linux");
    expect(list[1].id).toBe("ses_mobile");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/buyer/sessions");
  });

  it("revokes other session via single-id endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { revoked: true }, meta }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const result = await api.revokeBuyerSession({
      sessionId: "ses_mobile",
      currentSessionId: "ses_current",
    });
    expect(result.accepted).toBe(true);
    expect(result.revokedCurrent).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v1/buyer/sessions/ses_mobile/revoke",
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("flags revoke of current session for cookie clear path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { revoked: true }, meta }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const result = await api.revokeBuyerSession({
      sessionId: "ses_current",
      currentSessionId: "ses_current",
    });
    expect(result.revokedCurrent).toBe(true);
  });

  it("uses dedicated revoke-others endpoint (no per-session loop)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { revokedCount: 2 }, meta }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const result = await api.revokeOtherBuyerSessions();
    expect(result.revokedCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v1/buyer/sessions/revoke-others",
    );
  });

  it("uses dedicated revoke-all endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { revokedCount: 3 }, meta }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    const result = await api.revokeAllBuyerSessions();
    expect(result.clearedCookie).toBe(true);
    expect(result.revokedCount).toBe(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v1/buyer/sessions/revoke-all",
    );
  });

  it("foreign/missing session revoke → resource_not_found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode();
    await expect(
      api.revokeBuyerSession({
        sessionId: "ses_foreign",
        currentSessionId: "ses_current",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
