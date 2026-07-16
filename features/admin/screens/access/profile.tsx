"use client";

import {
  adminPanel,
  AdminButton,
  PanelHead,
  SettingsGroup,
  ControlDialog,
  Toggle,
} from "@/features/admin/ui";

import { Check, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  readVersionedStorage,
  writeVersionedStorage,
} from "@/shared/storage/versioned-storage";

const adminProfileStorageKey = "fersaku-admin-profile-settings";

const initialAdminProfile = {
  fullName: "Dinda Kusuma",
  jobTitle: "Head of Platform Operations",
  timezone: "Asia/Jakarta",
};

const initialAdminNotifications = {
  kyc: true,
  withdrawals: true,
  incidents: true,
  digest: false,
};

const adminProfileSchema = z.object({
  fullName: z.string(),
  jobTitle: z.string(),
  timezone: z.string(),
  notifications: z.object({
    kyc: z.boolean(),
    withdrawals: z.boolean(),
    incidents: z.boolean(),
    digest: z.boolean(),
  }),
});

type ProfileControl =
  { kind: "save" } | { kind: "session"; sessionId: string; device: string };

function ProfileInput({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <div className="flex h-11 overflow-hidden rounded-xl border border-[#dce1e9] bg-white">
        <input
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
          className="min-w-0 flex-1 px-3 text-[10px] outline-none"
        />
      </div>
    </label>
  );
}

