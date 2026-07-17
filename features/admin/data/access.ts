/**
 * ADM-220 — staff users, roles, permissions, invitations adapters.
 * Reads: adminRead; writes: adminWrite. Permission gates live in hooks.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  adminAssignUserRoleEnvelopeSchema,
  adminPermissionRegistryEnvelopeSchema,
  adminRemoveUserRoleEnvelopeSchema,
  adminRoleArchiveEnvelopeSchema,
  adminRoleEnvelopeSchema,
  adminRoleListEnvelopeSchema,
  adminStaffInvitationCreateEnvelopeSchema,
  adminStaffInvitationListEnvelopeSchema,
  adminStaffInvitationRevokeEnvelopeSchema,
  adminUserLookupEnvelopeSchema,
  adminUserLookupListEnvelopeSchema,
  adminUserRoleAssignmentListEnvelopeSchema,
  staffInvitationAcceptEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { useAppMutation } from "@/shared/query/create-mutation";
import { queryKeys } from "@/shared/query/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  readVersionedStorage,
  writeVersionedStorage,
} from "@/shared/storage/versioned-storage";
import { z as zod } from "zod";
import type {
  AdminPermissionGroup,
  AdminRole,
  AdminStaffInvitation,
  AdminStaffMember,
  AdminUserLookup,
  AdminUserRoleAssignment,
} from "./contracts";
import {
  mapAdminRoleDto,
  mapAdminStaffInvitationDto,
  mapAdminStaffMember,
  mapAdminUserLookupDto,
  mapAdminUserRoleAssignmentDto,
  mapPermissionRegistryToGroups,
  slugifyRoleCode,
} from "./mappers";
import { mockPermissionGroups, mockRoles } from "./mock";
import { appendMockAuditEvent } from "./mock-audit";

const mockRoleStoreKey = "fersaku-admin-roles";
const mockRoleStoreVersion = 1;
const mockStaffInviteStoreKey = "fersaku-admin-staff-invitations";
const mockStaffInviteStoreVersion = 1;

/** In-memory fallback when localStorage is unavailable (SSR / unit tests). */
let memoryRoleStore: AdminRole[] | null = null;
let memoryStaffInviteStore: AdminStaffInvitation[] | null = null;

const mockRoleSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
  description: zod.string(),
  members: zod.number().int().nonnegative(),
  system: zod.boolean(),
  color: zod.string(),
  permissions: zod.array(zod.string()),
  version: zod.number().int().optional(),
  code: zod.string().optional(),
  archivedAt: zod.string().nullable().optional(),
});

const mockRoleStoreSchema = zod.array(mockRoleSchema);

const mockStaffInviteSchema = zod.object({
  id: zod.string(),
  email: zod.string(),
  roleId: zod.string(),
  status: zod.string(),
  expiresAt: zod.string(),
  createdAt: zod.string(),
});

const mockStaffInviteStoreSchema = zod.array(mockStaffInviteSchema);

/** Mock role fixtures — canonical codes only (ADM-110). */
const fixturePermissions: Record<string, string[]> = {
  role_finance: [
    "merchants.read",
    "payments.read",
    "withdrawals.review",
    "orders.read",
    "audit.read",
  ],
  role_support: [
    "merchants.read",
    "merchants.write",
    "kyc.review",
    "webhooks.read",
    "provider_callbacks.replay",
    "seller_webhook_deliveries.retry",
  ],
  role_customer_support: [
    "merchants.read",
    "payments.read",
    "webhooks.read",
    "seller_webhook_deliveries.retry",
  ],
  role_auditor: [
    "merchants.read",
    "payments.read",
    "withdrawals.review",
    "kyc.review",
    "webhooks.read",
    "audit.read",
    "admin.dashboard.read",
  ],
};

function fixtureRoles(): AdminRole[] {
  const allPermissions = mockPermissionGroups().flatMap((group) =>
    group.permissions.map(([permission]) => permission),
  );
  return mockRoles().map((role) => ({
    ...role,
    version: 1,
    code: role.id.toUpperCase(),
    permissions:
      role.id === "role_superadmin"
        ? allPermissions
        : (fixturePermissions[role.id] ?? []),
  }));
}

