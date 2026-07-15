"use client";

import Link from "next/link";
import {
  Bell,
  Check,
  ChevronDown,
  CircleUserRound,
  CreditCard,
  KeyRound,
  LogOut,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UserCog,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Surface = "seller" | "admin" | "buyer";

const notificationData: Record<
  Surface,
  Array<{
    id: string;
    title: string;
    body: string;
    time: string;
    href: string;
    icon: typeof Bell;
  }>
> = {
  seller: [
    {
      id: "n1",
      title: "Pembayaran baru",
      body: "Nadia membeli AI Prompt Pack • Rp79.000",
      time: "2 menit",
      href: "/dashboard/orders/FRS-240712-1842",
      icon: ShoppingBag,
    },
    {
      id: "n2",
      title: "Stok hampir habis",
      body: "VPN Premium tersisa 7 item",
      time: "18 menit",
      href: "/dashboard/inventory/prod_vpn",
      icon: Sparkles,
    },
    {
      id: "n3",
      title: "Saldo tersedia",
      body: "Rp3.420.000 selesai settlement",
      time: "1 jam",
      href: "/dashboard/balance",
      icon: WalletCards,
    },
  ],
  admin: [
    {
      id: "a1",
      title: "Withdrawal review",
      body: "Rp25.000.000 membutuhkan keputusan",
      time: "4 menit",
      href: "/admin/withdrawals/WD-120724-0088",
      icon: CreditCard,
    },
    {
      id: "a2",
      title: "Risk case critical",
      body: "Crypto Signals Pro mendapat score 91",
      time: "12 menit",
      href: "/admin/risk",
      icon: ShieldCheck,
    },
    {
      id: "a3",
      title: "Inventory invalid",
      body: "3 stock items diblokir dari allocation",
      time: "28 menit",
      href: "/admin/inventory",
      icon: KeyRound,
    },
  ],
  buyer: [
    {
      id: "b1",
      title: "Update produk tersedia",
      body: "AI Prompt Pack v3.1 siap diunduh",
      time: "Hari ini",
      href: "/account/purchases/FRS-240712-1842",
      icon: Sparkles,
    },
    {
      id: "b2",
      title: "Pembelian berhasil",
      body: "Canva Pro Team tersedia di koleksimu",
      time: "11 Jun",
      href: "/account/purchases/FRS-220611-0832",
      icon: Check,
    },
  ],
};

export function NotificationCenter({ surface }: { surface: Surface }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const items = notificationData[surface];
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        data-feedback="off"
        onClick={() => setOpen(!open)}
        className="hairline relative grid size-10 place-items-center rounded-xl border bg-white"
        aria-label="Buka notifikasi"
      >
        <Bell className="size-4" />
        {read.size < items.length && (
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-[#ff794d]" />
        )}
      </button>
      {open && (
        <div
          className={`shadow-float absolute top-12 right-0 z-[120] w-[340px] overflow-hidden rounded-2xl border ${surface === "admin" ? "border-[#28334e] bg-[#11182a] text-white" : "hairline bg-[#fbfaf6]"}`}
        >
          <div className="hairline flex items-center border-b p-4">
            <div>
              <b className="block text-xs">Notifikasi</b>
              <span className="text-[8px] opacity-55">
                {items.length - read.size} belum dibaca
              </span>
            </div>
            <button
              data-feedback="off"
              onClick={() => setRead(new Set(items.map((i) => i.id)))}
              className="ml-auto text-[8px] font-extrabold text-[#5b7cfa]"
            >
              Tandai semua dibaca
            </button>
          </div>
          <div>
            {items.map((item) => {
              const Icon = item.icon;
              const isRead = read.has(item.id);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    setRead(new Set([...read, item.id]));
                    setOpen(false);
                  }}
                  className={`hairline flex gap-3 border-b p-4 transition hover:bg-black/[.03] ${isRead ? "opacity-55" : ""}`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${surface === "admin" ? "bg-[#202b48] text-[#809bff]" : "bg-[#e9ff9b] text-[#173f2c]"}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <b className="block text-[9px]">{item.title}</b>
                    <p className="mt-1 text-[8px] leading-4 opacity-60">
                      {item.body}
                    </p>
                    <span className="mt-1 block text-[7px] opacity-40">
                      {item.time}
                    </span>
                  </div>
                  {!isRead && (
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#5b7cfa]" />
                  )}
                </Link>
              );
            })}
          </div>
          <Link
            href={surface === "admin" ? "/admin/system" : "/dashboard/settings"}
            onClick={() => setOpen(false)}
            className="block p-3 text-center text-[8px] font-extrabold opacity-60"
          >
            Atur preferensi notifikasi
          </Link>
        </div>
      )}
    </div>
  );
}

