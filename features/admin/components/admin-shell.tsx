"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BookUser,
  Boxes,
  ChevronDown,
  CreditCard,
  FileClock,
  Gavel,
  Gauge,
  KeyRound,
  Menu,
  Megaphone,
  PackageCheck,
  RadioTower,
  Search,
  Scale,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Star,
  Store,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/logo-mark";
import { MockInteractionBoundary } from "@/components/mock-interaction-boundary";
import { ThemeToggle } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { NotificationCenter, ProfileMenu } from "@/shared/ui/account-controls";

const nav = [
  ["Command center", "/admin", Gauge],
  ["Merchants", "/admin/merchants", Store],
  ["Buyer identities", "/admin/buyers", BookUser],
  ["Users & access", "/admin/users", Users],
  ["Roles & permissions", "/admin/roles", KeyRound],
  ["Campaigns", "/admin/campaigns", Megaphone],
  ["All orders", "/admin/orders", Boxes],
  ["Payments", "/admin/payments", CreditCard],
  ["Reconciliation", "/admin/reconciliation", Scale],
  ["Withdrawals", "/admin/withdrawals", Banknote],
  ["Global inventory", "/admin/inventory", Boxes],
  ["Fulfillment control", "/admin/fulfillment", PackageCheck],
  ["Review moderation", "/admin/reviews", Star],
  ["Disputes & refunds", "/admin/disputes", Gavel],
  ["QRIS API KYC", "/admin/kyc", BadgeCheck],
  ["Risk operations", "/admin/risk", ShieldAlert],
  ["Security audit", "/admin/security", ShieldCheck],
  ["Webhook monitor", "/admin/webhooks", Webhook],
  ["Audit trail", "/admin/audit-logs", FileClock],
  ["Providers", "/admin/providers", RadioTower],
  ["Platform settings", "/admin/system", Settings2],
] as const;

