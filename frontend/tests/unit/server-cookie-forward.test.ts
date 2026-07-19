import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  FORWARDED_COOKIE_ALLOWLIST,
  buildForwardedCookieHeader,
  getAllowlistedCookieValue,
  pickForwardedRequestHeaders,
  isForwardableCookieName,
} from "@/shared/api/server-cookie-forward";

describe("server cookie allowlist (INT-110)", () => {
  it("exports fersaku_session as the session cookie", () => {
    expect(SESSION_COOKIE_NAME).toBe("fersaku_session");
    expect(FORWARDED_COOKIE_ALLOWLIST).toContain("fersaku_session");
  });

  it("forwards only allowlisted cookies", () => {
    const header = buildForwardedCookieHeader([
      { name: "fersaku_session", value: "sess_abc" },
      { name: "_ga", value: "GA1.1.evil" },
      { name: "other", value: "nope" },
    ]);
    expect(header).toBe("fersaku_session=sess_abc");
    expect(header).not.toContain("_ga");
    expect(header).not.toContain("other");
  });

  it("returns undefined when session cookie missing or empty", () => {
    expect(
      buildForwardedCookieHeader([{ name: "_ga", value: "x" }]),
    ).toBeUndefined();
    expect(
      buildForwardedCookieHeader([
        { name: "fersaku_session", value: "" },
      ]),
    ).toBeUndefined();
  });

  it("dedupes case-insensitive cookie names", () => {
    const header = buildForwardedCookieHeader([
      { name: "fersaku_session", value: "first" },
      { name: "Fersaku_Session", value: "second" },
    ]);
    expect(header).toBe("fersaku_session=first");
  });

  it("reads allowlisted cookie value", () => {
    expect(
      getAllowlistedCookieValue([
        { name: "x", value: "1" },
        { name: "fersaku_session", value: "tok" },
      ]),
    ).toBe("tok");
    expect(getAllowlistedCookieValue([])).toBeUndefined();
  });

  it("isForwardableCookieName only allowlist", () => {
    expect(isForwardableCookieName("fersaku_session")).toBe(true);
    expect(isForwardableCookieName("FERSAKU_SESSION")).toBe(true);
    expect(isForwardableCookieName("_ga")).toBe(false);
  });

  it("picks only X-Request-ID from Headers", () => {
    const incoming = new Headers({
      "x-request-id": "req_in_1",
      cookie: "fersaku_session=should-not-via-headers",
      authorization: "Bearer leak",
      "user-agent": "Mozilla",
      "x-forwarded-for": "1.2.3.4",
    });
    const out = pickForwardedRequestHeaders(incoming);
    expect(out.get("X-Request-ID")).toBe("req_in_1");
    expect(out.get("cookie")).toBeNull();
    expect(out.get("authorization")).toBeNull();
    expect(out.get("user-agent")).toBeNull();
    expect(out.get("x-forwarded-for")).toBeNull();
  });

  it("picks only allowlisted keys from record", () => {
    const out = pickForwardedRequestHeaders({
      "X-Request-ID": "req_rec",
      Authorization: "secret",
      Cookie: "fersaku_session=x",
    });
    expect(out.get("X-Request-ID")).toBe("req_rec");
    expect([...out.keys()]).toEqual(["x-request-id"]);
  });
});