/** Shared versioned mock role source used by all role screens and hooks. */
export function readMockAdminRoles(): AdminRole[] {
  const fixtures = fixtureRoles();
  const stored =
    memoryRoleStore ??
    readVersionedStorage({
      key: mockRoleStoreKey,
      version: mockRoleStoreVersion,
      schema: mockRoleStoreSchema,
      fallback: () => fixtures,
    });
  const fixtureIds = new Set(fixtures.map((role) => role.id));
  const storedById = new Map(stored.map((role) => [role.id, role]));
  const mergedFixtures = fixtures.map((fixture) => {
    if (fixture.system) return fixture;
    const override = storedById.get(fixture.id);
    return override
      ? {
          ...fixture,
          ...override,
          id: fixture.id,
          system: false,
          version: override.version ?? fixture.version ?? 1,
        }
      : fixture;
  });
  const customRoles = stored.filter(
    (role) => !fixtureIds.has(role.id) && !role.system,
  );
  return [...mergedFixtures, ...customRoles];
}

function writeMockRoles(roles: AdminRole[]): AdminRole[] {
  memoryRoleStore = roles;
  writeVersionedStorage({
    key: mockRoleStoreKey,
    version: mockRoleStoreVersion,
    data: roles,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fersaku-admin-roles-updated"));
  }
  return roles;
}

function readMockStaffInvitations(): AdminStaffInvitation[] {
  if (memoryStaffInviteStore) return memoryStaffInviteStore;
  return readVersionedStorage({
    key: mockStaffInviteStoreKey,
    version: mockStaffInviteStoreVersion,
    schema: mockStaffInviteStoreSchema,
    fallback: () => [],
  });
}

function writeMockStaffInvitations(
  rows: AdminStaffInvitation[],
): AdminStaffInvitation[] {
  memoryStaffInviteStore = rows;
  writeVersionedStorage({
    key: mockStaffInviteStoreKey,
    version: mockStaffInviteStoreVersion,
    data: rows,
  });
  return rows;
}

/**
 * Mock-only sync save (role-builder mock path / tests).
 * API path must use async `saveAdminRole`.
 */
export function saveMockAdminRole(input: {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
}): { role: AdminRole; roles: AdminRole[] } {
  if (!shouldUseMockFixtures("adminWrite") && !shouldUseMockFixtures("adminRead")) {
    throw new Error("Live role mutation adapter is not connected");
  }
  return saveAdminRoleSync(input);
}

function saveAdminRoleSync(input: {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
  expectedVersion?: number;
}): { role: AdminRole; roles: AdminRole[] } {
  const current = readMockAdminRoles();
  const existing = input.id
    ? current.find((role) => role.id === input.id)
    : undefined;
  if (existing?.system) throw new Error("Protected roles are read-only");
  if (
    existing &&
    input.expectedVersion !== undefined &&
    existing.version !== undefined &&
    existing.version !== input.expectedVersion
  ) {
    throw new Error("Role version conflict");
  }
  const id =
    existing?.id ??
    input.id ??
    `role_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const role: AdminRole = {
    id,
    name: input.name,
    description: input.description,
    permissions: [...new Set(input.permissions)].sort(),
    members: existing?.members ?? 0,
    system: false,
    color: existing?.color ?? "#4f6fe1",
    version: (existing?.version ?? 0) + 1,
    code: existing?.code ?? slugifyRoleCode(input.name),
    archivedAt: null,
  };
  const roles = existing
    ? current.map((candidate) => (candidate.id === id ? role : candidate))
    : [...current, role];
  writeMockRoles(roles);
  return { role, roles };
}

export function demoAdminRoles(): AdminRole[] {
  return fixtureRoles();
}

export function demoPermissionGroups(): AdminPermissionGroup[] {
  return mockPermissionGroups();
}

export function demoStaffMembers(): AdminStaffMember[] {
  return [
    {
      id: "staff_dinda",
      name: "Dinda Kusuma",
      email: "dinda@fersaku.id",
      roleLabel: "Super admin",
      status: "Active",
      lastActive: "Now",
      mfaEnabled: true,
      isAdmin: true,
    },
    {
      id: "staff_raka",
      name: "Raka Mahendra",
      email: "raka@fersaku.id",
      roleLabel: "Merchant support",
      status: "Active",
      lastActive: "8m ago",
      mfaEnabled: true,
      isAdmin: true,
    },
    {
      id: "staff_salsa",
      name: "Salsa Putri",
      email: "salsa@fersaku.id",
      roleLabel: "Finance ops",
      status: "Active",
      lastActive: "42m ago",
      mfaEnabled: true,
      isAdmin: true,
    },
    {
      id: "staff_kevin",
      name: "Kevin Tan",
      email: "kevin@fersaku.id",
      roleLabel: "Support",
      status: "Invited",
      lastActive: "Never",
      mfaEnabled: false,
      isAdmin: true,
    },
    {
      id: "staff_niko",
      name: "Niko Aditya",
      email: "niko@fersaku.id",
      roleLabel: "Support",
      status: "Active",
      lastActive: "1h ago",
      mfaEnabled: true,
      isAdmin: true,
    },
    {
      id: "staff_fara",
      name: "Fara Anindya",
      email: "fara@fersaku.id",
      roleLabel: "Merchant support",
      status: "Active",
      lastActive: "2h ago",
      mfaEnabled: true,
      isAdmin: true,
    },
  ];
}

export function demoSellerUsers(): Array<
  [id: string, name: string, email: string, store: string, status: string]
> {
  return [
    ["usr_01H8A2", "Asep Kurnia", "asep@ai.tools", "Asep AI Tools", "Active"],
    ["usr_01H8K1", "Sinta Dewi", "sinta@uipack.id", "UI Pack House", "Active"],
    [
      "usr_01H8L8",
      "Raka Firmansyah",
      "raka@automation.club",
      "Automation Club",
      "Restricted",
    ],
  ];
}

type RoleListEnvelope = z.infer<typeof adminRoleListEnvelopeSchema>;
type RoleEnvelope = z.infer<typeof adminRoleEnvelopeSchema>;
type PermEnvelope = z.infer<typeof adminPermissionRegistryEnvelopeSchema>;
type UserListEnvelope = z.infer<typeof adminUserLookupListEnvelopeSchema>;
type UserEnvelope = z.infer<typeof adminUserLookupEnvelopeSchema>;
type UserRolesEnvelope = z.infer<
  typeof adminUserRoleAssignmentListEnvelopeSchema
>;
type InviteListEnvelope = z.infer<typeof adminStaffInvitationListEnvelopeSchema>;
type InviteCreateEnvelope = z.infer<
  typeof adminStaffInvitationCreateEnvelopeSchema
>;
type AcceptEnvelope = z.infer<typeof staffInvitationAcceptEnvelopeSchema>;

export async function listAdminRoles(
  signal?: AbortSignal,
): Promise<AdminRole[]> {
  if (shouldUseMockFixtures("adminRead")) return readMockAdminRoles();
  const response = await apiRequest<RoleListEnvelope>("/v1/admin/roles", {
    schema: adminRoleListEnvelopeSchema,
    signal,
  });
  return response.data.items.map(mapAdminRoleDto);
}

export async function getAdminRole(
  roleId: string,
  signal?: AbortSignal,
): Promise<AdminRole | null> {
  if (!roleId) return null;
  if (shouldUseMockFixtures("adminRead")) {
    return readMockAdminRoles().find((r) => r.id === roleId) ?? null;
  }
  const response = await apiRequest<RoleEnvelope>(
    `/v1/admin/roles/${encodeURIComponent(roleId)}`,
    {
      schema: adminRoleEnvelopeSchema,
      signal,
    },
  );
  return mapAdminRoleDto(response.data);
}

export async function listPermissionGroups(
  signal?: AbortSignal,
): Promise<AdminPermissionGroup[]> {
  if (shouldUseMockFixtures("adminRead")) return demoPermissionGroups();
  const response = await apiRequest<PermEnvelope>("/v1/admin/permissions", {
    schema: adminPermissionRegistryEnvelopeSchema,
    signal,
  });
  return mapPermissionRegistryToGroups(response.data.items);
}

export async function listAdminUsers(
  filters: { q?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<AdminUserLookup[]> {
  if (shouldUseMockFixtures("adminRead")) {
    const staff = demoStaffMembers().map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      status: s.status,
      isAdmin: s.isAdmin,
      impersonatable: false,
      createdAt: s.lastActive,
    }));
    const sellers = demoSellerUsers().map(([id, name, email, , status]) => ({
      id,
      name,
      email,
      status,
      isAdmin: false,
      impersonatable: true,
      createdAt: "",
    }));
    let rows = [...staff, ...sellers];
    const q = filters.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q),
      );
    }
    return rows.slice(0, filters.limit ?? 50);
  }
  const response = await apiRequest<UserListEnvelope>("/v1/admin/users", {
    schema: adminUserLookupListEnvelopeSchema,
    query: {
      q: filters.q?.trim() || undefined,
      limit: filters.limit ?? 50,
    },
    signal,
  });
  return response.data.map(mapAdminUserLookupDto);
}

export async function getAdminUser(
  userId: string,
  signal?: AbortSignal,
): Promise<AdminUserLookup | null> {
  if (!userId) return null;
  if (shouldUseMockFixtures("adminRead")) {
    const all = await listAdminUsers({}, signal);
    return all.find((u) => u.id === userId) ?? null;
  }
  const response = await apiRequest<UserEnvelope>(
    `/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      schema: adminUserLookupEnvelopeSchema,
      signal,
    },
  );
  return mapAdminUserLookupDto(response.data);
}