export function AdminShell({
  children,
  title,
  description,
  action,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f3f5f9] text-[#131827]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-white/8 bg-[#0b1020] text-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center border-b border-white/8 px-5">
          <Link href="/admin" className="flex items-center gap-3">
            <LogoMark className="size-9" />
            <div>
              <span className="block text-sm font-black tracking-[-.04em]">
                Fersaku Control
              </span>
              <span className="mt-0.5 block text-[8px] font-bold tracking-[.18em] text-[#8090b5] uppercase">
                Platform operations
              </span>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setOpen(false)}
            className="ml-auto lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-4 py-4">
          <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2.5 text-left">
            <span className="grid size-8 place-items-center rounded-lg bg-[#5b7cfa] text-[10px] font-black">
              FS
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-extrabold">
                Fersaku Indonesia
              </span>
              <span className="block text-[8px] text-[#7280a1]">
                Production workspace
              </span>
            </div>
            <ChevronDown className="size-3.5 text-[#7280a1]" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {nav.map(([label, href, Icon], i) => {
            const active =
              href === "/admin" ? path === href : path.startsWith(href);
            return (
              <div key={href}>
                {[6, 12, 20].includes(i) && (
                  <p className="mt-5 mb-2 px-3 text-[8px] font-extrabold tracking-[.18em] text-[#56617b] uppercase">
                    {i === 6
                      ? "Money movement"
                      : i === 12
                        ? "Trust & operations"
                        : "Infrastructure"}
                  </p>
                )}
                <Link
                  href={href}
                  className={cn(
                    "mb-1 flex h-10 items-center gap-3 rounded-xl px-3 text-[11px] font-bold transition",
                    active
                      ? "bg-[#5b7cfa] text-white shadow-[0_8px_24px_rgba(91,124,250,.25)]"
                      : "text-[#8c98b5] hover:bg-white/[.05] hover:text-white",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                  {label === "Risk operations" && (
                    <span className="ml-auto rounded-full bg-[#ef665d] px-1.5 py-0.5 text-[8px] text-white">
                      4
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/8 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-[#25304c] text-[10px] font-black">
              DK
            </span>
            <div>
              <p className="text-[10px] font-extrabold">Dinda Kusuma</p>
              <p className="text-[8px] text-[#6f7b99]">Super administrator</p>
            </div>
            <ChevronDown className="ml-auto size-3.5 text-[#6f7b99]" />
          </div>
        </div>
      </aside>
      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-40 flex h-20 items-center border-b border-[#dfe3ec] bg-[#f8f9fc]/92 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Buka navigasi"
            onClick={() => setOpen(true)}
            className="mr-3 grid size-10 place-items-center rounded-xl border border-[#dfe3ec] bg-white lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden w-full max-w-md items-center gap-2 rounded-xl border border-[#dfe3ec] bg-white px-3 py-2.5 text-[11px] text-[#818aa0] sm:flex">
            <Search className="size-4" /> Search merchant, order, payment,
            user...{" "}
            <kbd className="ml-auto rounded-md bg-[#eef1f6] px-2 py-1 text-[8px] font-bold">
              ⌘ K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="border-[#dfe3ec]" />
            <div className="hidden items-center gap-2 rounded-full border border-[#c7ecd8] bg-[#edf9f2] px-3 py-2 text-[9px] font-extrabold text-[#27784b] md:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-[#32a764]" />{" "}
              All systems operational
            </div>
            <NotificationCenter surface="admin" />
            <ProfileMenu surface="admin" />
          </div>
        </header>
        <MockInteractionBoundary tone="admin">
          <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
            <div className="mx-auto max-w-[1500px]">
              <div className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[9px] font-extrabold tracking-[.14em] text-[#7c879d] uppercase">
                    <span>Fersaku Control</span>
                    <span>/</span>
                    <span className="text-[#5b7cfa]">Live environment</span>
                  </div>
                  <h1 className="text-2xl font-black tracking-[-.04em] sm:text-3xl">
                    {title}
                  </h1>
                  <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#707a90]">
                    {description}
                  </p>
                </div>
                {action}
              </div>
              {children}
            </div>
          </main>
        </MockInteractionBoundary>
      </div>
    </div>
  );
}

export function AdminLogin() {
  return (
    <main className="grid min-h-screen bg-[#0b1020] lg:grid-cols-[1fr_.86fr]">
      <section className="noise relative hidden overflow-hidden p-14 text-white lg:flex lg:flex-col">
        <div className="absolute top-24 -left-32 size-[520px] rounded-full bg-[#5b7cfa]/20 blur-[120px]" />
        <div className="absolute right-[-120px] bottom-[-180px] size-[480px] rounded-full border border-white/8" />
        <Link href="/" className="relative flex items-center gap-3">
          <LogoMark />
          <div>
            <b className="block text-sm">Fersaku Control</b>
            <span className="text-[9px] tracking-[.18em] text-[#7d89a6] uppercase">
              Restricted access
            </span>
          </div>
        </Link>
        <div className="relative my-auto max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#5b7cfa]/30 bg-[#5b7cfa]/10 px-3 py-1.5 text-[9px] font-bold tracking-[.14em] text-[#aebdff] uppercase">
            <KeyRound className="size-3" /> Secure operations console
          </span>
          <h1 className="mt-7 text-6xl leading-[.95] font-black tracking-[-.06em]">
            One console.
            <br />
            <span className="text-[#809bff]">Total visibility.</span>
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-[#8b96b2]">
            Monitor every rupiah, merchant, payment, payout, and platform event
            from a dedicated operations environment.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              [Activity, "Live telemetry"],
              [ShieldAlert, "Risk controls"],
              [FileClock, "Immutable audit"],
            ].map(([Icon, label]) => (
              <div
                key={label as string}
                className="rounded-2xl border border-white/8 bg-white/[.04] p-4"
              >
                <Icon className="size-4 text-[#809bff]" />
                <span className="mt-6 block text-[9px] font-bold text-[#9aa6c1]">
                  {label as string}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[9px] text-[#59647f]">
          Access is monitored and recorded in the platform audit trail.
        </p>
      </section>
      <section className="flex items-center justify-center bg-[#f4f6fa] p-5 sm:p-10">
        <div className="w-full max-w-[430px] rounded-[28px] border border-[#dfe3ec] bg-white p-7 shadow-[0_24px_80px_rgba(18,27,50,.12)] sm:p-9">
          <div className="lg:hidden">
            <LogoMark />
          </div>
          <p className="mt-7 text-[9px] font-extrabold tracking-[.16em] text-[#5b7cfa] uppercase lg:mt-0">
            Administrator sign in
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-.04em]">
            Welcome to Control.
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#737d92]">
            Use your approved Fersaku operations account.
          </p>
          <div className="mt-8 grid gap-4">
            <label className="grid gap-2 text-[11px] font-extrabold">
              Work email
              <input
                defaultValue="admin@fersaku.id"
                className="h-12 rounded-xl border border-[#dfe3ec] px-4 text-sm outline-none focus:border-[#5b7cfa] focus:ring-4 focus:ring-[#5b7cfa]/10"
              />
            </label>
            <label className="grid gap-2 text-[11px] font-extrabold">
              Password
              <input
                type="password"
                defaultValue="password123"
                className="h-12 rounded-xl border border-[#dfe3ec] px-4 text-sm outline-none focus:border-[#5b7cfa] focus:ring-4 focus:ring-[#5b7cfa]/10"
              />
            </label>
            <label className="flex items-center gap-2 text-[10px] text-[#68728a]">
              <input type="checkbox" defaultChecked /> Keep this trusted device
              active for 8 hours
            </label>
            <Link
              href="/admin"
              className="mt-2 flex h-12 items-center justify-center rounded-xl bg-[#11182a] text-xs font-extrabold text-white transition hover:bg-[#202b48]"
            >
              Continue securely
            </Link>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-[#f3f5f9] p-3 text-[9px] font-semibold text-[#68728a]">
            <AlertTriangle className="size-3.5 text-[#e89b3d]" /> Mock access
            for frontend demonstration
          </div>
        </div>
      </section>
    </main>
  );
}
