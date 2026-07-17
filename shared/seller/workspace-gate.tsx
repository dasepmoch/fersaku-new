"use client";

/**
 * SEL-100 — redirect incomplete onboarding / no-store to /dashboard/onboarding.
 * Server bootstrap is authority; no local flag.
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getDomainSource } from "@/shared/data/domain-source";
import { useCurrentStore } from "./current-store";

function sellerSource(): "mock" | "api" | "disabled" {
  try {
    return getDomainSource("sellerCatalog");
  } catch {
    return "mock";
  }
}

export function SellerWorkspaceGate({ children }: { children: ReactNode }) {
  const { status } = useCurrentStore();
  const router = useRouter();
  const source = sellerSource();

  useEffect(() => {
    if (source === "mock") return;
    if (status === "needs_onboarding" || status === "no_membership") {
      router.replace("/dashboard/onboarding");
    }
  }, [status, source, router]);

  if (source === "mock") {
    return <>{children}</>;
  }

  if (status === "loading") {
    return null;
  }

  if (status === "needs_onboarding" || status === "no_membership") {
    return null;
  }

  if (status === "error") {
    // Existing workspace error boundary handles unexpected failures; do not invent UI.
    return <>{children}</>;
  }

  return <>{children}</>;
}
