"use client";

import {
  adminPanel,
  AdminButton,
  AdminStatus,
  ControlDialog,
  Toggle,
} from "@/features/admin/ui";

import {
  Check,
  FileClock,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  useAdminPermissionGroups,
  useAdminRoles,
  useAdminRolesWriteEnabled,
  useSaveAdminRoleMutation,
} from "@/features/admin/data";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";

function RoleBuilder({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useAdminRolesWriteEnabled();
  const saveMutation = useSaveAdminRoleMutation();
  const { data: roles } = useAdminRoles();
  const { data: groups } = useAdminPermissionGroups();
  const adminRoles = roles ?? [];
  const permissionGroups = groups ?? [];
  const isNew = id === "new";
  const role = adminRoles.find((item) => item.id === id);
  const allPermissions = permissionGroups.flatMap((group) =>
    group.permissions.map((permission) => permission[0]),
  );
  const defaultPermissions = isNew
    ? ["merchants.read", "payments.read"]
    : (role?.permissions ?? (role?.system ? allPermissions : []));
  const defaultPermissionsSignature = defaultPermissions.join("|");
  const defaultName = isNew ? "Custom operations role" : (role?.name ?? "");
  const defaultDescription = isNew
    ? "Describe what this staff role is responsible for."
    : (role?.description ?? "");
  const isProtected = Boolean(role?.system);
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [persistedRoleId, setPersistedRoleId] = useState<string | null>(null);
  const [expectedVersion, setExpectedVersion] = useState<number | undefined>(
    role?.version,
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const permissions = defaultPermissionsSignature
        ? defaultPermissionsSignature.split("|")
        : [];
      setName(defaultName);
      setDescription(defaultDescription);
      setSelected(new Set(permissions));
      setExpectedVersion(role?.version);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    defaultDescription,
    defaultName,
    defaultPermissionsSignature,
    role?.version,
  ]);
  if (!isNew && !role) return null;
  const roleForView =
    role ??
    adminRoles.find((candidate) => candidate.id === persistedRoleId) ??
    adminRoles[1];
  const togglePermission = (permission: string) => {
    if (isProtected || !canWrite) return;
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };
  const toggleGroup = (permissions: string[]) => {
    if (isProtected || !canWrite) return;
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      const all = permissions.every((permission) => next.has(permission));
      permissions.forEach((permission) =>
        all ? next.delete(permission) : next.add(permission),
      );
      return next;
    });
  };
  const persistRole = async (reason: string) => {
    if (isProtected) throw new Error("Protected roles are read-only");
    if (!canWrite) throw new Error("Requires roles.write permission");
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    if (normalizedName.length < 3 || normalizedDescription.length < 12) {
      throw new Error("Role name or description is incomplete");
    }
    try {
      const result = await saveMutation.mutateAsync({
        id: isNew ? (persistedRoleId ?? undefined) : role?.id,
        name: normalizedName,
        description: normalizedDescription,
        permissions: [...selected],
        expectedVersion,
        reason,
      });
      if (result.roles) {
        queryClient.setQueryData(queryKeys.admin.roles(), result.roles);
      } else {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.admin.roles(),
        });
      }
      setPersistedRoleId(result.role.id);
      setExpectedVersion(result.role.version);
      setName(normalizedName);
      setDescription(normalizedDescription);
      setSaved(true);
    } catch (error) {
      // Preserve form selections on conflict (409) — do not clear selected.
      setSaved(false);
      throw error;
    }
  };
  const writeBlocked = isProtected || !canWrite;
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <section className={`${adminPanel} p-5 sm:p-7`}>
          <div className="flex flex-col gap-4 border-b border-[#e5e8ef] pb-6 sm:flex-row sm:items-start">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#edf1ff] text-[#5b7cfa]">
              <KeyRound className="size-5" />
            </span>
            <div className="flex-1">
              <input
                value={name}
                readOnly={writeBlocked}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
                className="w-full border-0 bg-transparent text-xl font-black tracking-[-.03em] outline-none"
              />
              <textarea
                value={description}
                readOnly={writeBlocked}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setSaved(false);
                }}
                rows={2}
                className="mt-2 w-full resize-none border-0 bg-transparent text-[9px] leading-4 text-[#7d879b] outline-none"
              />
            </div>
            <AdminStatus status={isNew ? "Draft" : "Active"} />
          </div>
          <div className="mt-7">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[11px] font-black">Permission matrix</h3>
                <p className="mt-1 text-[8px] text-[#8791a5]">
                  {selected.size} permissions currently granted
                </p>
              </div>
              <button
                type="button"
                disabled={writeBlocked}
                title={
                  isProtected
                    ? "Protected system roles are read-only"
                    : !canWrite
                      ? "Requires roles.write permission"
                      : undefined
                }
                onClick={() => {
                  setSelected(new Set());
                  setSaved(false);
                }}
                className="text-[8px] font-extrabold text-[#c6544d] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear all
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              {permissionGroups.map((group) => {
                const keys = group.permissions.map(
                  (permission) => permission[0],
                );
                const all = keys.every((permission) =>
                  selected.has(permission),
                );
                return (
                  <div
                    key={group.group}
                    className="overflow-hidden rounded-2xl border border-[#dfe3ec]"
                  >
                    <div className="flex items-center justify-between bg-[#f6f8fb] px-4 py-3">
                      <div>
                        <b className="text-[9px]">{group.group}</b>
                        <span className="ml-2 text-[7px] text-[#8b95a8]">
                          {
                            keys.filter((permission) =>
                              selected.has(permission),
                            ).length
                          }
                          /{keys.length} granted
                        </span>
                      </div>
                      <Toggle
                        value={all}
                        disabled={writeBlocked}
                        onChange={() => toggleGroup(keys)}
                      />
                    </div>
                    <div>
                      {group.permissions.map(([permission, description]) => (
                        <label
                          key={permission}
                          className={`flex items-center gap-3 border-t border-[#e8eaf0] px-4 py-3.5 ${writeBlocked ? "cursor-default" : "cursor-pointer"}`}
                        >
                          <input
                            type="checkbox"
                            disabled={writeBlocked}
                            checked={selected.has(permission)}
                            onChange={() => togglePermission(permission)}
                            className="size-4 accent-[#5b7cfa]"
                          />
                          <div>
                            <code className="text-[8px] font-bold text-[#405dca]">
                              {permission}
                            </code>
                            <p className="mt-1 text-[7px] text-[#8791a5]">
                              {description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-7 flex justify-end gap-2 border-t border-[#e5e8ef] pt-6">
            <AdminButton secondary onClick={() => router.push("/admin/roles")}>
              Cancel
            </AdminButton>
            <AdminButton
              disabled={writeBlocked}
              title={
                isProtected
                  ? "Protected system roles are read-only"
                  : !canWrite
                    ? "Requires roles.write permission"
                    : undefined
              }
              onClick={() => setSaveOpen(true)}
            >
              <Check className="size-4" />
              {saved ? "Role saved & audited" : "Save role permissions"}
            </AdminButton>
          </div>
        </section>
        <aside className="grid content-start gap-4">
          <section className={`${adminPanel} p-5`}>
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black">Assigned staff</h3>
              <button
                type="button"
                disabled
                title="Staff assignment uses roles.assign on the users surface"
                className="text-[8px] font-extrabold text-[#4f6fe1]"
              >
                + Assign staff
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {[
                ["Salsa Putri", "salsa@fersaku.id", "SP"],
                ["Niko Aditya", "niko@fersaku.id", "NA"],
                ["Fara Anindya", "fara@fersaku.id", "FA"],
              ]
                .slice(0, (roleForView?.members ?? 0) > 2 ? 3 : 2)
                .map((member) => (
                  <div key={member[1]} className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-[#e8ecf7] text-[8px] font-black">
                      {member[2]}
                    </span>
                    <div className="min-w-0">
                      <b className="block truncate text-[8px]">{member[0]}</b>
                      <span className="block truncate text-[7px] text-[#8993a6]">
                        {member[1]}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled
                      title="Staff removal is available after the backend role service is connected"
                      className="ml-auto text-[#a0a8b7]"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
            </div>
          </section>
          <section className={`${adminPanel} p-5`}>
            <h3 className="text-[10px] font-black">Security impact</h3>
            <div className="mt-4 grid gap-3">
              {[
                [ShieldCheck, "MFA required", "All assigned staff"],
                [FileClock, "Fully audited", "Every permission change"],
                [LockKeyhole, "Session rotation", "On privilege escalation"],
              ].map(([Icon, title, desc]) => (
                <div key={title as string} className="flex gap-3">
                  <Icon className="size-3.5 text-[#5b7cfa]" />
                  <div>
                    <b className="block text-[8px]">{title as string}</b>
                    <span className="text-[7px] text-[#8993a6]">
                      {desc as string}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {!isNew && role && !role.system && (
            <button
              type="button"
              disabled
              title="Role deletion is available after the backend role service is connected"
              className="h-10 rounded-xl border border-[#efc8c4] bg-[#fff5f4] text-[8px] font-extrabold text-[#c6534c]"
            >
              Delete custom role
            </button>
          )}
        </aside>
      </div>
      {saveOpen && !writeBlocked && (
        <ControlDialog
          title="Save role permissions"
          target={role?.id ?? persistedRoleId ?? "new-role"}
          requiresRecentMfa
          onConfirm={persistRole}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </>
  );
}

export { RoleBuilder as AdminRoleBuilderScreen };
