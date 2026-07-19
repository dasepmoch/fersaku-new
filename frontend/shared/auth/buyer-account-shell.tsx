"use client";

/**
 * INT-120 — buyer /account shell: guard private paths only; login/verify pass through.
 */

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getDomainSource } from "@/shared/data/domain-source";
import { SessionRouteGuard } from "./route-guard";
import { bootstrapSession, setMockSurfaceHint } from "./session-store";

export function BuyerAccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/account";
  const isPublicAuth =
    pathname === "/account/login" ||
    pathname === "/account/verify" ||
    pathname.startsWith("/account/login/") ||
    pathname.startsWith("/account/verify/");

  useEffect(() => {
    setMockSurfaceHint("buyer");
    try {
      if (getDomainSource("auth") === "mock") {
        void bootstrapSession({ force: true, mockSurface: "buyer" });
      }
    } catch {
      void bootstrapSession({ force: true, mockSurface: "buyer" });
    }
  }, []);

  if (isPublicAuth) {
    return <>{children}</>;
  }

  return <SessionRouteGuard surface="buyer">{children}</SessionRouteGuard>;
}