export async function listUserRoles(
  userId: string,
  signal?: AbortSignal,
): Promise<AdminUserRoleAssignment[]> {
  if (!userId) return [];
  if (shouldUseMockFixtures("adminRead")) {
    const staff = demoStaffMembers().find((s) => s.id === userId);
    if (!staff) return [];
    const role = readMockAdminRoles().find(
      (r) =>
        r.name.toLowerCase() === staff.roleLabel.toLowerCase() ||
        staff.roleLabel.toLowerCase().includes(r.name.toLowerCase().split(" ")[0]!),
    );
    if (!role) return [];
    return [
      {
        userId,
        roleId: role.id,
        roleCode: role.code ?? role.id,
        roleName: role.name,
        isSystem: role.system,
        assignedAt: new Date().toISOString(),
      },
    ];
  }
  const response = await apiRequest<UserRolesEnvelope>(
    `/v1/admin/users/${encodeURIComponent(userId)}/roles`,
    {
      schema: adminUserRoleAssignmentListEnvelopeSchema,
      signal,
    },
  );
  return response.data.items.map(mapAdminUserRoleAssignmentDto);
}

export async function listStaffInvitations(
  signal?: AbortSignal,
): Promise<AdminStaffInvitation[]> {
  if (shouldUseMockFixtures("adminRead")) return readMockStaffInvitations();
  const response = await apiRequest<InviteListEnvelope>(
    "/v1/admin/invitations/staff",
    {
      schema: adminStaffInvitationListEnvelopeSchema,
      signal,
    },
  );
  return response.data.items.map(mapAdminStaffInvitationDto);
}

