"use client";

/**
 * INT-120 — private surface shell: set mock surface hint + route guard.
 * Markup-neutral wrapper for existing frames.
 */

import { useEffect, type ReactNode } from "react";
import { getDomainSource } from "@/shared/data/domain-source";
import { SessionRouteGuard } from "./route-guard";
import { bootstrapSession, setMockSurfaceHint } from "./session-store";
import type { SessionSurface } from "./session-model";

export function PrivateSurfaceShell({
  surface,
  children,
  requireMfaVerified = false,
}: {
  surface: SessionSurface;
  children: ReactNode;
  requireMfaVerified?: boolean;
}) {
  useEffect(() => {
    setMockSurfaceHint(surface);
    // Mock domain: re-bootstrap with correct surface claims (no hardcoded API identity).
    // API mode: never force-bootstrap here — SessionProvider owns bootstrap; force storms
    // hit rate limits and bounce private shells back to login.
    try {
      if (getDomainSource("auth") === "mock") {
        void bootstrapSession({ force: true, mockSurface: surface });
      }
    } catch {
      // Fail closed: do not force bootstrap on unknown source.
    }
  }, [surface]);

  return (
    <SessionRouteGuard
      surface={surface}
      requireMfaVerified={requireMfaVerified}
    >
      {children}
    </SessionRouteGuard>
  );
}
