"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Eye,
  Gift,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Menu,
  Package,
  PanelLeftClose,
  Search,
  Settings,
  ShoppingBag,
  Star,
  Users,
  WalletCards,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Logo } from "@/components/brand";
import { MockInteractionBoundary } from "@/components/mock-interaction-boundary";
import { ThemeToggle } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { NotificationCenter, ProfileMenu } from "@/shared/ui/account-controls";
import { readVersionedStorage } from "@/shared/storage/versioned-storage";
import { z } from "zod";
import { appendMockAuditEvent } from "@/features/admin/data/mock-audit";
import {
  clearImpersonationSession,
  isImpersonationSessionActive,
  readImpersonationSession,
  type ImpersonationSession,
} from "@/features/admin/impersonation/session";
import { ImpersonationPolicyBoundary } from "@/features/admin/impersonation/policy-boundary";

const nav = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["Produk", "/dashboard/products", Package],
  ["Inventory", "/dashboard/inventory", Boxes],
  ["Pesanan", "/dashboard/orders", ShoppingBag],
  ["Pelanggan", "/dashboard/customers", Users],
  ["Ulasan", "/dashboard/reviews", Star],
  ["Kupon", "/dashboard/coupons", Gift],
  ["Saldo", "/dashboard/balance", WalletCards],
  ["Penarikan", "/dashboard/withdrawals", CreditCard],
  ["Storefront", "/dashboard/storefront", Globe2],
  ["API Keys", "/dashboard/api-keys", KeyRound],
  ["Webhooks", "/dashboard/webhooks", Webhook],
  ["Settings", "/dashboard/settings", Settings],
] as const;

type SellerAnnouncement = {
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  kind: "info" | "warning" | "critical" | "compliance";
  mandatory: boolean;
};

const announcementSchema = z
  .object({
    title: z.string(),
    message: z.string(),
    ctaLabel: z.string(),
    ctaUrl: z.string(),
    kind: z.enum(["info", "warning", "critical", "compliance"]),
    mandatory: z.boolean(),
  })
  .nullable();

const announcementStorageKey = "fersaku-admin-announcement";

function impersonationReturnPath(session: ImpersonationSession) {
  return session.targetType === "user"
    ? "/admin/users"
    : `/admin/merchants/${session.targetId}`;
}

function readAnnouncement(): SellerAnnouncement | null {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage;
  const adaptedStorage = {
    getItem(key: string) {
      const raw = storage.getItem(key);
      if (!raw) return raw;
      try {
        const parsed = JSON.parse(raw) as { version?: unknown };
        if (typeof parsed.version === "number") return raw;
        return JSON.stringify({ version: 1, data: parsed });
      } catch {
        return raw;
      }
    },
  };
  return readVersionedStorage({
    key: announcementStorageKey,
    version: 1,
    schema: announcementSchema,
    fallback: () => null,
    storage: adaptedStorage,
  });
}

