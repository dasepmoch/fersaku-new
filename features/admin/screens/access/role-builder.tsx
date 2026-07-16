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
import { useState } from "react";
import { useAdminPermissionGroups, useAdminRoles } from "@/features/admin/data";

function RoleBuilder({ id }: { id: string }) {
  const { data: roles } = useAdminRoles();
  const { data: groups } = useAdminPermissionGroups();
  const adminRoles = roles ?? [];
  const permissionGroups = groups ?? [];
  const isNew = id === "new";
  const role = adminRoles.find((item) => item.id === id);
  const defaults = new Set(
    isNew
      ? ["merchants.read", "risk.read"]
      : role?.id === "role_finance"
        ? [
            "merchants.read",
            "orders.refund",
            "payments.reconcile",
            "balance.adjust",
            "withdrawals.review",
            "withdrawals.approve",
            "audit.export",
          ]
        : permissionGroups.flatMap((group) =>
            group.permissions.map((permission) => permission[0]),
          ),
  );
  const [selected, setSelected] = useState<Set<string>>(defaults);
  const [saved, setSaved] = useState(false);
  const [assigning, setAssigning] = useState(false);
  if (!isNew && !role) return null;
  const roleForView = role ?? adminRoles[1];
  const togglePermission = (permission: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  const toggleGroup = (permissions: string[]) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = permissions.every((permission) => next.has(permission));
      permissions.forEach((permission) =>
        all ? next.delete(permission) : next.add(permission),
      );
      return next;
    });
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
                defaultValue={isNew ? "Custom operations role" : role?.name}
                className="w-full border-0 bg-transparent text-xl font-black tracking-[-.03em] outline-none"
              />
              <textarea
                defaultValue={
                  isNew
                    ? "Describe what this staff role is responsible for."
                    : role?.description
                }
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
                onClick={() => setSelected(new Set())}
                className="text-[8px] font-extrabold text-[#c6544d]"
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
                      <Toggle value={all} onChange={() => toggleGroup(keys)} />
                    </div>
                    <div>
                      {group.permissions.map(([permission, description]) => (
                        <label
                          key={permission}
                          className="flex cursor-pointer items-center gap-3 border-t border-[#e8eaf0] px-4 py-3.5"
                        >
                          <input
                            type="checkbox"
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
            <AdminButton secondary>Cancel</AdminButton>
            <AdminButton onClick={() => setSaved(true)}>
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
                onClick={() => setAssigning(true)}
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
                    <button className="ml-auto text-[#a0a8b7]">
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
            <button className="h-10 rounded-xl border border-[#efc8c4] bg-[#fff5f4] text-[8px] font-extrabold text-[#c6534c]">
              Delete custom role
            </button>
          )}
        </aside>
      </div>
      {assigning && (
        <ControlDialog
          title="Assign staff to role"
          onClose={() => setAssigning(false)}
        />
      )}
    </>
  );
}

export { RoleBuilder as AdminRoleBuilderScreen };
