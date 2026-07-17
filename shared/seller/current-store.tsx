"use client";

/**
 * INT-150 — current-store context from seller bootstrap.
 * Authority is server bootstrap; URL/localStorage never authorize.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDomainSource } from "@/shared/data/domain-source";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import {
  createMockSellerBootstrap,
  fetchSellerBootstrap,
  isAllowedSellerStoreId,
  needsSellerOnboarding,
  putSellerCurrentStore,
  type SellerBootstrap,
} from "./bootstrap-api";
import { clearSellerStoreCache } from "./store-cache";

export type CurrentStoreStatus =
  | "loading"
  | "ready"
  | "no_membership"
  | "needs_onboarding"
  | "error";

type CurrentStoreContextValue = {
  status: CurrentStoreStatus;
  bootstrap: SellerBootstrap | null;
  /** Server-selected or UI-switched store id (validated against membership). */
  storeId: string | null;
  canonicalStoreId: string | null;
  merchantId: string | null;
  /** Server onboarding completion (false → workspace redirects to onboarding). */
  onboardingCompleted: boolean;
  errorCode: string | null;
  refresh: () => Promise<void>;
  /**
   * Switch current store: validates membership, persists preference (API mode),
   * clears prior store cache keys. Canonical single-store launch: no UI menu.
   */
  switchStore: (storeId: string) => Promise<void>;
};

const CurrentStoreContext = createContext<CurrentStoreContextValue | null>(
  null,
);

function sellerDomainSource(): "mock" | "api" | "disabled" {
  try {
    return getDomainSource("sellerCatalog");
  } catch {
    return "mock";
  }
}

export function CurrentStoreProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CurrentStoreStatus>("loading");
  const [bootstrap, setBootstrap] = useState<SellerBootstrap | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const applyBootstrap = useCallback((boot: SellerBootstrap) => {
    const current =
      boot.currentStoreId?.trim() ||
      boot.canonicalStoreId?.trim() ||
      boot.stores?.[0]?.storeId ||
      null;
    setBootstrap(boot);
    setStoreId(current);
    if (needsSellerOnboarding(boot)) {
      setStatus("needs_onboarding");
    } else if (!current) {
      setStatus("no_membership");
    } else {
      setStatus("ready");
    }
    setErrorCode(null);
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setErrorCode(null);
    const source = sellerDomainSource();
    if (source === "disabled") {
      setBootstrap(null);
      setStoreId(null);
      setStatus("error");
      setErrorCode("DOMAIN_DISABLED");
      return;
    }
    if (source === "mock") {
      applyBootstrap(createMockSellerBootstrap(DEMO_STORE_ID));
      return;
    }
    try {
      const boot = await fetchSellerBootstrap();
      applyBootstrap(boot);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "BOOTSTRAP_FAILED";
      if (code === "FORBIDDEN" || code === "RESOURCE_NOT_FOUND") {
        setBootstrap(null);
        setStoreId(null);
        setStatus("no_membership");
        setErrorCode(code);
        return;
      }
      setBootstrap(null);
      setStoreId(null);
      setStatus("error");
      setErrorCode(code);
    }
  }, [applyBootstrap]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchStore = useCallback(
    async (nextId: string) => {
      if (!nextId || !bootstrap) return;
      if (!isAllowedSellerStoreId(bootstrap, nextId)) {
        // Client never elevates foreign store — ignore invalid UI choice.
        return;
      }
      const prev = storeId;
      if (prev === nextId) return;

      if (sellerDomainSource() === "api") {
        await putSellerCurrentStore(nextId);
      }

      clearSellerStoreCache(queryClient, prev);
      setStoreId(nextId);
      setBootstrap((b) =>
        b
          ? {
              ...b,
              currentStoreId: nextId,
            }
          : b,
      );
    },
    [bootstrap, storeId, queryClient],
  );

  const value = useMemo<CurrentStoreContextValue>(
    () => ({
      status,
      bootstrap,
      storeId,
      canonicalStoreId: bootstrap?.canonicalStoreId ?? null,
      merchantId: bootstrap?.merchantId ?? null,
      onboardingCompleted:
        status === "ready" && Boolean(storeId) && !needsSellerOnboarding(bootstrap),
      errorCode,
      refresh,
      switchStore,
    }),
    [
      status,
      bootstrap,
      storeId,
      errorCode,
      refresh,
      switchStore,
    ],
  );

  return (
    <CurrentStoreContext.Provider value={value}>
      {children}
    </CurrentStoreContext.Provider>
  );
}

export function useCurrentStore(): CurrentStoreContextValue {
  const ctx = useContext(CurrentStoreContext);
  if (!ctx) {
    throw new Error("useCurrentStore must be used within CurrentStoreProvider");
  }
  return ctx;
}

/**
 * Store id for seller hooks. API mode never falls back to DEMO_STORE_ID.
 * Mock mode may use demo id while bootstrap loads.
 */
export function useSellerStoreId(): string {
  const { storeId, status } = useCurrentStore();
  if (storeId) return storeId;
  if (sellerDomainSource() === "mock") return DEMO_STORE_ID;
  // API / disabled: empty string disables queries (hooks should treat as not ready).
  if (status === "loading") return "";
  return "";
}

/** True when store context is ready for data fetches. */
export function useSellerStoreReady(): boolean {
  const { status, storeId } = useCurrentStore();
  if (sellerDomainSource() === "mock") return true;
  return status === "ready" && Boolean(storeId);
}
