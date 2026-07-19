import { describe, expect, it } from "vitest";
import {
  ADMIN_ACTION_PERMISSIONS,
  ALL_PERMISSION_CODES,
  claimsAreAuthenticatedAdmin,
  claimsHavePermission,
  isKnownPermissionCode,
} from "@/features/admin/config/permissions";
import {
  canAccessAdminNavHref,
  canAccessAdminPage,
  getAdminPageMeta,
  getAdminSegments,
  listAdminPageMeta,
} from "@/features/admin/config/routes";
import { demoAdminRoles } from "@/features/admin/data/access";
import { mockPermissionGroups } from "@/features/admin/data/mock";
import { createMockClaims } from "@/shared/auth/session-model";
import { sessionHasPermission } from "@/shared/auth/guards";

describe("ADM-110 permission registry", () => {
  it("mirrors launch registry codes without unknown aliases", () => {
    expect(ALL_PERMISSION_CODES).toContain("merchants.write");
    expect(ALL_PERMISSION_CODES).toContain("withdrawals.review");
    expect(ALL_PERMISSION_CODES).toContain("kyc.review");
    expect(ALL_PERMISSION_CODES).toContain("payments.read");
    expect(ALL_PERMISSION_CODES).toContain("platform.emergency");
    expect(ALL_PERMISSION_CODES).not.toContain("profile.read");
    expect(ALL_PERMISSION_CODES).not.toContain("campaigns.read");
    expect(ALL_PERMISSION_CODES).not.toContain("withdrawals.read");
    expect(ALL_PERMISSION_CODES).not.toContain("kyc.read");
    expect(ALL_PERMISSION_CODES).not.toContain("providers.read");
    expect(ALL_PERMISSION_CODES).not.toContain("system.read");
    expect(ALL_PERMISSION_CODES).not.toContain("merchants.update");
    expect(ALL_PERMISSION_CODES).not.toContain("audit.export");
    expect(ALL_PERMISSION_CODES).not.toContain("withdrawals.approve");
  });

  it("fails closed on missing and unknown permission codes", () => {
    expect(claimsHavePermission([], "merchants.read")).toBe(false);
    expect(claimsHavePermission(undefined, "merchants.read")).toBe(false);
    expect(claimsHavePermission(["merchants.read"], "merchants.write")).toBe(
      false,
    );
    expect(claimsHavePermission(["*"], "not.a.real.permission")).toBe(false);
    expect(claimsHavePermission(["*"], "")).toBe(false);
    expect(isKnownPermissionCode("merchants.update")).toBe(false);
  });

  it("allows superuser wildcard only for known codes", () => {
    expect(claimsHavePermission(["*"], "merchants.read")).toBe(true);
    expect(claimsHavePermission(["*"], "platform.emergency")).toBe(true);
    expect(
      sessionHasPermission(createMockClaims("admin"), "merchants.read"),
    ).toBe(true);
  });
});

