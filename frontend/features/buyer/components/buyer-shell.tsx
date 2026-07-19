"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Library,
  LogOut,
  Menu,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { RotatingQuote } from "@/components/rotating-quote";
import { ThemeToggle } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { NotificationCenter, ProfileMenu } from "@/shared/ui/account-controls";

const links = [
  ["Koleksi", "/account/purchases", Library],
  ["Profil & email", "/account/profile", Settings],
  ["Keamanan", "/account/security", ShieldCheck],
] as const;

export function BuyerShell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen bg-[#f3f2ec]">
      <header className="hairline sticky top-0 z-40 border-b bg-[#f8f7f2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center px-5 lg:px-8">
          <Logo />
          <span className="ml-3 hidden rounded-full bg-[#e8ebe4] px-2.5 py-1 text-[8px] font-extrabold tracking-wider text-[#65736b] uppercase sm:block">
            Buyer
          </span>
          <nav className="ml-12 hidden items-center gap-2 md:flex">
            {links.map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-extrabold",
                  path.startsWith(href)
                    ? "bg-[#173f2c] text-white"
                    : "text-[#718078] hover:bg-white",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Cari pembelian"
              className="hairline hidden size-10 place-items-center rounded-xl border bg-white sm:grid"
            >
              <Search className="size-4" />
            </button>
            <NotificationCenter surface="buyer" />
            <div className="hidden sm:block">
              <ProfileMenu surface="buyer" />
            </div>
            <button
              type="button"
              aria-label={open ? "Tutup menu" : "Buka menu"}
              onClick={() => setOpen(!open)}
              className="hairline grid size-10 place-items-center rounded-xl border bg-white md:hidden"
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="hairline grid gap-1 border-t p-4 md:hidden">
            {links.map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-bold hover:bg-white"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
            <Link
              href="/"
              className="hairline mt-2 flex items-center gap-3 border-t px-3 pt-4 text-xs font-bold text-[#a4533e]"
            >
              <LogOut className="size-4" /> Keluar
            </Link>
          </nav>
        )}
      </header>
      <section className="mx-auto max-w-[1200px] px-5 py-9 lg:px-8 lg:py-12">
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-[9px] font-extrabold tracking-[.14em] text-[#315d47] uppercase">
            <ReceiptText className="size-3.5" /> Fersaku Buyer Portal
          </p>
          <h1 className="font-display text-5xl leading-none tracking-[-.04em] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-xs leading-5 text-[#718078]">
            {description}
          </p>
        </div>
        <RotatingQuote surface="buyer" compact className="mb-6" />
        {children}
      </section>
    </main>
  );
}
