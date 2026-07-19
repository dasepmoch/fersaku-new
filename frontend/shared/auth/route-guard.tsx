"use client";

/**
 * INT-120 — client route guard for private shells (no UI redesign).
 * Waits for bootstrap; redirects missing/wrong surface via existing login paths.
 */

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { decideRouteGuard } from "./guards";
import { useSession } from "./session-provider";
import type { SessionSurface } from "./session-model";

export function SessionRouteGuard({
  surface,
  children,
  requireMfaVerified = false,
  fallback = null,
}: {
  surface: SessionSurface;
  children: React.ReactNode;
  requireMfaVerified?: boolean;
  /** Shown while bootstrap loads (null = blank; keep markup minimal). */
  fallback?: React.ReactNode;
}) {
  const { snapshot, ready } = useSession();
  const pathname = usePathname() || "/";
  const router = useRouter();

  // returnTo search is optional; read at decision time in browser only.
  const search =
    typeof window !== "undefined" ? window.location.search || "" : "";

  const decision = useMemo(
    () =>
      decideRouteGuard({
        pathname,
        search,
        snapshot,
        requiredSurface: surface,
        requireMfaVerified,
      }),
    [pathname, search, snapshot, surface, requireMfaVerified],
  );

  useEffect(() => {
    if (decision.action === "redirect") {
      router.replace(decision.href);
    }
  }, [decision, router]);

  if (!ready || decision.action === "wait" || decision.action === "redirect") {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Auth entry guard: if already authenticated for this surface, go home.
 */
export function AuthEntryGuard({
  surface,
  children,
}: {
  surface: SessionSurface;
  children: React.ReactNode;
}) {
  const { snapshot, ready } = useSession();
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const decision = decideRouteGuard({
      pathname,
      snapshot,
      requiredSurface: undefined,
    });
    if (decision.action === "redirect") {
      if (
        snapshot.claims?.surface === surface ||
        decision.reason === "wrong_surface_auth_entry"
      ) {
        router.replace(decision.href);
      }
    }
  }, [ready, snapshot, pathname, router, surface]);

  return <>{children}</>;
}