function AdminProfileSettings() {
  const [saved, setSaved] = useState(false);
  const [control, setControl] = useState<ProfileControl | null>(null);
  const [profile, setProfile] = useState(initialAdminProfile);
  const [sessions, setSessions] = useState([
    {
      id: "current",
      device: "Chrome on Linux",
      ip: "103.28.54.11",
      active: "Now",
      current: true,
    },
    {
      id: "mobile",
      device: "Safari on iPhone",
      ip: "180.252.91.18",
      active: "2h ago",
      current: false,
    },
  ]);
  const [notifs, setNotifs] = useState(initialAdminNotifications);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readVersionedStorage({
        key: adminProfileStorageKey,
        version: 1,
        schema: adminProfileSchema,
        fallback: () => ({
          ...initialAdminProfile,
          notifications: initialAdminNotifications,
        }),
      });
      setProfile({
        fullName: stored.fullName,
        jobTitle: stored.jobTitle,
        timezone: stored.timezone,
      });
      setNotifs(stored.notifications);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const controlTitle =
    control?.kind === "save"
      ? "Save administrator profile"
      : control?.kind === "session"
        ? `Revoke ${control.device}`
        : "Administrator action";

  const confirmControl = () => {
    if (!control) return;
    if (control.kind === "save") {
      const persisted = writeVersionedStorage({
        key: adminProfileStorageKey,
        version: 1,
        data: { ...profile, notifications: notifs },
      });
      if (!persisted) throw new Error("Unable to persist admin profile");
      setSaved(true);
      return;
    }
    setSessions((current) =>
      current.filter((item) => item.id !== control.sessionId),
    );
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className={`${adminPanel} p-5 sm:p-7`}>
          <SettingsGroup
            title="Staff identity"
            desc="Your administrator identity is shown in every audit event."
          >
            <div className="flex items-center gap-4">
              <span className="grid size-16 place-items-center rounded-full bg-[#5b7cfa] text-sm font-black text-white">
                DK
              </span>
              <div>
                <button
                  type="button"
                  disabled
                  title="Photo uploads are available after object storage is connected"
                  className="rounded-lg border border-[#dce1e9] bg-white px-3 py-2 text-[8px] font-bold disabled:cursor-not-allowed"
                >
                  Upload new photo
                </button>
                <p className="mt-2 text-[7px] text-[#7d879b]">
                  PNG or JPG • maximum 2 MB
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <ProfileInput
                label="Full name"
                value={profile.fullName}
                onChange={(fullName) => {
                  setSaved(false);
                  setProfile((current) => ({ ...current, fullName }));
                }}
              />
              <ProfileInput
                label="Work email"
                value="dinda@fersaku.id"
                readOnly
              />
              <ProfileInput
                label="Job title"
                value={profile.jobTitle}
                onChange={(jobTitle) => {
                  setSaved(false);
                  setProfile((current) => ({ ...current, jobTitle }));
                }}
              />
              <ProfileInput
                label="Timezone"
                value={profile.timezone}
                onChange={(timezone) => {
                  setSaved(false);
                  setProfile((current) => ({ ...current, timezone }));
                }}
              />
            </div>
          </SettingsGroup>
          <SettingsGroup
            title="Personal notifications"
            desc="Important account events remain mandatory."
          >
            <div className="grid gap-3">
              {[
                ["kyc", "QRIS API KYC reviews"],
                ["withdrawals", "High-value withdrawal reviews"],
                ["incidents", "Provider and infrastructure incidents"],
                ["digest", "Daily operations digest"],
              ].map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-[#e1e5ed] p-4"
                >
                  <div>
                    <b className="block text-[9px]">{label}</b>
                    <span className="text-[7px] text-[#7d879b]">
                      Email and in-console notification
                    </span>
                  </div>
                  <Toggle
                    value={notifs[key as keyof typeof notifs]}
                    onChange={() => {
                      setSaved(false);
                      setNotifs({
                        ...notifs,
                        [key]: !notifs[key as keyof typeof notifs],
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </SettingsGroup>
          <div className="flex justify-end">
            <AdminButton onClick={() => setControl({ kind: "save" })}>
              <Check className="size-4" />
              {saved ? "Profile saved & audited" : "Save profile"}
            </AdminButton>
          </div>
        </section>
        <aside className="grid content-start gap-4">
          <section className={`${adminPanel} p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[10px] font-black">
                  Multi-factor authentication
                </h3>
                <p className="mt-1 text-[7px] text-[#7d879b]">
                  Required for Super Administrators
                </p>
              </div>
              <span title="MFA is mandatory for Super Administrators">
                <Toggle value disabled onChange={() => undefined} />
              </span>
            </div>
            <div className="mt-4 rounded-xl bg-[#edf1ff] p-3 text-[8px] text-[#536ba9]">
              Authenticator verified • Recovery codes generated 2 Jul 2026
            </div>
            <button
              type="button"
              disabled
              title="Recovery-code regeneration is available after the secure backend ceremony is connected"
              className="mt-3 h-9 w-full rounded-lg border border-[#dce1e9] text-[8px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
            >
              Regenerate recovery codes
            </button>
          </section>
          <section className={`${adminPanel} overflow-hidden`}>
            <PanelHead title="Trusted sessions" desc="Administrator devices" />
            <div>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-3 border-t border-[#e8eaf0] p-4"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-[#edf1ff]">
                    <ShieldCheck className="size-3.5 text-[#5b7cfa]" />
                  </span>
                  <div>
                    <b className="block text-[8px]">{session.device}</b>
                    <span className="text-[7px] text-[#7d879b]">
                      {session.ip} • {session.active}
                    </span>
                  </div>
                  {!session.current && (
                    <button
                      type="button"
                      onClick={() =>
                        setControl({
                          kind: "session",
                          sessionId: session.id,
                          device: session.device,
                        })
                      }
                      className="ml-auto text-[7px] font-bold text-[#c6534c]"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      {control && (
        <ControlDialog
          title={controlTitle}
          target={
            control.kind === "session"
              ? control.sessionId
              : "admin-profile:dinda@fersaku.id"
          }
          danger={control.kind === "session"}
          requiresRecentMfa={control.kind === "session"}
          onClose={() => setControl(null)}
          onConfirm={confirmControl}
        />
      )}
    </>
  );
}

export { AdminProfileSettings as AdminProfileScreen };
