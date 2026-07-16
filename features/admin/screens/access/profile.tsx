"use client";

import {
  adminPanel,
  AdminButton,
  PanelHead,
  SettingsGroup,
  AdminInput,
  Toggle,
} from "@/features/admin/ui";

import { Check, ShieldCheck } from "lucide-react";
import { useState } from "react";

function AdminProfileSettings() {
  const [saved, setSaved] = useState(false);
  const [mfa, setMfa] = useState(true);
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
  const [notifs, setNotifs] = useState({
    risk: true,
    withdrawals: true,
    incidents: true,
    digest: false,
  });
  return (
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
              <button className="rounded-lg border border-[#dce1e9] bg-white px-3 py-2 text-[8px] font-bold">
                Upload new photo
              </button>
              <p className="mt-2 text-[7px] text-[#7d879b]">
                PNG or JPG • maximum 2 MB
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <AdminInput label="Full name" value="Dinda Kusuma" />
            <AdminInput label="Work email" value="dinda@fersaku.id" />
            <AdminInput label="Job title" value="Head of Platform Operations" />
            <AdminInput label="Timezone" value="Asia/Jakarta" />
          </div>
        </SettingsGroup>
        <SettingsGroup
          title="Personal notifications"
          desc="Security events remain mandatory."
        >
          <div className="grid gap-3">
            {[
              ["risk", "Critical risk cases"],
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
                  onChange={() =>
                    setNotifs({
                      ...notifs,
                      [key]: !notifs[key as keyof typeof notifs],
                    })
                  }
                />
              </div>
            ))}
          </div>
        </SettingsGroup>
        <div className="flex justify-end">
          <AdminButton onClick={() => setSaved(true)}>
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
            <Toggle value={mfa} onChange={() => setMfa(!mfa)} />
          </div>
          <div className="mt-4 rounded-xl bg-[#edf1ff] p-3 text-[8px] text-[#536ba9]">
            Authenticator verified • Recovery codes generated 2 Jul 2026
          </div>
          <button className="mt-3 h-9 w-full rounded-lg border border-[#dce1e9] text-[8px] font-bold">
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
                    onClick={() =>
                      setSessions((current) =>
                        current.filter((item) => item.id !== session.id),
                      )
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
  );
}

export { AdminProfileSettings as AdminProfileScreen };
