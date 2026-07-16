"use client";

import {
  adminPanel,
  Metric,
  PanelHead,
  ControlDialog,
} from "@/features/admin/ui";

import Link from "next/link";
import { AlertTriangle, KeyRound, MoreHorizontal, Users } from "lucide-react";
import { useState } from "react";
import { useAdminRoles } from "@/features/admin/data";

function RolesPage() {
  const { data } = useAdminRoles();
  const adminRoles = data ?? [];
  const [cloneRole, setCloneRole] = useState<string | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Administrator roles"
          value={String(adminRoles.length)}
          note="1 protected system role"
        />
        <Metric
          label="Staff accounts"
          value="18"
          note="16 active • 2 invited"
        />
        <Metric
          label="Permission grants"
          value="142"
          note="Across all assignments"
        />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <PanelHead
          title="Access roles"
          desc="Each staff account inherits permissions from one or more roles"
        />
        <div className="grid gap-3 border-t border-[#e8eaf0] p-4 md:grid-cols-2 xl:grid-cols-3">
          {adminRoles.map((role) => (
            <article
              key={role.id}
              className="rounded-2xl border border-[#dfe3ec] bg-[#fbfcfe] p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span
                  className="grid size-10 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: role.color }}
                >
                  <KeyRound className="size-4" />
                </span>
                {role.system ? (
                  <span className="rounded-full bg-[#edf1ff] px-2 py-1 text-[7px] font-extrabold text-[#506fdf]">
                    PROTECTED
                  </span>
                ) : (
                  <MoreHorizontal className="size-4 text-[#8b95a8]" />
                )}
              </div>
              <h3 className="mt-5 text-[11px] font-black">{role.name}</h3>
              <p className="mt-2 min-h-10 text-[8px] leading-4 text-[#7d879b]">
                {role.description}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-[#e6e9ef] pt-4">
                <span className="flex items-center gap-1.5 text-[8px] font-bold text-[#748097]">
                  <Users className="size-3" />
                  {role.members} staff
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCloneRole(role.name)}
                    className="text-[8px] font-extrabold text-[#66738c]"
                  >
                    Clone
                  </button>
                  <Link
                    href={`/admin/roles/${role.id}`}
                    className="text-[8px] font-extrabold text-[#4f6fe1]"
                  >
                    Configure →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className={`${adminPanel} mt-4 p-5`}>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff5df] text-[#d18a24]">
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h3 className="text-[10px] font-black">Least-privilege policy</h3>
            <p className="mt-1 text-[8px] leading-4 text-[#7c879d]">
              Permission changes take effect immediately, revoke affected
              sessions, and create an immutable audit event containing the old
              and new grants.
            </p>
          </div>
        </div>
      </section>
      {cloneRole && (
        <ControlDialog
          title={`Clone ${cloneRole}`}
          onClose={() => setCloneRole(null)}
        />
      )}
    </>
  );
}

export { RolesPage as AdminRolesScreen };
