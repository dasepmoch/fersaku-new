"use client";

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
import { adminRoles } from "@/lib/admin-mock-data";

export function AdminAction({ section }: { section: string }) {
  const [staffOpen, setStaffOpen] = useState(false);
  if (section === "merchants")
    return (
      <AdminButton>
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
      <AdminButton secondary>
        <FileDown className="size-4" /> Export trail
      </AdminButton>
    );
  if (section === "system")
    return (
      <AdminButton>
        <Check className="size-4" /> Publish configuration
      </AdminButton>
    );
  return (
    <div className="flex gap-2">
      <AdminButton secondary>
        <Download className="size-4" /> Export
      </AdminButton>
      <AdminButton>
        <RefreshCcw className="size-4" /> Refresh data
      </AdminButton>
    </div>
  );
}
function AdminButton({
  children,
  secondary = false,
  onClick,
}: {
  children: React.ReactNode;
  secondary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-extrabold transition ${secondary ? "border border-[#d8dde8] bg-white text-[#3c465d] hover:bg-[#f8f9fb]" : "bg-[#11182a] text-white hover:-translate-y-0.5 hover:bg-[#202b48]"}`}
    >
      {children}
    </button>
  );
}
function StaffInviteDialog({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-[#080d1b]/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
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
              <button onClick={onClose} className="ml-auto">
                <X className="size-4" />
              </button>
            </div>
            <h3 className="mt-5 text-lg font-black">Invite staff account</h3>
            <p className="mt-1 text-[9px] text-[#7d879b]">
              Access remains inactive until the invitation is accepted and MFA
              is configured.
            </p>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-[9px] font-extrabold">
                Full name
                <input
                  placeholder="Staff member name"
                  className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px] outline-none focus:border-[#5b7cfa]"
                />
              </label>
              <label className="grid gap-2 text-[9px] font-extrabold">
                Work email
                <input
                  type="email"
                  placeholder="staff@fersaku.id"
                  className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px] outline-none focus:border-[#5b7cfa]"
                />
              </label>
              <label className="grid gap-2 text-[9px] font-extrabold">
                Initial role
                <select className="h-11 rounded-xl border border-[#dce1e9] px-3 text-[10px] outline-none">
                  {adminRoles.map((role) => (
                    <option key={role.id}>{role.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[8px] text-[#737e93]">
                <input type="checkbox" defaultChecked /> Require hardware-backed
                MFA for privileged actions
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
                onClick={() => setSent(true)}
                className="h-10 flex-1 rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
              >
                Send invitation
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