/**
 * Staff directory for users screen: admin users + invited rows.
 * Role labels from assignments when available; never invent MFA from client.
 */
export async function listAdminStaffDirectory(
  signal?: AbortSignal,
): Promise<AdminStaffMember[]> {
  if (shouldUseMockFixtures("adminRead")) return demoStaffMembers();

  const [users, invitations] = await Promise.all([
    listAdminUsers({ limit: 100 }, signal),
    listStaffInvitations(signal).catch(() => [] as AdminStaffInvitation[]),
  ]);

  const admins = users.filter((u) => u.isAdmin);
  const members: AdminStaffMember[] = [];

  for (const user of admins) {
    let roleNames: string[] = [];
    try {
      const assignments = await listUserRoles(user.id, signal);
      roleNames = assignments.map((a) => a.roleName).filter(Boolean);
    } catch {
      roleNames = [];
    }
    members.push(mapAdminStaffMember(user, roleNames));
  }

  const existingEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const roles = await listAdminRoles(signal).catch(() => [] as AdminRole[]);
  const roleById = new Map(roles.map((r) => [r.id, r]));

  for (const inv of invitations) {
    if (existingEmails.has(inv.email.toLowerCase())) continue;
    if (String(inv.status).toUpperCase() === "REVOKED") continue;
    if (String(inv.status).toUpperCase() === "ACCEPTED") continue;
    const role = roleById.get(inv.roleId);
    members.push({
      id: inv.id,
      name: inv.email.split("@")[0] ?? inv.email,
      email: inv.email,
      roleLabel: role?.name ?? "Invited",
      status: "Invited",
      lastActive: "Never",
      mfaEnabled: false,
      isAdmin: true,
    });
  }

  return members;
}

