import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminPermissionGroup, AdminRole } from "./contracts";
import { mockPermissionGroups, mockRoles } from "./mock";

export function demoAdminRoles(): AdminRole[] {
  return mockRoles();
}

export function demoPermissionGroups(): AdminPermissionGroup[] {
  return mockPermissionGroups();
}

export async function listAdminRoles(
  signal?: AbortSignal,
): Promise<AdminRole[]> {
  if (!isLiveApi()) return demoAdminRoles();
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
