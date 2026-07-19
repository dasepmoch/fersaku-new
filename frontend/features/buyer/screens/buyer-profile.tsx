"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";
import {
  displayLabelToLocale,
  useBuyerProfile,
  usePatchBuyerNotificationPreferencesMutation,
  usePatchBuyerProfileMutation,
} from "@/features/buyer/data";
import { Preference, ProfileField } from "./pieces";

const card = "rounded-[24px] border hairline bg-white shadow-card";

type ProfileDraft = {
  name: string;
  phone: string;
  localeLabel: string;
  marketing: boolean;
  updates: boolean;
};

export function BuyerProfile() {
  const { data: profile } = useBuyerProfile();
  const patchProfile = usePatchBuyerProfileMutation();
  const patchPrefs = usePatchBuyerNotificationPreferencesMutation();
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);

  const name = draft?.name ?? profile?.name ?? "";
  const phone = draft?.phone ?? profile?.phone ?? "";
  const localeLabel =
    draft?.localeLabel ?? profile?.localeLabel ?? "Bahasa Indonesia";
  const marketing = draft?.marketing ?? profile?.marketingEmail ?? false;
  const updates = draft?.updates ?? profile?.productUpdatesEmail ?? true;
  const revision = profile?.revision ?? 1;

  const busy = patchProfile.isPending || patchPrefs.isPending;
  const displayName = name || profile?.name || "";
  const email = profile?.email ?? "";
  const initials = profile?.initials ?? "—";
  const memberSince =
    profile?.memberSinceLabel || (profile ? "" : "Buyer sejak 18 Maret 2026");

  const touch = (patch: Partial<ProfileDraft>) => {
    setSaved(false);
    setDraft((current) => ({
      name: current?.name ?? profile?.name ?? "",
      phone: current?.phone ?? profile?.phone ?? "",
      localeLabel:
        current?.localeLabel ?? profile?.localeLabel ?? "Bahasa Indonesia",
      marketing: current?.marketing ?? profile?.marketingEmail ?? false,
      updates: current?.updates ?? profile?.productUpdatesEmail ?? true,
      ...patch,
    }));
  };

  const save = async () => {
    if (busy || !profile) return;
    try {
      await patchProfile.mutateAsync({
        expectedVersion: revision,
        displayName: name.trim(),
        phone: phone.trim(),
        locale: displayLabelToLocale(localeLabel),
        timezone: profile.timezone,
      });
      if (marketing !== profile.marketingEmail) {
        await patchPrefs.mutateAsync({ marketingEmail: marketing });
      }
      setDraft(null);
      setSaved(true);
    } catch {
      // 409/validation: keep draft inputs; no fake success
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} p-5 sm:p-7`}>
        <div className="flex items-center gap-4">
          <span
            className="grid size-16 place-items-center rounded-full bg-[#ffb69d] text-sm font-black"
            title="Personal photo upload is out of scope for launch (INT-175 deferred)"
          >
            {initials}
          </span>
          <div>
            <h2 className="text-lg font-extrabold">{displayName || "—"}</h2>
            {memberSince ? (
              <p className="mt-1 text-[9px] text-[#718078]">{memberSince}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <ProfileField
            label="Nama lengkap"
            value={name}
            onChange={(v) => touch({ name: v })}
          />
          <ProfileField label="Email utama" value={email} readOnly />
          <ProfileField
            label="Nomor telepon"
            value={phone}
            onChange={(v) => touch({ phone: v })}
          />
          <ProfileField
            label="Bahasa"
            value={localeLabel}
            onChange={(v) => touch({ localeLabel: v })}
          />
        </div>
        <div className="hairline mt-7 border-t pt-6">
          <h3 className="text-xs font-extrabold">Preferensi email</h3>
          <div className="mt-4 grid gap-3">
            <Preference
              title="Receipt dan akses pembelian"
              desc="Wajib untuk transaksi dan tidak dapat dinonaktifkan."
              value
            />
            <Preference
              title="Update produk dari seller"
              desc="Hanya untuk produk yang seller tandai memiliki update."
              value={updates}
              onChange={() => touch({ updates: !updates })}
            />
            <Preference
              title="Rekomendasi dan marketing"
              desc="Penawaran opsional dari seller yang pernah kamu beli."
              value={marketing}
              onChange={() => touch({ marketing: !marketing })}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !profile}
          onClick={() => {
            void save();
          }}
          className="mt-7 h-11 rounded-xl bg-[#173f2c] px-5 text-[10px] font-extrabold text-white disabled:opacity-60"
        >
          {saved ? "Profil berhasil disimpan" : "Simpan perubahan"}
        </button>
      </section>
      <aside className={`${card} h-fit p-5`}>
        <UserRound className="size-5 text-[#315d47]" />
        <h3 className="mt-5 text-xs font-extrabold">Tentang identitas buyer</h3>
        <p className="mt-2 text-[9px] leading-5 text-[#718078]">
          Pembelian dari email yang sama digabung setelah email diverifikasi.
          Seller hanya dapat melihat transaksi dari tokonya sendiri.
        </p>
        <div className="mt-5 rounded-xl bg-[#eef3e9] p-4 text-[8px] leading-4 text-[#65736b]">
          Mengubah email utama memerlukan verifikasi ke alamat lama dan baru.
        </div>
        <button
          type="button"
          disabled
          title="Email change disabled until UI-080 dual-confirm composition (AUT-120 adapters ready)"
          className="hairline mt-4 h-10 w-full rounded-xl border text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mulai perubahan email
        </button>
      </aside>
    </div>
  );
}