export type SaveAdminRoleInput = {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
  expectedVersion?: number;
  reason?: string;
  idempotencyKey?: string;
};

export type SaveAdminRoleResult = {
  role: AdminRole;
  roles?: AdminRole[];
  requestId: string;
};

export async function saveAdminRole(
  input: SaveAdminRoleInput,
  signal?: AbortSignal,
): Promise<SaveAdminRoleResult> {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 3 || description.length < 12) {
    throw new Error("Role name or description is incomplete");
  }
  const permissions = [...new Set(input.permissions)].sort();
  const reason = (input.reason ?? "Role permission update").trim();
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const persisted = saveAdminRoleSync({
      id: input.id,
      name,
      description,
      permissions,
      expectedVersion: input.expectedVersion,
    });
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: input.id ? "role.update" : "role.create",
      target: persisted.role.id,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      role: persisted.role,
      roles: persisted.roles,
      requestId: `mock_role_${persisted.role.id}`,
    };
  }

  if (input.id) {
    const response = await apiRequest<
      RoleEnvelope,
      {
        expectedVersion: number;
        name: string;
        description: string;
        permissions: string[];
      }
    >(`/v1/admin/roles/${encodeURIComponent(input.id)}`, {
      schema: adminRoleEnvelopeSchema,
      method: "PATCH",
      body: {
        expectedVersion: input.expectedVersion ?? 0,
        name,
        description,
        permissions,
      },
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
    });
    return {
      role: mapAdminRoleDto(response.data),
      requestId: response.meta.requestId,
    };
  }

  const response = await apiRequest<
    RoleEnvelope,
    {
      code: string;
      name: string;
      description: string;
      permissions: string[];
    }
  >("/v1/admin/roles", {
    schema: adminRoleEnvelopeSchema,
    method: "POST",
    body: {
      code: slugifyRoleCode(name),
      name,
      description,
      permissions,
    },
    signal,
    idempotencyKey,
    auditReason: reason,
    requireRecentMfa: true,
  });
  return {
    role: mapAdminRoleDto(response.data),
    requestId: response.meta.requestId,
  };
}

export type ArchiveAdminRoleInput = {
  roleId: string;
  expectedVersion: number;
  reason?: string;
  idempotencyKey?: string;
};

export async function archiveAdminRole(
  input: ArchiveAdminRoleInput,
  signal?: AbortSignal,
): Promise<{ id: string; version: number; requestId: string }> {
  const reason = (input.reason ?? "Archive custom role").trim();
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const current = readMockAdminRoles();
    const existing = current.find((r) => r.id === input.roleId);
    if (!existing) throw new Error("Role not found");
    if (existing.system) throw new Error("Protected roles are read-only");
    const next = current.filter((r) => r.id !== input.roleId);
    writeMockRoles(next);
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "role.archive",
      target: input.roleId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      id: input.roleId,
      version: (existing.version ?? 0) + 1,
      requestId: `mock_archive_${input.roleId}`,
    };
  }

  const response = await apiRequest<
    z.infer<typeof adminRoleArchiveEnvelopeSchema>,
    { expectedVersion: number }
  >(`/v1/admin/roles/${encodeURIComponent(input.roleId)}/archive`, {
    schema: adminRoleArchiveEnvelopeSchema,
    method: "POST",
    body: { expectedVersion: input.expectedVersion },
    signal,
    idempotencyKey,
    auditReason: reason,
    requireRecentMfa: true,
  });
  return {
    id: response.data.id,
    version: response.data.version,
    requestId: response.meta.requestId,
  };
}

export type AssignUserRoleInput = {
  userId: string;
  roleId: string;
  reason?: string;
  idempotencyKey?: string;
};

