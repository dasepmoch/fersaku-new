import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminPermissionGroup, AdminRole } from "./contracts";
import { mockPermissionGroups, mockRoles } from "./mock";
import {
  readVersionedStorage,
  writeVersionedStorage,
} from "@/shared/storage/versioned-storage";
import { z } from "zod";

const mockRoleStoreKey = "fersaku-admin-roles";
const mockRoleStoreVersion = 1;

const mockRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  members: z.number().int().nonnegative(),
  system: z.boolean(),
  color: z.string(),
  permissions: z.array(z.string()),
});

const mockRoleStoreSchema = z.array(mockRoleSchema);

const fixturePermissions: Record<string, string[]> = {
  role_finance: [
    "merchants.read",
    "payments.read",
    "withdrawals.review",
    "withdrawals.approve",
    "audit.export",
  ],
  role_support: [
    "merchants.read",
    "merchants.update",
    "kyc.read",
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
    "kyc.read",
    "webhooks.read",
    "providers.read",
    "audit.export",
  ],
};

function fixtureRoles(): AdminRole[] {
  const allPermissions = mockPermissionGroups().flatMap((group) =>
    group.permissions.map(([permission]) => permission),
  );
  return mockRoles().map((role) => ({
    ...role,
    permissions:
      role.id === "role_superadmin"
        ? allPermissions
        : (fixturePermissions[role.id] ?? []),
  }));
}

/** Shared versioned mock role source used by all role screens and hooks. */
export function readMockAdminRoles(): AdminRole[] {
  const fixtures = fixtureRoles();
  const stored = readVersionedStorage({
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
      ? { ...fixture, ...override, id: fixture.id, system: false }
      : fixture;
  });
  const customRoles = stored.filter(
    (role) => !fixtureIds.has(role.id) && !role.system,
  );
  return [...mergedFixtures, ...customRoles];
}

export function saveMockAdminRole(input: {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
}): { role: AdminRole; roles: AdminRole[] } {
  if (isLiveApi()) {
    throw new Error("Live role mutation adapter is not connected");
  }
  const current = readMockAdminRoles();
  const existing = input.id
    ? current.find((role) => role.id === input.id)
    : undefined;
  if (existing?.system) throw new Error("Protected roles are read-only");
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
  };
  const roles = existing
    ? current.map((candidate) => (candidate.id === id ? role : candidate))
    : [...current, role];
  const persisted = writeVersionedStorage({
    key: mockRoleStoreKey,
    version: mockRoleStoreVersion,
    data: roles,
  });
  if (!persisted) throw new Error("Unable to persist mock role store");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fersaku-admin-roles-updated"));
  }
  return { role, roles };
}

export function demoAdminRoles(): AdminRole[] {
  return fixtureRoles();
}

export function demoPermissionGroups(): AdminPermissionGroup[] {
  return mockPermissionGroups();
}

export async function listAdminRoles(
  signal?: AbortSignal,
): Promise<AdminRole[]> {
  if (!isLiveApi()) return readMockAdminRoles();
  const response = await apiRequest<ApiEnvelope<AdminRole[]>>(
    "/v1/admin/roles",
    {
      signal,
    },
  );
  return response.data;
}

export async function listPermissionGroups(
  signal?: AbortSignal,
): Promise<AdminPermissionGroup[]> {
  if (!isLiveApi()) return demoPermissionGroups();
  const response = await apiRequest<ApiEnvelope<AdminPermissionGroup[]>>(
    "/v1/admin/permissions",
    { signal },
  );
  return response.data;
}