export function DashboardShell({
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
  const router = useRouter();
  const impersonationQuery = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("popstate", onChange);
      window.addEventListener("fersaku-impersonation-updated", onChange);
      return () => {
        window.removeEventListener("popstate", onChange);
        window.removeEventListener("fersaku-impersonation-updated", onChange);
      };
    },
    () => window.location.search,
    () => "",
  );
  const impersonationParams = new URLSearchParams(impersonationQuery);
  const impersonationTargetId = impersonationParams.get("impersonate");
  const impersonationSessionId = impersonationParams.get("session");
  const impersonationSessionSnapshot = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener("fersaku-impersonation-updated", onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener("fersaku-impersonation-updated", onChange);
      };
    },
    () => {
      const stored = readImpersonationSession();
      if (!stored) return "";
      const hasUrlBinding = Boolean(
        impersonationSessionId || impersonationTargetId,
      );
      const matchesUrlBinding =
        stored.sessionId === impersonationSessionId &&
        stored.targetId === impersonationTargetId;
      return !hasUrlBinding || matchesUrlBinding ? JSON.stringify(stored) : "";
    },
    () => "",
  );
  const impersonationSession = useMemo<ImpersonationSession | null>(() => {
    if (!impersonationSessionSnapshot) return null;
    try {
      return JSON.parse(impersonationSessionSnapshot) as ImpersonationSession;
    } catch {
      return null;
    }
  }, [impersonationSessionSnapshot]);
  const activeImpersonationSession =
    impersonationSession && isImpersonationSessionActive(impersonationSession)
      ? impersonationSession
      : null;
  useEffect(() => {
    const stored = readImpersonationSession();
    const runtimeParams = new URLSearchParams(window.location.search);
    const runtimeSessionId = runtimeParams.get("session");
    const runtimeTargetId = runtimeParams.get("impersonate");
    const hasAnyBinding = Boolean(runtimeSessionId || runtimeTargetId);
    if (!stored && !hasAnyBinding) return;

    const bindingIsValid = Boolean(
      stored &&
      runtimeSessionId &&
      runtimeTargetId &&
      stored.sessionId === runtimeSessionId &&
      stored.targetId === runtimeTargetId &&
      isImpersonationSessionActive(stored),
    );
    if (bindingIsValid) return;

    if (stored && !isImpersonationSessionActive(stored)) {
      appendMockAuditEvent({
        actor: stored.actor,
        action: "impersonation.expired",
        target: stored.targetId,
        ip: "mock-admin-session",
        result: "Success",
      });
    } else {
      appendMockAuditEvent({
        actor: stored?.actor ?? "admin@fersaku.id",
        action: "impersonation.binding.blocked",
        target: stored?.targetId ?? runtimeTargetId ?? "unknown",
        ip: "mock-admin-session",
        result: "Blocked",
        context: "Missing, malformed, expired, or mismatched URL binding",
      });
    }
    const destination = stored
      ? impersonationReturnPath(stored)
      : "/admin/users";
    clearImpersonationSession();
    window.dispatchEvent(new Event("fersaku-impersonation-updated"));
    router.replace(destination);
  }, [impersonationSessionId, impersonationTargetId, router]);
  useEffect(() => {
    if (!activeImpersonationSession) return;
    const expireSession = () => {
      const stored = readImpersonationSession();
      if (
        !stored ||
        stored.sessionId !== activeImpersonationSession.sessionId
      ) {
        return;
      }
      appendMockAuditEvent({
        actor: activeImpersonationSession.actor,
        action: "impersonation.expired",
        target: activeImpersonationSession.targetId,
        ip: "mock-admin-session",
        result: "Success",
      });
      clearImpersonationSession();
      window.dispatchEvent(new Event("fersaku-impersonation-updated"));
      router.replace(impersonationReturnPath(activeImpersonationSession));
    };
    const remaining =
      new Date(activeImpersonationSession.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(expireSession, remaining);
    return () => window.clearTimeout(timer);
  }, [activeImpersonationSession, router]);
  const impersonating = Boolean(activeImpersonationSession);
  const impersonationSearch = activeImpersonationSession
    ? `?impersonate=${encodeURIComponent(activeImpersonationSession.targetId)}&session=${encodeURIComponent(activeImpersonationSession.sessionId)}`
    : "";
  const endImpersonation = () => {
    if (!impersonationSession) return;
    appendMockAuditEvent({
      actor: impersonationSession.actor,
      action: "impersonation.ended",
      target: impersonationSession.targetId,
      ip: "mock-admin-session",
      result: "Success",
    });
    const destination = impersonationReturnPath(impersonationSession);
    clearImpersonationSession();
    window.dispatchEvent(new Event("fersaku-impersonation-updated"));
    router.replace(destination);
  };
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [announcement, setAnnouncement] = useState<SellerAnnouncement | null>(
    null,
  );
  useEffect(() => {
    const loadAnnouncement = () => {
      setAnnouncement(readAnnouncement());
    };

    loadAnnouncement();
    window.addEventListener("storage", loadAnnouncement);
    window.addEventListener("fersaku-announcement-updated", loadAnnouncement);
    return () => {
      window.removeEventListener("storage", loadAnnouncement);
      window.removeEventListener(
        "fersaku-announcement-updated",
        loadAnnouncement,
      );
    };
  }, []);

  const dismissAnnouncement = () => {
    localStorage.removeItem(announcementStorageKey);
    setAnnouncement(null);
  };
  return (
    <div className="min-h-screen bg-[#f1f2ed]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#132d21] text-white transition-all duration-300",
          collapsed ? "w-[76px]" : "w-[244px]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex h-20 items-center border-b border-white/8 px-5",
            collapsed && "justify-center px-0",
          )}
        >
          <div className={collapsed ? "[&>a>span:last-child]:hidden" : ""}>
            <Logo light />
          </div>
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setOpen(false)}
            className="ml-auto text-white/50 lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className={cn("p-3", collapsed && "px-2")}>
          <button
            className={cn(
              "flex w-full items-center rounded-xl border border-white/10 bg-white/[.06] p-2.5 text-left",
              collapsed ? "justify-center" : "gap-3",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#d7ff64] text-xs font-black text-[#173f2c]">
              A
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold">
                    Asep AI Tools
                  </span>
                  <span className="block text-[9px] text-white/35">
                    fersaku.id/@asep
                  </span>
                </span>
                <ChevronDown className="size-3.5 text-white/40" />
              </>
            )}
          </button>
        </div>
        <nav
          className={cn(
            "flex-1 overflow-y-auto px-3 py-2",
            collapsed && "px-2",
          )}
        >
          {nav.map(([label, href, Icon], i) => {
            const active =
              href === "/dashboard" ? path === href : path.startsWith(href);
            return (
              <div key={href}>
                {[7, 10].includes(i) && (
                  <div className="my-3 border-t border-white/8" />
                )}
                <Link
                  href={`${href}${impersonationSearch}`}
                  onClick={() => setOpen(false)}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "mb-1 flex h-10 items-center rounded-xl text-xs font-semibold transition",
                    collapsed ? "justify-center" : "gap-3 px-3",
                    active
                      ? "bg-[#d7ff64] font-extrabold text-[#173f2c]"
                      : "text-white/50 hover:bg-white/[.06] hover:text-white",
                  )}
                >
                  <Icon className="size-[17px] shrink-0" />
                  {!collapsed && label}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className={cn("border-t border-white/8 p-3", collapsed && "px-2")}>
          <button
            className={cn(
              "flex h-10 w-full items-center rounded-xl text-xs font-semibold text-white/45 hover:bg-white/[.06]",
              collapsed ? "justify-center" : "gap-3 px-3",
            )}
          >
            <CircleHelp className="size-[17px]" />
            {!collapsed && "Bantuan & panduan"}
          </button>
        </div>
        <button
          type="button"
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          onClick={() => setCollapsed(!collapsed)}
          className="hairline absolute top-24 -right-3 hidden size-7 place-items-center rounded-full border bg-white text-[#173f2c] shadow-sm lg:grid"
        >
          <PanelLeftClose
            className={cn("size-3.5 transition", collapsed && "rotate-180")}
          />
        </button>
      </aside>
      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[244px]",
        )}
      >
        {impersonating && activeImpersonationSession && (
          <div className="sticky top-0 z-[60] flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 bg-[#fff0bf] px-4 py-2 text-[9px] font-extrabold text-[#6e5518] sm:px-6 lg:px-8">
            <Eye className="size-3.5 shrink-0" />
            <span>
              ADMIN IMPERSONATION • {activeImpersonationSession.targetName} •{" "}
              {activeImpersonationSession.scope === "read-only"
                ? "Read-only session"
                : "Support-write session"}
            </span>
            <span className="font-normal text-[#8d742d]">
              Expires{" "}
              {new Date(
                activeImpersonationSession.expiresAt,
              ).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              • Audit {activeImpersonationSession.sessionId.slice(0, 8)}
            </span>
            <button
              type="button"
              onClick={endImpersonation}
              className="ml-auto rounded-lg bg-[#6e5518] px-3 py-1.5 text-white"
            >
              End session
            </button>
          </div>
        )}
        {announcement && (
          <section
            className={cn(
              "relative z-[45] border-b px-4 py-3 sm:px-6 lg:px-8",
              announcement.kind === "critical" &&
                "border-[#eaa09a] bg-[#fff0ee] text-[#873a35]",
              announcement.kind === "warning" &&
                "border-[#e6c971] bg-[#fff8df] text-[#72591c]",
              announcement.kind === "info" &&
                "border-[#a9c1eb] bg-[#edf4ff] text-[#355681]",
              announcement.kind === "compliance" &&
                "border-[#9eadd8] bg-[#eef2ff] text-[#344b83]",
            )}
          >
            <div className="mx-auto flex max-w-[1320px] flex-col gap-3 sm:flex-row sm:items-center">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-current/10">
                <AlertTriangle className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <b className="text-[10px]">{announcement.title}</b>
                  {announcement.mandatory && (
                    <span className="rounded-full bg-current/10 px-2 py-1 text-[7px] font-extrabold tracking-wider uppercase">
                      Wajib dibaca
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[9px] leading-4 opacity-80">
                  {announcement.message}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {announcement.ctaLabel && announcement.ctaUrl && (
                  <Link
                    href={announcement.ctaUrl}
                    className="rounded-xl bg-[#132d21] px-3 py-2 text-[8px] font-extrabold text-white"
                  >
                    {announcement.ctaLabel}
                  </Link>
                )}
                <button
                  onClick={dismissAnnouncement}
                  aria-label={
                    announcement.mandatory
                      ? "Acknowledge announcement"
                      : "Dismiss announcement"
                  }
                  className="grid h-9 min-w-9 place-items-center rounded-xl border border-current/20 px-3 text-[8px] font-extrabold"
                >
                  {announcement.mandatory ? (
                    <span className="flex items-center gap-1.5">
                      <Check className="size-3.5" /> Saya mengerti
                    </span>
                  ) : (
                    <X className="size-3.5" />
                  )}
                </button>
              </div>
            </div>
          </section>
        )}
        <header className="hairline sticky top-0 z-30 flex h-20 items-center border-b bg-[#f7f7f3]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Buka navigasi"
            onClick={() => setOpen(true)}
            className="hairline mr-3 grid size-10 place-items-center rounded-xl border bg-white lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="hairline hidden w-full max-w-xs items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs text-[#819087] sm:flex">
            <Search className="size-4" /> Cari apa saja...{" "}
            <kbd className="hairline ml-auto rounded border bg-[#f3f4ef] px-1.5 text-[9px]">
              ⌘ K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/@asep-ai-tools"
              className="hairline hidden items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-[11px] font-bold sm:flex"
            >
              <Globe2 className="size-3.5" /> Lihat toko
            </Link>
            <NotificationCenter surface="seller" />
            <ProfileMenu surface="seller" />
          </div>
        </header>
        <ImpersonationPolicyBoundary session={activeImpersonationSession}>
          <MockInteractionBoundary>
            <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
              <div className="mx-auto max-w-[1320px]">
                <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-[-.035em] sm:text-3xl">
                      {title}
                    </h1>
                    <p className="mt-1 text-xs leading-5 text-[#718078] sm:text-sm">
                      {description}
                    </p>
                  </div>
                  {action}
                </div>
                {children}
              </div>
            </main>
          </MockInteractionBoundary>
        </ImpersonationPolicyBoundary>
      </div>
    </div>
  );
}
