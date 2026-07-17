"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  getDomainSourceSnapshot,
  installDomainSourceSnapshot,
  type DomainSourceSnapshot,
  toPublicDomainSourceSnapshot,
} from "@/shared/data/domain-source";

const DomainSourceContext = createContext<DomainSourceSnapshot | null>(null);

/**
 * SSR/request-stable hydration bridge (INT-025).
 * Server evaluates once via createBootstrapDomainSourceSnapshot() and passes
 * the public-safe snapshot as prop; client installs it before children read
 * getDomainSource so SSR and browser agree on the same request.
 */
export function DomainSourceProvider({
  snapshot,
  children,
}: {
  snapshot: DomainSourceSnapshot;
  children: ReactNode;
}) {
  const publicSnapshot = useMemo(
    () => toPublicDomainSourceSnapshot(snapshot),
    [snapshot],
  );

  // Install synchronously during render so adapter reads see the same map.
  installDomainSourceSnapshot(publicSnapshot);

  return (
    <DomainSourceContext.Provider value={publicSnapshot}>
      {children}
    </DomainSourceContext.Provider>
  );
}

export function useDomainSourceSnapshot(): DomainSourceSnapshot {
  return useContext(DomainSourceContext) ?? getDomainSourceSnapshot();
}
