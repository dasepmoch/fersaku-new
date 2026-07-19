"use client";

import Link from "next/link";
import {
  ChevronDown,
  CircleUserRound,
  LogOut,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCog,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Surface } from "./account-controls-data";
import { useSession } from "@/shared/auth/session-provider";
import { loginPathForSurface } from "@/shared/auth/return-to";
import type { SessionSurface } from "@/shared/auth/session-model";

function initialsFromName(name: string | null | undefined, fallback: string) {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase() || fallback;
}

export function ProfileMenu({ surface }: { surface: Surface }) {
  const [open, setOpen] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { claims, logout, isAuthenticated, ready } = useSession();
  const sessionSurface = surface as SessionSurface;

  const defaults = {
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

  // Session-bound identity: API mode never falls back to hardcoded mock persona.
  const surfaceBound = claims?.surface === sessionSurface;
  const apiMode = claims?.mode === "api";
  const displayName =
    surfaceBound && claims?.name
      ? claims.name
      : apiMode
        ? (claims?.name ?? "")
        : defaults.name;
  const displayEmail =
    surfaceBound && claims?.email
      ? claims.email
      : apiMode
        ? (claims?.email ?? "")
        : defaults.email;
  const displayInitials = initialsFromName(
    displayName || displayEmail,
    apiMode ? "·" : defaults.initials,
  );
  const config = {
    initials: displayInitials,
    name: displayName,
    email: displayEmail,
    color: defaults.color,
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // After local/remote logout: show re-login affordance without redesign.
  // Wait for bootstrap so we do not flash "Masuk kembali" during loading.
  const showReLogin =
    loggedOut || (ready && !isAuthenticated && claims === null);

  if (showReLogin)
    return (
      <Link
        href={loginPathForSurface(sessionSurface)}
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
              disabled={loggingOut}
              onClick={() => {
                setOpen(false);
                setLoggingOut(true);
                void logout(sessionSurface).finally(() => {
                  setLoggedOut(true);
                  setLoggingOut(false);
                });
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