export async function assignUserRole(
  input: AssignUserRoleInput,
  signal?: AbortSignal,
): Promise<{ assigned: boolean; requestId: string }> {
  const reason = (input.reason ?? "Assign role to user").trim();
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "user.role.assign",
      target: `${input.userId}:${input.roleId}`,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return { assigned: true, requestId: `mock_assign_${input.userId}` };
  }

  const response = await apiRequest<
    z.infer<typeof adminAssignUserRoleEnvelopeSchema>,
    { roleId: string }
  >(`/v1/admin/users/${encodeURIComponent(input.userId)}/roles`, {
    schema: adminAssignUserRoleEnvelopeSchema,
    method: "POST",
    body: { roleId: input.roleId },
    signal,
    idempotencyKey,
    auditReason: reason,
    requireRecentMfa: true,
  });
  return {
    assigned: response.data.assigned,
    requestId: response.meta.requestId,
  };
}

export type RemoveUserRoleInput = {
  userId: string;
  roleId: string;
  reason?: string;
  idempotencyKey?: string;
};

export async function removeUserRole(
  input: RemoveUserRoleInput,
  signal?: AbortSignal,
): Promise<{ removed: boolean; requestId: string }> {
  const reason = (input.reason ?? "Remove role from user").trim();
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "user.role.remove",
      target: `${input.userId}:${input.roleId}`,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return { removed: true, requestId: `mock_remove_${input.userId}` };
  }

  const response = await apiRequest<
    z.infer<typeof adminRemoveUserRoleEnvelopeSchema>
  >(
    `/v1/admin/users/${encodeURIComponent(input.userId)}/roles/${encodeURIComponent(input.roleId)}`,
    {
      schema: adminRemoveUserRoleEnvelopeSchema,
      method: "DELETE",
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );
  return {
    removed: response.data.removed,
    requestId: response.meta.requestId,
  };
}

export type CreateStaffInvitationInput = {
  email: string;
  roleId: string;
  name?: string;
  reason?: string;
  hardwareMfa?: boolean;
  idempotencyKey?: string;
};

export type CreateStaffInvitationResult = {
  invitation: AdminStaffInvitation;
  requestId: string;
  /** Present only on create for delivery boundary — never cache/list. */
  deliveryToken?: string;
};

export async function createStaffInvitation(
  input: CreateStaffInvitationInput,
  signal?: AbortSignal,
): Promise<CreateStaffInvitationResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invitation email is invalid");
  }
  if (!input.roleId) throw new Error("Invitation role is required");
  const reason = (input.reason ?? "Invite staff account").trim();
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const roles = readMockAdminRoles();
    const role = roles.find((r) => r.id === input.roleId);
    if (!role || role.system || role.id === "role_superadmin") {
      throw new Error("Protected roles cannot be assigned by invitation");
    }
    const invitation: AdminStaffInvitation = {
      id: crypto.randomUUID(),
      email,
      roleId: role.id,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      createdAt: new Date().toISOString(),
    };
    const prev = readMockStaffInvitations();
    writeMockStaffInvitations([
      invitation,
      ...prev.filter((item) => item.email !== email),
    ]);
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "staff.invitation.create",
      target: email,
      ip: "mock-admin-session",
      result: "Success",
      context: `${reason}; role ${role.id}; hardware MFA ${input.hardwareMfa ? "required" : "optional"}`,
    });
    return {
      invitation,
      requestId: `mock_invite_${invitation.id}`,
    };
  }

  const response = await apiRequest<
    InviteCreateEnvelope,
    { email: string; roleId: string; idempotencyKey?: string }
  >("/v1/admin/invitations/staff", {
    schema: adminStaffInvitationCreateEnvelopeSchema,
    method: "POST",
    body: {
      email,
      roleId: input.roleId,
      idempotencyKey,
    },
    signal,
    idempotencyKey,
    auditReason: reason,
    requireRecentMfa: true,
  });

  const { token, ...listSafe } = response.data;
  return {
    invitation: mapAdminStaffInvitationDto(listSafe),
    requestId: response.meta.requestId,
    deliveryToken: token,
  };
}

export type RevokeStaffInvitationInput = {
  invitationId: string;
  reason?: string;
  idempotencyKey?: string;
};

