import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminRoleDtoSchema,
  adminPermissionRegistryItemSchema,
  adminUserLookupDtoSchema,
  adminStaffInvitationDtoSchema,
  adminStaffInvitationCreateDataSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  assignUserRole,
  createStaffInvitation,
  listAdminRoles,
  listAdminStaffDirectory,
  listAdminUsers,
  listPermissionGroups,
  listStaffInvitations,
  listUserRoles,
  saveAdminRole,
} from "@/features/admin/data";
import {
  mapAdminRoleDto,
  mapAdminStaffInvitationDto,
  mapAdminUserLookupDto,
  mapPermissionRegistryToGroups,
  slugifyRoleCode,
} from "@/features/admin/data/mappers";
import { queryKeys } from "@/shared/query/query-keys";
import {
  parseMagicLinkFragmentToken,
  scrubUrlFragment,
} from "@/features/auth/mappers";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api/http-client")>(
    "@/shared/api/http-client",
  );
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

function installApiAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const AS_OF = "2026-07-17T10:00:00Z";

const sampleRoleDto = {
  id: "role_finance",
  code: "FINANCE_OPS",
  name: "Finance operations",
  description: "Payment monitoring and withdrawal approval.",
  isSystem: false,
  version: 3,
  permissions: ["merchants.read", "payments.read", "withdrawals.review"],
  createdAt: AS_OF,
  updatedAt: AS_OF,
};

