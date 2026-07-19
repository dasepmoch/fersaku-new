import { describe, expect, it } from "vitest";
import {
  createImpersonationSession,
  impersonationSessionSchema,
  isImpersonationSessionActive,
  isAllowedImpersonationTtl,
  isValidImpersonationReason,
} from "@/features/admin/impersonation/session";
import {
  canRunImpersonationCommand,
  IMPERSONATION_COMMANDS,
} from "@/features/admin/impersonation/policy";

describe("admin impersonation session policy", () => {
  it("defaults to a bounded read-only session payload", () => {
    const now = new Date("2026-07-16T10:00:00.000Z");
    const session = createImpersonationSession({
      targetId: "usr_01",
      targetName: "Asep Kurnia",
      targetType: "user",
      scope: "read-only",
      reason: "Ticket SUP-1234 reproduction",
      ttlMinutes: 15,
      now,
    });
    expect(session?.scope).toBe("read-only");
    expect(session?.targetType).toBe("user");
    expect(session?.expiresAt).toBe("2026-07-16T10:15:00.000Z");
  });

  it("rejects short reasons and unapproved TTL values", () => {
    expect(isValidImpersonationReason("too short")).toBe(false);
    expect(isAllowedImpersonationTtl(15)).toBe(true);
    expect(isAllowedImpersonationTtl(10)).toBe(false);
    expect(
      createImpersonationSession({
        targetId: "usr_01",
        targetName: "Asep Kurnia",
        scope: "read-only",
        reason: "too short",
        ttlMinutes: 15,
      }),
    ).toBeNull();
  });

  it("rejects a tampered full-privilege scope", () => {
    const session = createImpersonationSession({
      targetId: "usr_01",
      targetName: "Asep Kurnia",
      targetType: "user",
      scope: "support-write",
      reason: "Ticket SUP-1234 reproduction",
      ttlMinutes: 15,
      now: new Date("2026-07-16T10:00:00.000Z"),
    });
    expect(session).not.toBeNull();
    expect(
      impersonationSessionSchema.safeParse({ ...session, scope: "full" })
        .success,
    ).toBe(false);
  });

  it("treats the exact expiry instant as inactive", () => {
    const session = createImpersonationSession({
      targetId: "usr_01",
      targetName: "Asep Kurnia",
      scope: "read-only",
      reason: "Ticket SUP-1234 reproduction",
      ttlMinutes: 15,
      now: new Date("2026-07-16T10:00:00.000Z"),
    });
    expect(session).not.toBeNull();
    expect(
      isImpersonationSessionActive(
        session!,
        new Date("2026-07-16T10:14:59.999Z"),
      ),
    ).toBe(true);
    expect(
      isImpersonationSessionActive(
        session!,
        new Date("2026-07-16T10:15:00.000Z"),
      ),
    ).toBe(false);
  });

  it("keeps read-only default-deny for every mutation", () => {
    const session = { scope: "read-only" } as const;
    expect(
      canRunImpersonationCommand(
        session,
        IMPERSONATION_COMMANDS.profileSupportUpdate,
        ["displayName"],
      ),
    ).toBe(false);
    expect(canRunImpersonationCommand(session, "seller.export", [])).toBe(
      false,
    );
  });

  it("allows only the exact support-write commands and fields", () => {
    const session = { scope: "support-write" } as const;
    expect(
      canRunImpersonationCommand(
        session,
        IMPERSONATION_COMMANDS.profileSupportUpdate,
        ["displayName", "locale", "timezone"],
      ),
    ).toBe(true);
    expect(
      canRunImpersonationCommand(
        session,
        IMPERSONATION_COMMANDS.storePresentationSupportUpdate,
        ["name", "description"],
      ),
    ).toBe(true);
    expect(
      canRunImpersonationCommand(
        session,
        IMPERSONATION_COMMANDS.profileSupportUpdate,
        ["email"],
      ),
    ).toBe(false);
    expect(
      canRunImpersonationCommand(
        session,
        IMPERSONATION_COMMANDS.storePresentationSupportUpdate,
      ),
    ).toBe(false);
    expect(
      canRunImpersonationCommand(session, "inventory.secret.reveal", [
        "secret",
      ]),
    ).toBe(false);
  });
});