describe("ADM-110 route permission map", () => {
  it("maps every active admin section to a known code or authenticated-admin gate", () => {
    for (const { section, meta } of listAdminPageMeta()) {
      if (meta.disposition === "decision_pending") {
        expect(section).toBe("campaigns");
        continue;
      }
      if (meta.permission === null) {
        expect(section).toBe("profile");
        continue;
      }
      expect(isKnownPermissionCode(meta.permission)).toBe(true);
    }
  });

  it("resolves snapshot drift to backend middleware codes", () => {
    expect(getAdminPageMeta(["profile"]).permission).toBeNull();
    expect(getAdminPageMeta(["withdrawals"]).permission).toBe(
      "withdrawals.review",
    );
    expect(getAdminPageMeta(["kyc"]).permission).toBe("kyc.review");
    expect(getAdminPageMeta(["providers"]).permission).toBe("payments.read");
    expect(getAdminPageMeta(["system"]).permission).toBe("platform.emergency");
    expect(getAdminPageMeta(["campaigns"]).disposition).toBe(
      "decision_pending",
    );
  });

  it("denies missing permission on direct route access", () => {
    const limited = {
      subjectId: "u_support",
      surface: "admin",
      permissions: ["merchants.read", "buyers.read"] as const,
    };
    expect(canAccessAdminPage(getAdminPageMeta(["merchants"]), limited)).toBe(
      true,
    );
    expect(canAccessAdminPage(getAdminPageMeta(["withdrawals"]), limited)).toBe(
      false,
    );
    expect(canAccessAdminPage(getAdminPageMeta(["system"]), limited)).toBe(
      false,
    );
    expect(canAccessAdminPage(getAdminPageMeta(["kyc"]), limited)).toBe(false);
    expect(canAccessAdminNavHref("/admin/merchants", limited)).toBe(true);
    expect(canAccessAdminNavHref("/admin/withdrawals", limited)).toBe(false);
    expect(canAccessAdminNavHref("/admin/campaigns", limited)).toBe(false);
  });

  it("allows superuser path for active routes and still blocks campaigns", () => {
    const superuser = createMockClaims("admin");
    expect(canAccessAdminPage(getAdminPageMeta(["overview"]), superuser)).toBe(
      true,
    );
    expect(canAccessAdminPage(getAdminPageMeta(["system"]), superuser)).toBe(
      true,
    );
    expect(canAccessAdminPage(getAdminPageMeta(["profile"]), superuser)).toBe(
      true,
    );
    expect(canAccessAdminPage(getAdminPageMeta(["campaigns"]), superuser)).toBe(
      false,
    );
    expect(canAccessAdminNavHref("/admin/campaigns", superuser)).toBe(false);
    expect(canAccessAdminNavHref("/admin", superuser)).toBe(true);
  });

  it("requires authenticated admin surface for profile without page code", () => {
    expect(
      canAccessAdminPage(getAdminPageMeta(["profile"]), {
        subjectId: "u1",
        surface: "admin",
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canAccessAdminPage(getAdminPageMeta(["profile"]), {
        subjectId: "u1",
        surface: "seller",
        permissions: ["*"],
      }),
    ).toBe(false);
    expect(claimsAreAuthenticatedAdmin(null)).toBe(false);
  });

  it("parses segments for nested admin paths", () => {
    expect(getAdminSegments("/admin/merchants/str_01")).toEqual([
      "merchants",
      "str_01",
    ]);
    expect(getAdminPageMeta(["merchants", "str_01"]).permission).toBe(
      "merchants.read",
    );
  });
});

describe("ADM-110 action permission map", () => {
  it("binds existing controls to mutation codes distinct from read where required", () => {
    expect(ADMIN_ACTION_PERMISSIONS.merchantsWrite).toBe("merchants.write");
    expect(ADMIN_ACTION_PERMISSIONS.rolesWrite).toBe("roles.write");
    expect(ADMIN_ACTION_PERMISSIONS.staffInvite).toBe("roles.assign");
    expect(ADMIN_ACTION_PERMISSIONS.auditExport).toBe("audit.read");
    expect(ADMIN_ACTION_PERMISSIONS.kycReview).toBe("kyc.review");
    expect(ADMIN_ACTION_PERMISSIONS.platformEmergency).toBe(
      "platform.emergency",
    );
    for (const code of Object.values(ADMIN_ACTION_PERMISSIONS)) {
      expect(isKnownPermissionCode(code)).toBe(true);
    }
  });
});

describe("ADM-110 mock fixtures", () => {
  it("keeps mock permission groups on the canonical registry only", () => {
    const codes = mockPermissionGroups().flatMap((group) =>
      group.permissions.map(([code]) => code),
    );
    for (const code of codes) {
      expect(isKnownPermissionCode(code)).toBe(true);
    }
    expect(codes).not.toContain("merchants.update");
    expect(codes).not.toContain("audit.export");
    expect(codes).not.toContain("kyc.read");
    expect(codes).not.toContain("providers.read");
  });

  it("keeps role fixture grants on known codes", () => {
    for (const role of demoAdminRoles()) {
      for (const code of role.permissions ?? []) {
        expect(isKnownPermissionCode(code)).toBe(true);
      }
    }
  });
});