describe("ADM-220 admin staff/roles/invitations", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps role DTO: isSystem→system, version, presentational color, members default 0", () => {
    const view = mapAdminRoleDto(adminRoleDtoSchema.parse(sampleRoleDto));
    expect(view.system).toBe(false);
    expect(view.version).toBe(3);
    expect(view.code).toBe("FINANCE_OPS");
    expect(view.members).toBe(0);
    expect(view.color).toMatch(/^#/);
    expect(view.permissions).toEqual([
      "merchants.read",
      "payments.read",
      "withdrawals.review",
    ]);
  });

  it("maps flat permission registry to grouped AdminPermissionGroup", () => {
    const items = [
      adminPermissionRegistryItemSchema.parse({
        code: "roles.read",
        description: "View roles",
        category: "Platform",
      }),
      adminPermissionRegistryItemSchema.parse({
        code: "merchants.read",
        description: "View merchants",
        category: "Merchants",
      }),
      adminPermissionRegistryItemSchema.parse({
        code: "merchants.write",
        description: "Edit merchants",
        category: "Merchants",
      }),
    ];
    const groups = mapPermissionRegistryToGroups(items);
    expect(groups.map((g) => g.group)).toEqual(["Merchants", "Platform"]);
    expect(groups[0]!.permissions).toEqual([
      ["merchants.read", "View merchants"],
      ["merchants.write", "Edit merchants"],
    ]);
  });

  it("maps user lookup and staff invitation without token on list shape", () => {
    const user = mapAdminUserLookupDto(
      adminUserLookupDtoSchema.parse({
        id: "u1",
        name: "Ada",
        email: "ada@fersaku.id",
        status: "ACTIVE",
        isAdmin: true,
        impersonatable: false,
        createdAt: AS_OF,
      }),
    );
    expect(user.isAdmin).toBe(true);
    expect(user.email).toBe("ada@fersaku.id");

    const invite = mapAdminStaffInvitationDto(
      adminStaffInvitationDtoSchema.parse({
        id: "inv1",
        email: "new@fersaku.id",
        roleId: "role_support",
        status: "PENDING",
        expiresAt: AS_OF,
        createdAt: AS_OF,
      }),
    );
    expect(invite).not.toHaveProperty("token");
    expect(invite.status).toBe("PENDING");
  });

  it("create invitation schema allows one-time token; list mapper strips it", () => {
    const created = adminStaffInvitationCreateDataSchema.parse({
      id: "inv2",
      email: "x@fersaku.id",
      roleId: "role_support",
      status: "PENDING",
      expiresAt: AS_OF,
      createdAt: AS_OF,
      token: "opaque-one-time-token",
    });
    expect(created.token).toBe("opaque-one-time-token");
    const { token: _t, ...listSafe } = created;
    const listed = mapAdminStaffInvitationDto(listSafe);
    expect(listed).not.toHaveProperty("token");
  });

  it("permission deny: roles.read/write/assign and users.read are distinct", () => {
    expect(claimsHavePermission(["roles.read"], "roles.write")).toBe(false);
    expect(claimsHavePermission(["roles.read"], "roles.assign")).toBe(false);
    expect(claimsHavePermission(["roles.assign"], "roles.write")).toBe(false);
    expect(claimsHavePermission(["users.read"], "roles.assign")).toBe(false);
    expect(claimsHavePermission(["roles.write"], "roles.write")).toBe(true);
    expect(claimsHavePermission(["roles.assign"], "roles.assign")).toBe(true);
    expect(claimsHavePermission(["users.read"], "users.read")).toBe(true);
    expect(claimsHavePermission(null, "roles.read")).toBe(false);
    expect(claimsHavePermission(["*"], "roles.read")).toBe(true);
  });

  it("mock path never hits transport for list/invite/role assign", async () => {
    installMockAdmin();
    const roles = await listAdminRoles();
    const groups = await listPermissionGroups();
    const staff = await listAdminStaffDirectory();
    const users = await listAdminUsers();
    const invites = await listStaffInvitations();
    const saved = await saveAdminRole({
      name: "Ops custom role",
      description: "Describe what this staff role is responsible for.",
      permissions: ["merchants.read"],
    });
    const assigned = await assignUserRole({
      userId: staff[0]!.id,
      roleId: roles.find((r) => !r.system)!.id,
      reason: "Assign support role for onboarding staff",
    });
    const invite = await createStaffInvitation({
      email: "invitee@fersaku.id",
      roleId: roles.find((r) => !r.system)!.id,
      reason: "Invite staff account for operations coverage",
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(roles.length).toBeGreaterThan(0);
    expect(groups.length).toBeGreaterThan(0);
    expect(staff.length).toBeGreaterThan(0);
    expect(users.length).toBeGreaterThan(0);
    expect(Array.isArray(invites)).toBe(true);
    expect(saved.role.permissions).toContain("merchants.read");
    expect(assigned.assigned).toBe(true);
    expect(invite.invitation.email).toBe("invitee@fersaku.id");
    expect(invite.invitation).not.toHaveProperty("token");
  });

  it("API roles list uses items envelope and maps isSystem", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { items: [sampleRoleDto] },
      meta: { requestId: "req_roles", timestamp: AS_OF },
    });
    const rows = await listAdminRoles();
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/roles");
    expect(rows[0]?.system).toBe(false);
    expect(rows[0]?.version).toBe(3);
    expect(rows[0]?.name).toBe("Finance operations");
  });

  it("API permissions list groups by category", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            code: "roles.read",
            description: "View roles",
            category: "Platform",
          },
          {
            code: "merchants.read",
            description: "View merchants",
            category: "Merchants",
          },
        ],
      },
      meta: { requestId: "req_perms", timestamp: AS_OF },
    });
    const groups = await listPermissionGroups();
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/permissions");
    expect(groups.some((g) => g.group === "Merchants")).toBe(true);
    expect(groups.some((g) => g.group === "Platform")).toBe(true);
  });

  it("API staff invite create posts typed body and does not return token on invitation field", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        id: "inv_live",
        email: "staff@fersaku.id",
        roleId: "role_support",
        status: "PENDING",
        expiresAt: AS_OF,
        createdAt: AS_OF,
        token: "once-only-token",
      },
      meta: { requestId: "req_invite", timestamp: AS_OF },
    });
    const result = await createStaffInvitation({
      email: "staff@fersaku.id",
      roleId: "role_support",
      reason: "Invite staff account for finance coverage",
    });
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/invitations/staff",
    );
    expect(apiRequestMock.mock.calls[0]![1].method).toBe("POST");
    expect(apiRequestMock.mock.calls[0]![1].body).toMatchObject({
      email: "staff@fersaku.id",
      roleId: "role_support",
    });
    expect(result.invitation).not.toHaveProperty("token");
    expect(result.deliveryToken).toBe("once-only-token");
  });

  it("API role assign uses roles.assign path", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { assigned: true },
      meta: { requestId: "req_assign", timestamp: AS_OF },
    });
    const result = await assignUserRole({
      userId: "user_1",
      roleId: "role_support",
      reason: "Assign support role after MFA enrollment",
    });
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/users/user_1/roles",
    );
    expect(result.assigned).toBe(true);
  });

  it("API role save uses PATCH with expectedVersion for updates", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...sampleRoleDto, version: 4, name: "Finance ops v2" },
      meta: { requestId: "req_patch", timestamp: AS_OF },
    });
    const result = await saveAdminRole({
      id: "role_finance",
      name: "Finance ops v2",
      description: "Payment monitoring and withdrawal approval.",
      permissions: ["merchants.read", "payments.read"],
      expectedVersion: 3,
      reason: "Update role permissions after audit review",
    });
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/roles/role_finance",
    );
    expect(apiRequestMock.mock.calls[0]![1].method).toBe("PATCH");
    expect(apiRequestMock.mock.calls[0]![1].body).toMatchObject({
      expectedVersion: 3,
      name: "Finance ops v2",
    });
    expect(result.role.version).toBe(4);
  });

  it("API users list maps array data envelope", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [
        {
          id: "u1",
          name: "Ada",
          email: "ada@fersaku.id",
          status: "ACTIVE",
          isAdmin: true,
          impersonatable: false,
          createdAt: AS_OF,
        },
      ],
      meta: { requestId: "req_users", timestamp: AS_OF },
    });
    const rows = await listAdminUsers({ q: "ada", limit: 20 });
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/users");
    expect(apiRequestMock.mock.calls[0]![1].query).toMatchObject({
      q: "ada",
      limit: 20,
    });
    expect(rows[0]?.isAdmin).toBe(true);
  });

  it("query keys isolate roles, users, assignments, invitations", () => {
    expect(queryKeys.admin.roles()).toEqual(["admin", "roles"]);
    expect(queryKeys.admin.role("r1")).toEqual(["admin", "roles", "r1"]);
    expect(queryKeys.admin.users()).toEqual([
      "admin",
      "users",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.user("u1")).toEqual(["admin", "users", "u1"]);
    expect(queryKeys.admin.userRoles("u1")).toEqual([
      "admin",
      "users",
      "u1",
      "roles",
    ]);
    expect(queryKeys.admin.staffInvitations()).toEqual([
      "admin",
      "invitations",
      "staff",
    ]);
  });

  it("slugifyRoleCode produces stable custom codes", () => {
    expect(slugifyRoleCode("Finance Ops")).toBe("FINANCE_OPS");
    expect(slugifyRoleCode("  a  ")).toMatch(/^CUSTOM_/);
  });

  it("reuses AUT-120 fragment token helpers for invite accept ceremony", () => {
    expect(parseMagicLinkFragmentToken("#token=abc123")).toBe("abc123");
    expect(parseMagicLinkFragmentToken("#")).toBeNull();
    expect(parseMagicLinkFragmentToken(null)).toBeNull();
    expect(typeof scrubUrlFragment).toBe("function");
  });

  it("API user roles list uses items envelope", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            userId: "u1",
            roleId: "role_support",
            roleCode: "SUPPORT",
            roleName: "Support",
            isSystem: false,
            assignedAt: AS_OF,
          },
        ],
      },
      meta: { requestId: "req_ur", timestamp: AS_OF },
    });
    const rows = await listUserRoles("u1");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/users/u1/roles",
    );
    expect(rows[0]?.roleName).toBe("Support");
  });
});
