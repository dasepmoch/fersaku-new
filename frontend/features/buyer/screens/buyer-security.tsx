"use client";

import {
  Laptop,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  useBuyerSessions,
  useRevokeAllBuyerSessionsMutation,
  useRevokeBuyerSessionMutation,
  useRevokeOtherBuyerSessionsMutation,
} from "@/features/buyer/data";

const card = "rounded-[24px] border hairline bg-white shadow-card";

export function BuyerSecurity() {
  const { data } = useBuyerSessions();
  const sessions = data ?? [];
  const revokeMutation = useRevokeBuyerSessionMutation();
  const revokeOthersMutation = useRevokeOtherBuyerSessionsMutation();
  const revokeAllMutation = useRevokeAllBuyerSessionsMutation();
  const busy =
    revokeMutation.isPending ||
    revokeOthersMutation.isPending ||
    revokeAllMutation.isPending;
  const revoke = (id: string) => {
    if (busy) return;
    void revokeMutation.mutateAsync({
      sessionId: id,
      reason: "buyer_session_revoke",
    });
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} overflow-hidden`}>
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#e9ff9b]">
              <MonitorSmartphone className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">Perangkat & sesi aktif</h2>
              <p className="mt-1 text-[9px] text-[#718078]">
                Cabut akses perangkat yang tidak dikenali.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                void revokeOthersMutation.mutateAsync();
              }}
              className="hairline ml-auto hidden rounded-xl border px-3 py-2 text-[8px] font-bold sm:block"
            >
              Keluar dari perangkat lain
            </button>
          </div>
        </div>
        <div>
          {sessions.map((session) => (
            <div
              key={session.id}
              className="hairline flex items-center gap-3 border-t px-5 py-4 sm:px-7"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-[#eef0eb]">
                {session.device.includes("Android") ||
                session.device.includes("iPhone") ? (
                  <Smartphone className="size-4" />
                ) : (
                  <Laptop className="size-4" />
                )}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <b className="text-[10px]">{session.device}</b>
                  {session.current && (
                    <span className="rounded-full bg-[#e9f7ef] px-2 py-0.5 text-[7px] font-extrabold text-[#287d4c]">
                      PERANGKAT INI
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[8px] text-[#718078]">
                  {session.location} • {session.ip} • {session.active}
                </p>
              </div>
              {!session.current && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => revoke(session.id)}
                  className="ml-auto text-[8px] font-extrabold text-[#b2573c]"
                >
                  Cabut sesi
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <aside className="grid content-start gap-4">
        <section className={`${card} p-5`}>
          <ShieldCheck className="size-5 text-[#315d47]" />
          <h3 className="mt-5 text-xs font-extrabold">Passwordless account</h3>
          <p className="mt-2 text-[9px] leading-5 text-[#718078]">
            Login menggunakan magic link satu kali yang berlaku 15 menit. Tidak
            ada password yang disimpan.
          </p>
        </section>
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Aktivitas keamanan</h3>
          <div className="mt-4 grid gap-4">
            {[
              ["Magic link digunakan", "Hari ini, 09:42"],
              ["Sesi Android dibuat", "Hari ini, 09:43"],
              ["Email diverifikasi", "18 Mar 2026"],
            ].map((x) => (
              <div key={x[0]}>
                <b className="block text-[9px]">{x[0]}</b>
                <span className="text-[8px] text-[#718078]">{x[1]}</span>
              </div>
            ))}
          </div>
        </section>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (busy) return;
            void revokeAllMutation.mutateAsync();
          }}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#efc8c0] bg-[#fff5f4] text-[9px] font-extrabold text-[#a44f3b]"
        >
          <LogOut className="size-4" /> Keluar dari semua sesi
        </button>
      </aside>
    </div>
  );
}