export async function revokeStaffInvitation(
  input: RevokeStaffInvitationInput,
  signal?: AbortSignal,
): Promise<{ id: string; status: string; requestId: string }> {
  const reason = (input.reason ?? "Revoke staff invitation").trim();
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const prev = readMockStaffInvitations();
    const next = prev.map((row) =>
      row.id === input.invitationId ? { ...row, status: "REVOKED" } : row,
    );
    writeMockStaffInvitations(next);
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "staff.invitation.revoke",
      target: input.invitationId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      id: input.invitationId,
      status: "REVOKED",
      requestId: `mock_revoke_${input.invitationId}`,
    };
  }

  const response = await apiRequest<
    z.infer<typeof adminStaffInvitationRevokeEnvelopeSchema>
  >(
    `/v1/admin/invitations/staff/${encodeURIComponent(input.invitationId)}/revoke`,
    {
      schema: adminStaffInvitationRevokeEnvelopeSchema,
      method: "POST",
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );
  return {
    id: response.data.id,
    status: response.data.status,
    requestId: response.meta.requestId,
  };
}

/**
 * Public ceremony: one-time accept with fragment token (AUT-120 pattern).
 * Caller must scrub URL fragment before invoking.
 */
export async function acceptStaffInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<{
  requiresMfa: boolean;
  activationHeld: boolean;
  userId?: string;
  requestId: string;
}> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error("Invitation token is required");

  if (shouldUseMockFixtures("auth")) {
    return {
      requiresMfa: true,
      activationHeld: false,
      userId: "mock_staff_user",
      requestId: "mock_accept_staff",
    };
  }

  const response = await apiRequest<AcceptEnvelope, { token: string }>(
    "/v1/invitations/staff/accept",
    {
      schema: staffInvitationAcceptEnvelopeSchema,
      method: "POST",
      body: { token: trimmed },
      signal,
    },
  );
  return {
    requiresMfa: Boolean(response.data.requiresMfa),
    activationHeld: Boolean(response.data.activationHeld),
    userId: response.data.userId,
    requestId: response.meta.requestId,
  };
}

export function isAdminAccessWriteApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

function invalidateAccessKeys(
  queryClient: ReturnType<typeof useQueryClient>,
  opts?: { userId?: string; roleId?: string },
) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.permissionGroups(),
  });
  void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.staffInvitations(),
  });
  void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
  if (opts?.userId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.user(opts.userId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.userRoles(opts.userId),
    });
  }
  if (opts?.roleId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.role(opts.roleId),
    });
  }
}

export function useSaveAdminRoleMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "role-save"],
    mutationFn: (input: SaveAdminRoleInput, signal) =>
      saveAdminRole(input, signal),
    onSuccess: (data) => {
      invalidateAccessKeys(queryClient, { roleId: data.role.id });
      if (data.roles) {
        queryClient.setQueryData(queryKeys.admin.roles(), data.roles);
      }
    },
  });
}

export function useArchiveAdminRoleMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "role-archive"],
    mutationFn: (input: ArchiveAdminRoleInput, signal) =>
      archiveAdminRole(input, signal),
    onSuccess: (data) => {
      invalidateAccessKeys(queryClient, { roleId: data.id });
    },
  });
}

export function useAssignUserRoleMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "user-role-assign"],
    mutationFn: (input: AssignUserRoleInput, signal) =>
      assignUserRole(input, signal),
    onSuccess: (_data, vars) => {
      invalidateAccessKeys(queryClient, { userId: vars.userId });
    },
  });
}

export function useRemoveUserRoleMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "user-role-remove"],
    mutationFn: (input: RemoveUserRoleInput, signal) =>
      removeUserRole(input, signal),
    onSuccess: (_data, vars) => {
      invalidateAccessKeys(queryClient, { userId: vars.userId });
    },
  });
}

export function useCreateStaffInvitationMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "staff-invitation-create"],
    mutationFn: (input: CreateStaffInvitationInput, signal) =>
      createStaffInvitation(input, signal),
    onSuccess: () => {
      invalidateAccessKeys(queryClient);
    },
  });
}

export function useRevokeStaffInvitationMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "staff-invitation-revoke"],
    mutationFn: (input: RevokeStaffInvitationInput, signal) =>
      revokeStaffInvitation(input, signal),
    onSuccess: () => {
      invalidateAccessKeys(queryClient);
    },
  });
}
