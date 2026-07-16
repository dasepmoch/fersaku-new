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
import { useState } from "react";
import { cn } from "@/lib/utils";
import { card, Modal, Preference, SettingsForm } from "./pieces";

type Bank = { bank: string; number: string; holder: string; verified: boolean };

export function SellerSettingsPro() {
  const [tab, setTab] = useState("Profil");
  const [bankModal, setBankModal] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [banks, setBanks] = useState<Bank[]>([
    {
      bank: "BCA",
      number: "0148924821",
      holder: "ASEP KURNIA",
      verified: true,
    },
  ]);
  const [mfaModal, setMfaModal] = useState<
    "setup" | "recovery" | "disable" | null
  >(null);
  const [mfa, setMfa] = useState(true);
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const tabs = [
    ["Profil", Pencil],
    ["Bisnis", Banknote],
    ["Rekening bank", Banknote],
    ["Keamanan", ShieldCheck],
    ["Notifikasi", BellRing],
  ] as const;
  const saveBank = (form: FormData) => {
    const bank = {
      bank: String(form.get("bank")),
      number: String(form.get("number")),
      holder: String(form.get("holder")).toUpperCase(),
      verified: true,
    };
    setBanks((old) =>
      editing === null
        ? [...old, bank]
        : old.map((x, i) => (i === editing ? bank : x)),
    );
    setBankModal(false);
    setEditing(null);
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
          <SettingsForm
            title="Profil pribadi"
            description="Informasi akun, preferensi bahasa, dan identitas publik."
            fields={[
              "Nama depan|Asep",
              "Nama belakang|Kurnia",
              "Email|asep@ai.tools",
              "Zona waktu|Asia/Jakarta (GMT+7)",
            ]}
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
                  setEditing(null);
                  setBankModal(true);
                }}
                className="flex h-10 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-[9px] font-extrabold text-white"
              >
                <Plus className="size-4" /> Tambah rekening
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              {banks.map((bank, index) => (
                <div
                  key={`${bank.number}-${index}`}
                  className="hairline flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-[#eaf0fb] text-[10px] font-black text-[#2855a5]">
                    {bank.bank}
                  </span>
                  <div>
                    <b className="block text-xs">
                      {bank.bank} •••• {bank.number.slice(-4)}
                    </b>
                    <span className="text-[9px] text-[#718078]">
                      {bank.holder} • {bank.verified ? "Verified" : "Pending"}
                    </span>
                  </div>
                  {index === 0 && (
                    <span className="w-fit rounded-full bg-[#e5f5e6] px-2 py-1 text-[8px] font-extrabold text-[#2e714f]">
                      Primary
                    </span>
                  )}
                  <div className="flex gap-2 sm:ml-auto">
                    <button
                      onClick={() => {
                        setEditing(index);
                        setBankModal(true);
                      }}
                      className="hairline grid size-9 place-items-center rounded-xl border"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {banks.length > 1 && (
                      <button
                        onClick={() =>
                          setBanks((old) => old.filter((_, i) => i !== index))
                        }
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
              mencabut approval payout aktif, dan mencatat security audit event.
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
                onClick={() => setMfaModal(mfa ? "disable" : "setup")}
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
              {[
                "Penjualan berhasil",
                "Pembayaran pending",
                "Stok hampir habis",
                "Payout berubah",
                "Login dari perangkat baru",
                "Ringkasan mingguan",
              ].map((x, i) => (
                <Preference key={x} label={x} defaultOn={i !== 1} />
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 1700);
          }}
          className="mt-7 flex h-11 items-center gap-2 rounded-xl bg-[#173f2c] px-5 text-[10px] font-extrabold text-white"
        >
          {saved ? <Check className="size-4" /> : <Save className="size-4" />}
          {saved ? "Settings saved" : "Save changes"}
        </button>
      </section>
      {bankModal && (
        <Modal
          title={
            editing === null ? "Tambah rekening payout" : "Edit rekening payout"
          }
          description="Kami melakukan mock verification nama pemilik sebelum rekening dapat dipakai."
          onClose={() => {
            setBankModal(false);
            setEditing(null);
          }}
        >
          <form action={saveBank} className="grid gap-4">
            <label className="grid gap-2 text-[9px] font-bold">
              Bank
              <select
                name="bank"
                defaultValue={editing === null ? "BCA" : banks[editing].bank}
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
                required
                defaultValue={editing === null ? "" : banks[editing].number}
                placeholder="Masukkan 8–16 digit"
                className="hairline h-11 rounded-xl border bg-white px-3"
              />
            </label>
            <label className="grid gap-2 text-[9px] font-bold">
              Nama pemilik
              <input
                name="holder"
                required
                defaultValue={
                  editing === null ? "ASEP KURNIA" : banks[editing].holder
                }
                className="hairline h-11 rounded-xl border bg-white px-3 uppercase"
              />
            </label>
            <div className="rounded-xl bg-[#eef3e9] p-3 text-[9px] leading-5 text-[#65736b]">
              <CheckCircle2 className="mr-2 inline size-4 text-[#2e714f]" />
              Mock bank account lookup tersedia dan nama akan dicocokkan dengan
              KYC.
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
          onClose={() => setMfaModal(null)}
        >
          {mfaModal === "disable" ? (
            <div className="grid gap-3">
              <button
                onClick={() => setMfaModal("recovery")}
                className="hairline h-11 rounded-xl border bg-white text-[10px] font-bold"
              >
                View recovery codes
              </button>
              <button
                onClick={() => {
                  setMfa(false);
                  setMfaModal(null);
                }}
                className="h-11 rounded-xl bg-[#b64e38] text-[10px] font-extrabold text-white"
              >
                Disable MFA after confirmation
              </button>
            </div>
          ) : mfaModal === "recovery" ? (
            <div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#111a16] p-4 font-mono text-[10px] text-[#d7ff64]">
                {[
                  "FRSK-A92K",
                  "FRSK-J71P",
                  "FRSK-Q04X",
                  "FRSK-M88D",
                  "FRSK-W31C",
                  "FRSK-L52N",
                ].map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
              <button className="hairline mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white text-[9px] font-bold">
                <Copy className="size-4" /> Copy recovery codes
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="hairline mx-auto grid size-40 place-items-center rounded-2xl border bg-white">
                <QrCode className="size-32" strokeWidth={1.2} />
              </div>
              <div className="rounded-xl bg-[#eef3e9] p-3 text-center font-mono text-[10px]">
                FRSK A4M8 Q2JP 7ZLE
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
                disabled={token.length !== 6}
                onClick={() => {
                  setMfa(true);
                  setMfaModal("recovery");
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
