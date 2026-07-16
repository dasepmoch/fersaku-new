"use client";

import { AdminButton, ControlDialog } from "@/features/admin/ui";

import Link from "next/link";
import {
  Check,
  Download,
  FileDown,
  Plus,
  RefreshCcw,
  UserCog,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAdminRoles } from "@/features/admin/data";
import { useRouter } from "next/navigation";
import { appendMockAuditEvent } from "@/features/admin/data/mock-audit";
import {
  readVersionedStorage,
  writeVersionedStorage,
} from "@/shared/storage/versioned-storage";
import { z } from "zod";

const staffInvitationStorageKey = "fersaku-admin-staff-invitations";
const staffInvitationSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    roleId: z.string(),
    roleName: z.string(),
    hardwareMfa: z.boolean(),
    invitedAt: z.string().datetime(),
    reason: z.string(),
  }),
);

export function AdminAction({ section }: { section: string }) {
  const router = useRouter();
  const [staffOpen, setStaffOpen] = useState(false);
  if (section === "merchants")
    return (
      <AdminButton
        disabled
        title="Merchants self-register through the canonical onboarding flow"
      >
        <Plus className="size-4" /> Invite merchant
      </AdminButton>
    );
  if (section === "users")
    return (
      <>
        <AdminButton onClick={() => setStaffOpen(true)}>
          <UserCog className="size-4" /> Add staff account
        </AdminButton>
        {staffOpen && <StaffInviteDialog onClose={() => setStaffOpen(false)} />}
      </>
    );
  if (section === "roles")
    return (
      <Link
        href="/admin/roles/new"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#11182a] px-4 text-[10px] font-extrabold text-white"
      >
        <Plus className="size-4" /> Create custom role
      </Link>
    );
  if (section === "audit-logs")
    return (
      <AdminButton
        secondary
        onClick={() =>
          window.dispatchEvent(new Event("fersaku-admin-audit-export"))
        }
      >
        <FileDown className="size-4" /> Export trail
      </AdminButton>
    );
  if (section === "system")
    return (
      <AdminButton
        disabled
        title="Configuration is managed through a versioned release"
      >
        <Check className="size-4" /> Publish configuration
      </AdminButton>
    );
  return (
    <div className="flex gap-2">
      <AdminButton
        secondary
        disabled
        title="Export is available only on views with a typed export contract"
      >
        <Download className="size-4" /> Export
      </AdminButton>
      <AdminButton onClick={() => router.refresh()}>
        <RefreshCcw className="size-4" /> Refresh data
      </AdminButton>
    </div>
  );
}
function StaffInviteDialog({ onClose }: { onClose: () => void }) {
  const { data: roles } = useAdminRoles();
  const adminRoles = (roles ?? []).filter(
    (role) => !role.system && role.id !== "role_superadmin",
  );
  const [sent, setSent] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [hardwareMfa, setHardwareMfa] = useState(true);
  const canSend =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    roleId.length > 0;
  const confirmInvitation = (reason: string) => {
    if (!canSend) throw new Error("Invitation data is incomplete");
    const selectedRole = adminRoles.find((role) => role.id === roleId);
    if (
      !selectedRole ||
      selectedRole.system ||
      selectedRole.id === "role_superadmin"
    ) {
      throw new Error("Protected roles cannot be assigned by invitation");
    }
    const normalizedEmail = email.trim().toLowerCase();
    const invitations = readVersionedStorage({
      key: staffInvitationStorageKey,
      version: 1,
      schema: staffInvitationSchema,
      fallback: () => [],
    });
    const invitation = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      roleId: selectedRole.id,
      roleName: selectedRole.name,
      hardwareMfa,
      invitedAt: new Date().toISOString(),
      reason,
    };
    const persisted = writeVersionedStorage({
      key: staffInvitationStorageKey,
      version: 1,
      data: [
        invitation,
        ...invitations.filter((item) => item.email !== normalizedEmail),
      ],
    });
    if (!persisted) throw new Error("Unable to persist mock invitation");
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "staff.invitation.create",
      target: normalizedEmail,
      ip: "mock-admin-session",
      result: "Success",
      context: `${reason}; role ${selectedRole.id}; hardware MFA ${hardwareMfa ? "required" : "optional"}`,
    });
    setSent(true);
  };
  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-[#080d1b]/65 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-invite-title"
        className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl"
      >
        {sent ? (
          <div className="py-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#e9f7ef] text-[#287d4c]">
              <Check className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-black">Staff invitation sent</h3>
            <p className="mt-2 text-[9px] text-[#7d879b]">
              The selected role and permission snapshot were stored in the audit
              trail.
            </p>
            <button
              onClick={onClose}
              className="mt-6 h-10 w-full rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start">
              <span className="grid size-11 place-items-center rounded-xl bg-[#edf1ff] text-[#5b7cfa]">
                <UserCog className="size-5" />
              </span>
              <button
                onClick={onClose}
                aria-label="Close staff invitation"
                className="ml-auto"
              >
                <X className="size-4" />
              </button>
            </div>
            <h3 id="staff-invite-title" className="mt-5 text-lg font-black">
              Invite staff account
            </h3>
            <p className="mt-1 text-[9px] text-[#7d879b]">
              Access remains inactive until the invitation is accepted and MFA
              is configured.
            </p>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-[9px] font-extrabold">
                Full name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Staff member name"
                  className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px] outline-none focus:border-[#5b7cfa]"
                />
              </label>
              <label className="grid gap-2 text-[9px] font-extrabold">
                Work email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="staff@fersaku.id"
                  className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px] outline-none focus:border-[#5b7cfa]"
                />
              </label>
              <label className="grid gap-2 text-[9px] font-extrabold">
                Initial role
                <select
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                  className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px] outline-none"
                >
                  <option value="" disabled>
                    Select a role
                  </option>
                  {adminRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[8px] text-[#737e93]">
                <input
                  type="checkbox"
                  checked={hardwareMfa}
                  onChange={(event) => setHardwareMfa(event.target.checked)}
                />{" "}
                Require hardware-backed MFA for privileged actions
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={onClose}
                className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => setConfirmationOpen(true)}
                className="h-10 flex-1 rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
              >
                Send invitation
              </button>
            </div>
          </>
        )}
        {confirmationOpen && (
          <ControlDialog
            title="Invite staff account"
            target={email.trim().toLowerCase() || "new-staff-invitation"}
            requiresRecentMfa
            auditHandledExternally
            onClose={() => setConfirmationOpen(false)}
            onConfirm={confirmInvitation}
          />
        )}
      </div>
    </div>
  );
}
