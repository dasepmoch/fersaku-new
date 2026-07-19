"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Logo } from "./brand";
import { ThemeToggle } from "./theme-provider";
import { getDomainSource } from "@/shared/data/domain-source";

const baseLinks: [string, string][] = [
  ["Fitur", "/features"],
  ["Harga", "/pricing"],
  ["Untuk developer", "/api"],
  ["Pembelian", "/account/login"],
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  // KEY-23: prototype demo storefront only when publicCatalog is mock.
  const links = useMemo(() => {
    try {
      if (getDomainSource("publicCatalog") === "mock") {
        return [
          ...baseLinks,
          ["Demo toko", "/@asep-ai-tools"] as [string, string],
        ];
      }
    } catch {
      /* fail closed: hide demo on config error */
    }
    return baseLinks;
  }, []);
  return (
    <header className="relative z-50 mx-auto flex h-20 max-w-[1240px] items-center justify-between px-5 lg:px-8">
      <Logo />
      <nav className="hidden items-center gap-8 md:flex">
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="text-[13px] font-semibold text-[#536159] transition hover:text-[#17231d]"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="hidden items-center gap-3 md:flex">
        <ThemeToggle />
        <Link href="/login" className="px-3 text-[13px] font-bold">
          Masuk
        </Link>
        <Link
          href="/register"
          className="rounded-full bg-[#173f2c] px-5 py-3 text-[13px] font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          Mulai gratis
        </Link>
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <ThemeToggle />
        <button
          onClick={() => setOpen(!open)}
          className="hairline grid size-10 place-items-center rounded-full border bg-white"
          aria-label="Buka menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="hairline shadow-float absolute top-20 right-4 left-4 rounded-3xl border bg-[#fbfaf6] p-4 md:hidden">
          <div className="grid gap-1">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-bold hover:bg-[#eef1e9]"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="hairline mt-3 grid grid-cols-2 gap-2 border-t pt-3">
            <Link
              href="/login"
              className="hairline rounded-xl border py-3 text-center text-sm font-bold"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-[#173f2c] py-3 text-center text-sm font-bold text-white"
            >
              Mulai gratis
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
