import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "group flex items-center gap-2.5 font-extrabold tracking-[-0.055em]",
        light ? "text-white" : "text-[#17231d]",
      )}
    >
      <LogoMark
        inverted={light}
        className="size-8 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-6"
      />
      <span className="text-[19px]">
        fersaku
        <span className={light ? "text-[#d7ff64]" : "text-[#ff794d]"}>.</span>
      </span>
    </Link>
  );
}

export function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#173f2c] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#0c3120] hover:shadow-lg",
        className,
      )}
    >
      {children}
      <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

export function Eyebrow({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-extrabold tracking-[.16em] uppercase",
        dark
          ? "border-white/15 bg-white/8 text-[#d7ff64]"
          : "border-[#173f2c]/12 bg-white/60 text-[#315d47]",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </div>
  );
}