export function ProfileMenu({ surface }: { surface: Surface }) {
  const [open, setOpen] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const config = {
    seller: {
      initials: "AK",
      name: "Asep Kurnia",
      email: "asep@ai.tools",
      color: "#ffb69d",
    },
    admin: {
      initials: "DK",
      name: "Dinda Kusuma",
      email: "dinda@fersaku.id",
      color: "#5b7cfa",
    },
    buyer: {
      initials: "NP",
      name: "Nadia Putri",
      email: "nadia@studio.id",
      color: "#ffb69d",
    },
  }[surface];
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (loggedOut)
    return (
      <Link
        href={
          surface === "admin"
            ? "/admin/login"
            : surface === "buyer"
              ? "/account/login"
              : "/login"
        }
        className="hairline rounded-xl border bg-white px-3 py-2 text-[8px] font-extrabold"
      >
        Masuk kembali
      </Link>
    );
  const links =
    surface === "admin"
      ? [
          [UserCog, "Staff profile", "/admin/profile"],
          [ShieldCheck, "Roles & permissions", "/admin/roles"],
          [Settings, "Platform settings", "/admin/system"],
        ]
      : surface === "buyer"
        ? [
            [CircleUserRound, "Profil buyer", "/account/profile"],
            [ShieldCheck, "Keamanan & sesi", "/account/security"],
            [ShoppingBag, "Koleksi pembelian", "/account/purchases"],
          ]
        : [
            [CircleUserRound, "Profil saya", "/dashboard/settings"],
            [Store, "Pengaturan toko", "/dashboard/storefront"],
            [Settings, "Account settings", "/dashboard/settings"],
          ];
  return (
    <div ref={ref} className="relative">
      <button
        data-feedback="off"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-transparent p-1.5 pr-2 transition hover:border-current/10 hover:bg-white"
      >
        <span
          className="grid size-8 place-items-center rounded-lg text-[9px] font-black"
          style={{
            backgroundColor: config.color,
            color: surface === "admin" ? "white" : "#173f2c",
          }}
        >
          {config.initials}
        </span>
        <span className="hidden text-[9px] font-extrabold sm:block">
          {config.name.split(" ")[0]}
        </span>
        <ChevronDown className="size-3.5 opacity-50" />
      </button>
      {open && (
        <div
          className={`shadow-float absolute top-12 right-0 z-[120] w-64 overflow-hidden rounded-2xl border ${surface === "admin" ? "border-[#28334e] bg-[#11182a] text-white" : "hairline bg-[#fbfaf6]"}`}
        >
          <div className="hairline border-b p-4">
            <b className="block text-[10px]">{config.name}</b>
            <span className="mt-1 block text-[8px] opacity-50">
              {config.email}
            </span>
            {surface === "admin" && (
              <span className="mt-2 inline-flex rounded-full bg-[#5b7cfa]/20 px-2 py-1 text-[7px] font-extrabold text-[#809bff]">
                SUPER ADMIN
              </span>
            )}
          </div>
          <div className="p-2">
            {links.map(([Icon, label, href]) => (
              <Link
                key={label as string}
                href={href as string}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[9px] font-bold hover:bg-black/[.05]"
              >
                <Icon className="size-3.5 opacity-60" />
                {label as string}
              </Link>
            ))}
          </div>
          <div className="hairline border-t p-2">
            <button
              data-feedback="off"
              onClick={() => {
                setLoggedOut(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[9px] font-bold text-[#c6534c] hover:bg-[#fff0ee]"
            >
              <LogOut className="size-3.5" /> Keluar dari sesi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
