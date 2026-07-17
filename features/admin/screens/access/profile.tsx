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
import { useMemo, useState } from "react";
import {
  toMfaRegenerateRecoveryRequest,
  useMfaRegenerateRecoveryMutation,
} from "@/features/auth";
import { useSessionClaims } from "@/shared/auth/session-provider";
import { getDomainSource } from "@/shared/data/domain-source";
import {
  demoAdminProfile,
  demoAdminSessions,
  isAdminProfileApiDomain,
  profileInitials,
  useAdminProfile,
  useAdminSessions,
  usePatchAdminNotificationPreferencesMutation,
  usePatchAdminProfileMutation,
  useRevokeAdminSessionMutation,
  type AdminSession,
} from "@/features/admin/profile";

type ProfileControl =
  | { kind: "save" }
  | { kind: "session"; sessionId: string; device: string }
  | { kind: "recovery" };

type ProfileDraft = {
  fullName: string;
  jobTitle: string;
  timezone: string;
  kyc: boolean;
  withdrawals: boolean;
  incidents: boolean;
  digest: boolean;
};

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
  const claims = useSessionClaims();
  const authIsApi = getDomainSource("auth") === "api";
  const profileIsApi = isAdminProfileApiDomain();

  const { data: serverProfile } = useAdminProfile();
  const { data: serverSessions } = useAdminSessions();
  const patchProfile = usePatchAdminProfileMutation();
  const patchPrefs = usePatchAdminNotificationPreferencesMutation();
  const revokeSession = useRevokeAdminSessionMutation();
  const regenerateRecovery = useMfaRegenerateRecoveryMutation();

  const [saved, setSaved] = useState(false);
  const [control, setControl] = useState<ProfileControl | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  /** Mock-only session list when auth domain is mock (no localStorage truth). */
  const [mockSessions, setMockSessions] = useState<AdminSession[]>(() =>
    demoAdminSessions(),
  );
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [recoveryPrompt, setRecoveryPrompt] = useState(false);

  const baseProfile = serverProfile ?? (profileIsApi ? null : demoAdminProfile());

  const fullName = draft?.fullName ?? baseProfile?.fullName ?? "";
  const jobTitle = draft?.jobTitle ?? baseProfile?.jobTitle ?? "";
  const timezone = draft?.timezone ?? baseProfile?.timezone ?? "Asia/Jakarta";
  const email = baseProfile?.email ?? "";
  const revision = baseProfile?.revision ?? 1;
  const initials =
    baseProfile?.initials ??
    (fullName ? profileInitials(fullName) : "—");
  const kyc = draft?.kyc ?? baseProfile?.kyc ?? true;
  const withdrawals = draft?.withdrawals ?? baseProfile?.withdrawals ?? true;
  const incidents = draft?.incidents ?? baseProfile?.incidents ?? true;
  const digest = draft?.digest ?? baseProfile?.digest ?? false;

  const mfaEnabled = authIsApi
    ? Boolean(claims?.mfaEnabled ?? baseProfile?.mfaEnabled)
    : true;

  const sessions: AdminSession[] = profileIsApi
    ? (serverSessions ?? [])
    : mockSessions;

  const busy =
    patchProfile.isPending ||
    patchPrefs.isPending ||
    revokeSession.isPending ||
    regenerateRecovery.isPending;

  const touch = (patch: Partial<ProfileDraft>) => {
    setSaved(false);
    setDraft((current) => ({
      fullName: current?.fullName ?? baseProfile?.fullName ?? "",
      jobTitle: current?.jobTitle ?? baseProfile?.jobTitle ?? "",
      timezone: current?.timezone ?? baseProfile?.timezone ?? "Asia/Jakarta",
      kyc: current?.kyc ?? baseProfile?.kyc ?? true,
      withdrawals: current?.withdrawals ?? baseProfile?.withdrawals ?? true,
      incidents: current?.incidents ?? baseProfile?.incidents ?? true,
      digest: current?.digest ?? baseProfile?.digest ?? false,
      ...patch,
    }));
  };

  const notifs = useMemo(
    () => ({ kyc, withdrawals, incidents, digest }),
    [kyc, withdrawals, incidents, digest],
  );

  const controlTitle =
    control?.kind === "save"
      ? "Save administrator profile"
      : control?.kind === "session"
        ? `Revoke ${control.device}`
        : control?.kind === "recovery"
          ? "Regenerate recovery codes"
          : "Administrator action";

  const confirmControl = async (reason: string) => {
    if (!control) return;

    if (control.kind === "save") {
      if (profileIsApi) {
        if (!baseProfile) throw new Error("Profile not loaded");
        await patchProfile.mutateAsync({
          expectedVersion: revision,
          displayName: fullName.trim(),
          timezone: timezone.trim(),
        });
        const prefsPatch: {
          kyc?: boolean;
          withdrawals?: boolean;
          incidents?: boolean;
          digest?: boolean;
        } = {};
        if (kyc !== baseProfile.kyc) prefsPatch.kyc = kyc;
        if (withdrawals !== baseProfile.withdrawals)
          prefsPatch.withdrawals = withdrawals;
        if (incidents !== baseProfile.incidents)
          prefsPatch.incidents = incidents;
        if (digest !== baseProfile.digest) prefsPatch.digest = digest;
        if (Object.keys(prefsPatch).length > 0) {
          await patchPrefs.mutateAsync(prefsPatch);
        }
        setDraft(null);
        setSaved(true);
        return;
      }
      // Mock path: in-memory only — no localStorage as truth.
      setDraft({
        fullName: fullName.trim(),
        jobTitle: jobTitle.trim(),
        timezone: timezone.trim(),
        kyc,
        withdrawals,
        incidents,
        digest,
      });
      setSaved(true);
      return;
    }

    if (control.kind === "session") {
      if (profileIsApi) {
        await revokeSession.mutateAsync({
          sessionId: control.sessionId,
          reason,
        });
        return;
      }
      setMockSessions((current) =>
        current.filter((item) => item.id !== control.sessionId),
      );
      return;
    }

    if (control.kind === "recovery") {
      if (!authIsApi) {
        setRecoveryCodes([
          "FRSK-R01A",
          "FRSK-R02B",
          "FRSK-R03C",
          "FRSK-R04D",
          "FRSK-R05E",
          "FRSK-R06F",
        ]);
        return;
      }
      const code = recoveryCodeInput.trim();
      if (!code) throw new Error("Authenticator code required");
      const result = await regenerateRecovery.mutateAsync(
        toMfaRegenerateRecoveryRequest({ code }),
      );
      if (!result.ok) throw new Error("Unable to regenerate recovery codes");
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryCodeInput("");
      setRecoveryPrompt(false);
    }
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
                {initials}
              </span>
              <div>
                <button
                  type="button"
                  disabled
                  title="Personal photo upload is out of scope for launch (INT-175 deferred)"
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
                value={fullName}
                onChange={(value) => touch({ fullName: value })}
              />
              <ProfileInput label="Work email" value={email} readOnly />
              <ProfileInput
                label="Job title"
                value={jobTitle}
                onChange={(value) => touch({ jobTitle: value })}
              />
              <ProfileInput
                label="Timezone"
                value={timezone}
                onChange={(value) => touch({ timezone: value })}
              />
            </div>
          </SettingsGroup>
          <SettingsGroup
            title="Personal notifications"
            desc="Important account events remain mandatory."
          >
            <div className="grid gap-3">
              {(
                [
                  ["kyc", "QRIS API KYC reviews"],
                  ["withdrawals", "High-value withdrawal reviews"],
                  ["incidents", "Provider and infrastructure incidents"],
                  ["digest", "Daily operations digest"],
                ] as const
              ).map(([key, label]) => (
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
                    value={notifs[key]}
                    onChange={() => {
                      touch({ [key]: !notifs[key] });
                    }}
                  />
                </div>
              ))}
            </div>
          </SettingsGroup>
          <div className="flex justify-end">
            <AdminButton
              disabled={busy || (profileIsApi && !baseProfile)}
              onClick={() => setControl({ kind: "save" })}
            >
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
                <Toggle value={mfaEnabled} disabled onChange={() => undefined} />
              </span>
            </div>
            <div className="mt-4 rounded-xl bg-[#edf1ff] p-3 text-[8px] text-[#536ba9]">
              {mfaEnabled
                ? recoveryCodes && recoveryCodes.length > 0
                  ? `Authenticator verified • ${recoveryCodes.length} recovery codes (copy now — shown once)`
                  : "Authenticator verified • Recovery codes available via regenerate"
                : "MFA enrollment required before console access"}
            </div>
            {recoveryCodes && recoveryCodes.length > 0 ? (
              <ul className="mt-3 grid gap-1 rounded-lg border border-[#dce1e9] bg-white p-3 font-mono text-[8px]">
                {recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            ) : null}
            {recoveryPrompt && authIsApi ? (
              <label className="mt-3 grid gap-1 text-[8px] font-bold">
                Authenticator code
                <input
                  value={recoveryCodeInput}
                  onChange={(event) => setRecoveryCodeInput(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  className="h-9 rounded-lg border border-[#dce1e9] px-3 text-[9px] font-normal outline-none"
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={
                busy ||
                !mfaEnabled ||
                (recoveryPrompt && authIsApi && recoveryCodeInput.trim().length < 6)
              }
              title={
                mfaEnabled
                  ? "Regenerate recovery codes (requires recent authenticator code)"
                  : "Enable MFA before regenerating recovery codes"
              }
              onClick={() => {
                if (authIsApi && !recoveryPrompt) {
                  setRecoveryCodeInput("");
                  setRecoveryPrompt(true);
                  return;
                }
                setControl({ kind: "recovery" });
              }}
              className="mt-3 h-9 w-full rounded-lg border border-[#dce1e9] text-[8px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
            >
              {recoveryPrompt && authIsApi
                ? "Confirm regenerate"
                : "Regenerate recovery codes"}
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
                      disabled={busy}
                      onClick={() =>
                        setControl({
                          kind: "session",
                          sessionId: session.id,
                          device: session.device,
                        })
                      }
                      className="ml-auto text-[7px] font-bold text-[#c6534c] disabled:opacity-45"
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
              : control.kind === "recovery"
                ? "admin-mfa-recovery"
                : `admin-profile:${email || "self"}`
          }
          danger={control.kind === "session" || control.kind === "recovery"}
          requiresRecentMfa={
            control.kind === "session" || control.kind === "recovery"
          }
          auditHandledExternally={profileIsApi || authIsApi}
          onClose={() => {
            setControl(null);
            setRecoveryCodeInput("");
            setRecoveryPrompt(false);
          }}
          onConfirm={confirmControl}
        />
      )}
    </>
  );
}

export { AdminProfileSettings as AdminProfileScreen };
