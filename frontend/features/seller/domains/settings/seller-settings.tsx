"use client";

import {
  AlertTriangle,
  Banknote,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  QrCode,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";
import { card, Modal, Preference, SettingsForm } from "./pieces";
import { IMPERSONATION_COMMANDS } from "@/features/admin/impersonation/policy";
import {
  isImpersonationSessionActive,
  readImpersonationSession,
} from "@/features/admin/impersonation/session";
import {
  toMfaConfirmRequest,
  toMfaDisableRequest,
  toPasswordChangeRequest,
  useMfaConfirmMutation,
  useMfaDisableMutation,
  useMfaEnrollMutation,
  usePasswordChangeMutation,
} from "@/features/auth";
import { useSessionClaims } from "@/shared/auth";
import { getDomainSource } from "@/shared/data/domain-source";
import { useSellerStoreId } from "@/shared/seller";
import {
  displayLabelToLocale,
  displayTimezoneToWire,
  isSellerBankApiDomain,
  isSellerSettingsApiDomain,
  useArchiveSellerBankAccount,
  useCreateSellerBankAccount,
  usePatchSellerNotificationPreferencesMutation,
  usePatchSellerProfileMutation,
  useSellerBankAccounts,
  useSellerProfile,
  useUpdateSellerBankAccount,
  type SellerBankAccount,
  type SellerProfile,
} from "@/features/seller/settings";

const NOTIFICATION_LABELS = [
  "Penjualan berhasil",
  "Pembayaran pending",
  "Stok hampir habis",
  "Payout berubah",
  "Login dari perangkat baru",
  "Ringkasan mingguan",
] as const;

type NotifKey =
  | "saleSuccess"
  | "paymentPending"
  | "lowStock"
  | "payoutChange"
  | "newDeviceLogin"
  | "weeklySummary";

const NOTIF_KEY_BY_LABEL: Record<(typeof NOTIFICATION_LABELS)[number], NotifKey> =
  {
    "Penjualan berhasil": "saleSuccess",
    "Pembayaran pending": "paymentPending",
    "Stok hampir habis": "lowStock",
    "Payout berubah": "payoutChange",
    "Login dari perangkat baru": "newDeviceLogin",
    "Ringkasan mingguan": "weeklySummary",
  };

function SellerProfileForm({
  profile,
  onChange,
}: {
  profile: Pick<
    SellerProfile,
    "displayName" | "email" | "localeLabel" | "timezone"
  >;
  onChange: (
    patch: Partial<
      Pick<SellerProfile, "displayName" | "localeLabel" | "timezone">
    >,
  ) => void;
}) {
  const fields = [
    ["Nama publik", "displayName", profile.displayName, false],
    ["Email", "email", profile.email, true],
    ["Bahasa", "localeLabel", profile.localeLabel, false],
    ["Zona waktu", "timezone", profile.timezone, false],
  ] as const;
  return (
    <div>
      <h2 className="text-sm font-extrabold">Profil pribadi</h2>
      <p className="mt-1 text-[10px] text-[#718078]">
        Informasi akun, preferensi bahasa, dan identitas publik.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {fields.map(([label, field, value, readOnly]) => (
          <label key={field} className="grid gap-2 text-[9px] font-bold">
            {label}
            <input
              value={value}
              readOnly={readOnly}
              onChange={(event) => {
                if (readOnly) return;
                if (field === "displayName") {
                  onChange({ displayName: event.target.value });
                  return;
                }
                if (field === "localeLabel") {
                  onChange({ localeLabel: event.target.value });
                  return;
                }
                if (field === "timezone") {
                  onChange({ timezone: event.target.value });
                }
              }}
              className="hairline h-11 rounded-xl border bg-white px-3 text-xs font-normal outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function SellerSettingsPro() {
  const [tab, setTab] = useState("Profil");
  const [bankModal, setBankModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mfaModal, setMfaModal] = useState<
    "setup" | "recovery" | "disable" | null
  >(null);
  const claims = useSessionClaims();
  const authIsApi = getDomainSource("auth") === "api";
  const settingsIsApi = isSellerSettingsApiDomain();
  const bankIsApi = isSellerBankApiDomain();
  const storeId = useSellerStoreId() ?? "";

  const { data: serverProfile } = useSellerProfile();
  const { data: serverBanks } = useSellerBankAccounts(storeId);
  const patchProfile = usePatchSellerProfileMutation();
  const patchPrefs = usePatchSellerNotificationPreferencesMutation();
  const createBank = useCreateSellerBankAccount(storeId);
  const updateBank = useUpdateSellerBankAccount(storeId);
  const archiveBank = useArchiveSellerBankAccount(storeId);
  const changePassword = usePasswordChangeMutation();

  /** Local override after enroll/disable; null = follow session claims (API) or mock default. */
  const [mfaOverride, setMfaOverride] = useState<boolean | null>(null);
  const mfa =
    mfaOverride ?? (authIsApi ? Boolean(claims?.mfaEnabled) : true);
  const [token, setToken] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollOtpauth, setEnrollOtpauth] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const enrollMutation = useMfaEnrollMutation();
  const confirmMutation = useMfaConfirmMutation();
  const disableMutation = useMfaDisableMutation();
  const [saved, setSaved] = useState(false);

  /** Draft for profile tab (API or mock). */
  const [profileDraft, setProfileDraft] = useState<{
    displayName: string;
    localeLabel: string;
    timezone: string;
  } | null>(null);

  /** Local-only notification draft keys without closed BE events. */
  const [localNotifDraft, setLocalNotifDraft] = useState<
    Partial<Record<NotifKey, boolean>>
  >({});

  const [passwordDraft, setPasswordDraft] = useState({
    current: "",
    next: "",
  });

  /** Mock-only bank list when sellerFinance is mock. */
  const [mockBanks, setMockBanks] = useState<SellerBankAccount[]>([
    {
      id: "bank_bca_demo",
      bank: "BCA",
      bankCode: "BCA",
      numberMasked: "•••• 4821",
      numberLast4: "4821",
      holder: "ASEP KURNIA",
      verified: true,
      primary: true,
      revision: 1,
      status: "VERIFIED",
    },
  ]);

  const profile: Pick<
    SellerProfile,
    | "displayName"
    | "email"
    | "localeLabel"
    | "timezone"
    | "revision"
    | "saleSuccess"
    | "paymentPending"
    | "lowStock"
    | "payoutChange"
    | "newDeviceLogin"
    | "weeklySummary"
  > = useMemo(() => {
    if (serverProfile) {
      return {
        displayName:
          profileDraft?.displayName ?? serverProfile.displayName,
        email: serverProfile.email,
        localeLabel: profileDraft?.localeLabel ?? serverProfile.localeLabel,
        timezone: profileDraft?.timezone ?? serverProfile.timezone,
        revision: serverProfile.revision,
        saleSuccess: serverProfile.saleSuccess,
        paymentPending:
          localNotifDraft.paymentPending ?? serverProfile.paymentPending,
        lowStock: localNotifDraft.lowStock ?? serverProfile.lowStock,
        payoutChange: serverProfile.payoutChange,
        newDeviceLogin: serverProfile.newDeviceLogin,
        weeklySummary: serverProfile.weeklySummary,
      };
    }
    return {
      displayName: profileDraft?.displayName ?? "Asep Kurnia",
      email: "asep@ai.tools",
      localeLabel: profileDraft?.localeLabel ?? "Bahasa Indonesia",
      timezone: profileDraft?.timezone ?? "Asia/Jakarta (GMT+7)",
      revision: 1,
      saleSuccess: localNotifDraft.saleSuccess ?? true,
      paymentPending: localNotifDraft.paymentPending ?? false,
      lowStock: localNotifDraft.lowStock ?? true,
      payoutChange: localNotifDraft.payoutChange ?? true,
      newDeviceLogin: localNotifDraft.newDeviceLogin ?? true,
      weeklySummary: localNotifDraft.weeklySummary ?? true,
    };
  }, [serverProfile, profileDraft, localNotifDraft]);

  const banks: SellerBankAccount[] = bankIsApi
    ? (serverBanks ?? [])
    : mockBanks;

  const notifValues: Record<NotifKey, boolean> = {
    saleSuccess:
      localNotifDraft.saleSuccess ?? profile.saleSuccess,
    paymentPending:
      localNotifDraft.paymentPending ?? profile.paymentPending,
    lowStock: localNotifDraft.lowStock ?? profile.lowStock,
    payoutChange:
      localNotifDraft.payoutChange ?? profile.payoutChange,
    newDeviceLogin:
      localNotifDraft.newDeviceLogin ?? profile.newDeviceLogin,
    weeklySummary:
      localNotifDraft.weeklySummary ?? profile.weeklySummary,
  };

  useEffect(() => {
    if (!enrollOtpauth || !qrCanvasRef.current) return;
    void QRCode.toCanvas(qrCanvasRef.current, enrollOtpauth, {
      width: 160,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#17231d", light: "#ffffff" },
    }).catch(() => {
      // Fail closed: keep chrome; never invent fake QR success.
    });
  }, [enrollOtpauth]);

  const openMfaSetup = async () => {
    if (!authIsApi) {
      setMfaModal("setup");
      return;
    }
    setEnrollSecret(null);
    setEnrollOtpauth(null);
    setToken("");
    setMfaModal("setup");
    const result = await enrollMutation.mutateAsync();
    if (!result.ok) {
      setMfaModal(null);
      return;
    }
    setEnrollSecret(result.secret);
    setEnrollOtpauth(result.otpauthUrl);
  };

  const confirmMfaSetup = async () => {
    if (!authIsApi) {
      setMfaOverride(true);
      setMfaModal("recovery");
      return;
    }
    const result = await confirmMutation.mutateAsync(
      toMfaConfirmRequest({ code: token }),
    );
    if (!result.ok) return;
    setEnrollSecret(null);
    setEnrollOtpauth(null);
    setMfaOverride(true);
    setRecoveryCodes(result.recoveryCodes);
    setMfaModal("recovery");
  };

  const disableMfaAction = async () => {
    if (!authIsApi) {
      setMfaOverride(false);
      setMfaModal(null);
      return;
    }
    if (!disableCode.trim()) return;
    const result = await disableMutation.mutateAsync(
      toMfaDisableRequest({ code: disableCode }),
    );
    if (!result.ok) return;
    setMfaOverride(false);
    setDisableCode("");
    setRecoveryCodes(null);
    setMfaModal(null);
  };

  const viewRecoveryCodes = async () => {
    if (!authIsApi) {
      setMfaModal("recovery");
      return;
    }
    // API mode: only show codes from last confirm/regenerate (component memory).
    if (recoveryCodes && recoveryCodes.length > 0) {
      setMfaModal("recovery");
      return;
    }
  };

  const closeMfaModal = () => {
    setMfaModal(null);
    setToken("");
    setDisableCode("");
    setEnrollSecret(null);
    setEnrollOtpauth(null);
  };

  const tabs = [
    ["Profil", Pencil],
    ["Bisnis", Banknote],
    ["Rekening bank", Banknote],
    ["Keamanan", ShieldCheck],
    ["Notifikasi", BellRing],
  ] as const;

  const editingBank =
    editingId === null
      ? null
      : banks.find((b) => b.id === editingId) ?? null;

  const saveBank = async (form: FormData) => {
    const bankCode = String(form.get("bank"));
    const number = String(form.get("number")).replace(/\s/g, "");
    const holder = String(form.get("holder")).toUpperCase();

    if (bankIsApi && storeId) {
      try {
        if (editingId && editingBank) {
          await updateBank.mutateAsync({
            bankId: editingId,
            expectedVersion: editingBank.revision,
            bankCode,
            bankName: bankCode,
            accountHolderName: holder,
            accountNumber: number || undefined,
          });
        } else {
          await createBank.mutateAsync({
            bankCode,
            bankName: bankCode,
            accountHolderName: holder,
            accountNumber: number,
            makePrimary: banks.length === 0,
          });
        }
        setBankModal(false);
        setEditingId(null);
      } catch {
        // Keep modal open on validation/conflict; no fake success.
      }
      return;
    }

    const last4 = number.slice(-4) || "0000";
    const row: SellerBankAccount = {
      id: editingId ?? `bank_local_${Date.now()}`,
      bank: bankCode,
      bankCode,
      numberMasked: `•••• ${last4}`,
      numberLast4: last4,
      holder,
      verified: true,
      primary: editingId
        ? Boolean(editingBank?.primary)
        : mockBanks.length === 0,
      revision: (editingBank?.revision ?? 0) + 1,
      status: "VERIFIED",
    };
    setMockBanks((old) =>
      editingId === null
        ? [...old, row]
        : old.map((x) => (x.id === editingId ? row : x)),
    );
    setBankModal(false);
    setEditingId(null);
  };

  const saveProfile = async (): Promise<boolean> => {
    const session = readImpersonationSession();
    if (
      session &&
      (!isImpersonationSessionActive(session) ||
        session.scope !== "support-write")
    ) {
      return false;
    }

    if (settingsIsApi && serverProfile) {
      try {
        await patchProfile.mutateAsync({
          expectedVersion: serverProfile.revision,
          displayName: profile.displayName.trim(),
          locale: displayLabelToLocale(profile.localeLabel),
          timezone: displayTimezoneToWire(profile.timezone),
        });

        const prefPatch: {
          newDeviceLogin?: boolean;
          payoutChange?: boolean;
          weeklySummary?: boolean;
          saleSuccess?: boolean;
        } = {};
        if (
          localNotifDraft.newDeviceLogin !== undefined &&
          localNotifDraft.newDeviceLogin !== serverProfile.newDeviceLogin
        ) {
          prefPatch.newDeviceLogin = localNotifDraft.newDeviceLogin;
        }
        if (
          localNotifDraft.payoutChange !== undefined &&
          localNotifDraft.payoutChange !== serverProfile.payoutChange
        ) {
          prefPatch.payoutChange = localNotifDraft.payoutChange;
        }
        if (
          localNotifDraft.weeklySummary !== undefined &&
          localNotifDraft.weeklySummary !== serverProfile.weeklySummary
        ) {
          prefPatch.weeklySummary = localNotifDraft.weeklySummary;
        }
        if (
          localNotifDraft.saleSuccess !== undefined &&
          localNotifDraft.saleSuccess !== serverProfile.saleSuccess
        ) {
          prefPatch.saleSuccess = localNotifDraft.saleSuccess;
        }
        if (Object.keys(prefPatch).length > 0) {
          await patchPrefs.mutateAsync(prefPatch);
        }
        setProfileDraft(null);
        setLocalNotifDraft({});
        return true;
      } catch {
        // 409/validation: keep draft; no fake success / no localStorage truth.
        return false;
      }
    }

    // Mock path: in-memory only (no localStorage source of truth on API path).
    setProfileDraft(null);
    return true;
  };

  const savePassword = async (): Promise<boolean> => {
    if (!authIsApi) return true;
    if (!passwordDraft.current.trim() || passwordDraft.next.trim().length < 12) {
      return false;
    }
    try {
      const result = await changePassword.mutateAsync(
        toPasswordChangeRequest({
          currentPassword: passwordDraft.current,
          newPassword: passwordDraft.next,
        }),
      );
      if (!result.ok) return false;
      setPasswordDraft({ current: "", next: "" });
      return true;
    } catch {
      return false;
    }
  };

  const saveNotifications = async (): Promise<boolean> => {
    if (!settingsIsApi || !serverProfile) return true;
    try {
      const prefPatch: {
        newDeviceLogin?: boolean;
        payoutChange?: boolean;
        weeklySummary?: boolean;
        saleSuccess?: boolean;
      } = {};
      if (notifValues.newDeviceLogin !== serverProfile.newDeviceLogin) {
        prefPatch.newDeviceLogin = notifValues.newDeviceLogin;
      }
      if (notifValues.payoutChange !== serverProfile.payoutChange) {
        prefPatch.payoutChange = notifValues.payoutChange;
      }
      if (notifValues.weeklySummary !== serverProfile.weeklySummary) {
        prefPatch.weeklySummary = notifValues.weeklySummary;
      }
      if (notifValues.saleSuccess !== serverProfile.saleSuccess) {
        prefPatch.saleSuccess = notifValues.saleSuccess;
      }
      if (Object.keys(prefPatch).length > 0) {
        await patchPrefs.mutateAsync(prefPatch);
      }
      setLocalNotifDraft({});
      return true;
    } catch {
      return false;
    }
  };

  const onSave = async () => {
    if (tab === "Profil") {
      if (!(await saveProfile())) return;
    } else if (tab === "Keamanan") {
      if (!(await savePassword())) return;
    } else if (tab === "Notifikasi") {
      if (!(await saveNotifications())) return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1700);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
      <nav className={`${card} h-fit p-2`}>
        {tabs.map(([label, Icon]) => (
          <button
            key={label}
            onClick={() => setTab(label)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-xs font-bold",
              tab === label ? "bg-[#e9ff9b] text-[#173f2c]" : "text-[#6e7b73]",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      <section className={`${card} p-5 sm:p-7`}>
        {tab === "Profil" && (
          <SellerProfileForm
            profile={profile}
            onChange={(patch) => {
              setSaved(false);
              setProfileDraft((current) => ({
                displayName:
                  current?.displayName ??
                  serverProfile?.displayName ??
                  profile.displayName,
                localeLabel:
                  current?.localeLabel ??
                  serverProfile?.localeLabel ??
                  profile.localeLabel,
                timezone:
                  current?.timezone ??
                  serverProfile?.timezone ??
                  profile.timezone,
                ...patch,
              }));
            }}
          />
        )}
        {tab === "Bisnis" && (
          <SettingsForm
            title="Informasi bisnis"
            description="Digunakan untuk verifikasi, invoice, dan limit transaksi."
            fields={[
              "Nama legal|Asep Kurnia",
              "Nama bisnis|Asep AI Tools",
              "Tipe bisnis|Perorangan",
              "NPWP|Opsional",
              "Alamat bisnis|Jakarta Selatan, DKI Jakarta",
            ]}
          />
        )}
        {tab === "Rekening bank" && (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-extrabold">Rekening payout</h2>
                <p className="mt-1 text-[10px] text-[#718078]">
                  Nama pemilik harus cocok dengan identitas terverifikasi.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingId(null);
                  setBankModal(true);
                }}
                className="flex h-10 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-[9px] font-extrabold text-white"
              >
                <Plus className="size-4" /> Tambah rekening
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              {banks.map((bank) => (
                <div
                  key={bank.id}
                  className="hairline flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-[#eaf0fb] text-[10px] font-black text-[#2855a5]">
                    {bank.bank}
                  </span>
                  <div>
                    <b className="block text-xs">
                      {bank.bank} •••• {bank.numberLast4}
                    </b>
                    <span className="text-[9px] text-[#718078]">
                      {bank.holder} • {bank.verified ? "Verified" : "Pending"}
                    </span>
                  </div>
                  {bank.primary && (
                    <span className="w-fit rounded-full bg-[#e5f5e6] px-2 py-1 text-[8px] font-extrabold text-[#2e714f]">
                      Primary
                    </span>
                  )}
                  <div className="flex gap-2 sm:ml-auto">
                    <button
                      onClick={() => {
                        setEditingId(bank.id);
                        setBankModal(true);
                      }}
                      className="hairline grid size-9 place-items-center rounded-xl border"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {banks.length > 1 && (
                      <button
                        onClick={() => {
                          if (bankIsApi && storeId) {
                            void archiveBank.mutateAsync(bank.id);
                            return;
                          }
                          setMockBanks((old) =>
                            old.filter((x) => x.id !== bank.id),
                          );
                        }}
                        className="hairline grid size-9 place-items-center rounded-xl border text-[#b2573c]"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-3 rounded-2xl border border-[#efd39a] bg-[#fff8e9] p-4 text-[9px] leading-5 text-[#806f4f]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Setiap perubahan rekening membuat withdrawal lock selama 24 jam,
              mencabut approval payout aktif, dan mencatat immutable audit
              event.
            </div>
          </>
        )}
        {tab === "Keamanan" && (
          <>
            <SettingsForm
              title="Password & sessions"
              description="Gunakan password unik dan review perangkat yang masih aktif."
              fields={[
                "Password saat ini|••••••••••",
                "Password baru|Minimal 12 karakter",
              ]}
              values={{
                "Password saat ini": passwordDraft.current,
                "Password baru": passwordDraft.next,
              }}
              types={{
                "Password saat ini": "password",
                "Password baru": "password",
              }}
              onChange={(label, value) => {
                setSaved(false);
                if (label === "Password saat ini") {
                  setPasswordDraft((p) => ({ ...p, current: value }));
                  return;
                }
                setPasswordDraft((p) => ({ ...p, next: value }));
              }}
            />
            <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-[#f5f5f0] p-4 sm:flex-row sm:items-center">
              <span className="grid size-11 place-items-center rounded-xl bg-white">
                <KeyRound className="size-5" />
              </span>
              <div>
                <b className="block text-[10px]">Authenticator MFA</b>
                <span className="text-[8px] text-[#718078]">
                  {mfa
                    ? "Aktif • recovery codes tersedia"
                    : "Belum aktif • sangat direkomendasikan"}
                </span>
              </div>
              <button
                onClick={() => {
                  if (mfa) {
                    setMfaModal("disable");
                    return;
                  }
                  void openMfaSetup();
                }}
                className={cn(
                  "h-10 rounded-xl px-4 text-[9px] font-extrabold sm:ml-auto",
                  mfa ? "hairline border bg-white" : "bg-[#173f2c] text-white",
                )}
              >
                {mfa ? "Kelola MFA" : "Aktifkan MFA"}
              </button>
            </div>
          </>
        )}
        {tab === "Notifikasi" && (
          <>
            <h2 className="text-sm font-extrabold">Notification routing</h2>
            <p className="mt-1 text-[10px] text-[#718078]">
              Pilih event penting untuk email dan dashboard.
            </p>
            <div className="mt-5 grid gap-2">
              {NOTIFICATION_LABELS.map((label) => {
                const key = NOTIF_KEY_BY_LABEL[label];
                return (
                  <Preference
                    key={label}
                    label={label}
                    value={notifValues[key]}
                    onChange={(next) => {
                      setSaved(false);
                      setLocalNotifDraft((d) => ({ ...d, [key]: next }));
                    }}
                  />
                );
              })}
            </div>
          </>
        )}
        <button
          onClick={() => {
            void onSave();
          }}
          data-impersonation-command={
            tab === "Profil"
              ? IMPERSONATION_COMMANDS.profileSupportUpdate
              : undefined
          }
          data-impersonation-fields={
            tab === "Profil" ? "displayName,locale,timezone" : undefined
          }
          className="mt-7 flex h-11 items-center gap-2 rounded-xl bg-[#173f2c] px-5 text-[10px] font-extrabold text-white"
        >
          {saved ? <Check className="size-4" /> : <Save className="size-4" />}
          {saved ? "Settings saved" : "Save changes"}
        </button>
      </section>
      {bankModal && (
        <Modal
          title={
            editingId === null ? "Tambah rekening payout" : "Edit rekening payout"
          }
          description={
            bankIsApi
              ? "Nomor rekening divalidasi server sebelum dapat dipakai untuk payout."
              : "Kami melakukan mock bank-account lookup sebelum rekening payout dapat dipakai."
          }
          onClose={() => {
            setBankModal(false);
            setEditingId(null);
          }}
        >
          <form
            action={(formData) => {
              void saveBank(formData);
            }}
            className="grid gap-4"
          >
            <label className="grid gap-2 text-[9px] font-bold">
              Bank
              <select
                name="bank"
                defaultValue={editingBank?.bankCode ?? "BCA"}
                className="hairline h-11 rounded-xl border bg-white px-3"
              >
                <option>BCA</option>
                <option>Mandiri</option>
                <option>BNI</option>
                <option>BRI</option>
                <option>CIMB Niaga</option>
                <option>Bank Syariah Indonesia</option>
              </select>
            </label>
            <label className="grid gap-2 text-[9px] font-bold">
              Nomor rekening
              <input
                name="number"
                required={editingId === null}
                defaultValue=""
                placeholder="Masukkan 8–16 digit"
                autoComplete="off"
                className="hairline h-11 rounded-xl border bg-white px-3"
              />
            </label>
            <label className="grid gap-2 text-[9px] font-bold">
              Nama pemilik
              <input
                name="holder"
                required
                defaultValue={editingBank?.holder ?? "ASEP KURNIA"}
                className="hairline h-11 rounded-xl border bg-white px-3 uppercase"
              />
            </label>
            <div className="rounded-xl bg-[#eef3e9] p-3 text-[9px] leading-5 text-[#65736b]">
              <CheckCircle2 className="mr-2 inline size-4 text-[#2e714f]" />
              Nama akan dicocokkan dengan profil identitas payout merchant;
              status KYC QRIS API tidak diperlukan untuk withdrawal storefront.
            </div>
            <button className="h-12 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white">
              Verify & save account
            </button>
          </form>
        </Modal>
      )}
      {mfaModal && (
        <Modal
          title={
            mfaModal === "disable"
              ? "Kelola authenticator MFA"
              : mfaModal === "recovery"
                ? "Recovery codes"
                : "Aktifkan authenticator MFA"
          }
          description="Tindakan keamanan ini akan dicatat dan seluruh sesi sensitif direvalidasi."
          onClose={closeMfaModal}
        >
          {mfaModal === "disable" ? (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => {
                  void viewRecoveryCodes();
                }}
                className="hairline h-11 rounded-xl border bg-white text-[10px] font-bold"
              >
                View recovery codes
              </button>
              {authIsApi ? (
                <label className="grid gap-2 text-[9px] font-bold">
                  Kode autentikator
                  <input
                    value={disableCode}
                    onChange={(e) =>
                      setDisableCode(
                        e.target.value.replace(/\s/g, "").slice(0, 12),
                      )
                    }
                    placeholder="000000"
                    className="hairline h-11 rounded-xl border bg-white px-3 text-center font-mono text-sm tracking-[.3em]"
                  />
                </label>
              ) : null}
              <button
                type="button"
                disabled={
                  authIsApi &&
                  (disableMutation.isPending || disableCode.trim().length < 6)
                }
                onClick={() => {
                  void disableMfaAction();
                }}
                className="h-11 rounded-xl bg-[#b64e38] text-[10px] font-extrabold text-white disabled:opacity-40"
              >
                Disable MFA after confirmation
              </button>
            </div>
          ) : mfaModal === "recovery" ? (
            <div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#111a16] p-4 font-mono text-[10px] text-[#d7ff64]">
                {(recoveryCodes ??
                  (authIsApi
                    ? []
                    : [
                        "FRSK-A92K",
                        "FRSK-J71P",
                        "FRSK-Q04X",
                        "FRSK-M88D",
                        "FRSK-W31C",
                        "FRSK-L52N",
                      ])
                ).map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const codes =
                    recoveryCodes ??
                    (authIsApi
                      ? []
                      : [
                          "FRSK-A92K",
                          "FRSK-J71P",
                          "FRSK-Q04X",
                          "FRSK-M88D",
                          "FRSK-W31C",
                          "FRSK-L52N",
                        ]);
                  if (codes.length === 0) return;
                  void navigator.clipboard?.writeText(codes.join("\n"));
                }}
                className="hairline mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white text-[9px] font-bold"
              >
                <Copy className="size-4" /> Copy recovery codes
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="hairline mx-auto grid size-40 place-items-center rounded-2xl border bg-white">
                {authIsApi && enrollOtpauth ? (
                  <canvas ref={qrCanvasRef} width={160} height={160} />
                ) : authIsApi ? (
                  <span className="text-[9px] text-[#718078]">
                    {enrollMutation.isPending ? "Memuat…" : "—"}
                  </span>
                ) : (
                  <QrCode className="size-32" strokeWidth={1.2} />
                )}
              </div>
              <div className="rounded-xl bg-[#eef3e9] p-3 text-center font-mono text-[10px]">
                {authIsApi
                  ? (enrollSecret ?? "—")
                  : "FRSK A4M8 Q2JP 7ZLE"}
              </div>
              <label className="grid gap-2 text-center text-[9px] font-bold">
                Masukkan token 6 digit
                <input
                  value={token}
                  onChange={(e) =>
                    setToken(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="hairline h-12 rounded-xl border bg-white text-center font-mono text-lg tracking-[.4em]"
                />
              </label>
              <button
                type="button"
                disabled={
                  token.length !== 6 ||
                  (authIsApi && confirmMutation.isPending)
                }
                onClick={() => {
                  void confirmMfaSetup();
                }}
                className="h-12 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white disabled:opacity-40"
              >
                Verify & activate MFA
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
