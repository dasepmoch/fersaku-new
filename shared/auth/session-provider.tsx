"use client";

/**
 * INT-120 — React session provider (source-neutral).
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
import {
  applyRemoteLogout,
  bindSessionQueryClient,
  bootstrapSession,
  getSessionSnapshot,
  logoutSession,
  setMockSurfaceHint,
  subscribeSession,
  wireSessionTransportHooks,
} from "./session-store";
import { subscribeSessionBroadcast } from "./session-broadcast";
import type {
  SessionClaims,
  SessionSnapshot,
  SessionSurface,
} from "./session-model";
import { sessionHasPermission } from "./guards";

type SessionContextValue = {
  snapshot: SessionSnapshot;
  claims: SessionClaims | null;
  status: SessionSnapshot["status"];
  ready: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  refresh: () => Promise<SessionSnapshot>;
  logout: (surface?: SessionSurface) => Promise<{ loginHref: string }>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  mockSurface,
  autoBootstrap = true,
}: {
  children: ReactNode;
  /** Prototype mock surface when auth domain is mock. */
  mockSurface?: SessionSurface;
  autoBootstrap?: boolean;
}) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() =>
    getSessionSnapshot(),
  );

  useEffect(() => {
    bindSessionQueryClient(queryClient);
    wireSessionTransportHooks();
    if (mockSurface) setMockSurfaceHint(mockSurface);
    const unsub = subscribeSession(setSnapshot);
    const unsubBroadcast = subscribeSessionBroadcast((msg) => {
      if (msg.type === "logout") {
        applyRemoteLogout();
      } else if (msg.type === "session-changed") {
        void bootstrapSession({ force: true });
      }
    });
    if (autoBootstrap) {
      void bootstrapSession({ mockSurface });
    }
    return () => {
      unsub();
      unsubBroadcast();
    };
  }, [queryClient, mockSurface, autoBootstrap]);

  const refresh = useCallback(
    () => bootstrapSession({ force: true, mockSurface }),
    [mockSurface],
  );

  const logout = useCallback(
    (surface?: SessionSurface) =>
      logoutSession({
        surface: surface ?? mockSurface ?? snapshot.claims?.surface,
        redirect: true,
      }),
    [mockSurface, snapshot.claims?.surface],
  );

  const value = useMemo<SessionContextValue>(() => {
    const claims = snapshot.claims;
    return {
      snapshot,
      claims,
      status: snapshot.status,
      ready: snapshot.status !== "loading",
      isAuthenticated:
        snapshot.status === "authenticated" && Boolean(claims?.subjectId),
      hasPermission: (permission: string) =>
        sessionHasPermission(claims, permission),
      refresh,
      logout,
    };
  }, [snapshot, refresh, logout]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    // Soft fallback for trees outside provider (tests / public islands).
    const snap = getSessionSnapshot();
    return {
      snapshot: snap,
      claims: snap.claims,
      status: snap.status,
      ready: snap.status !== "loading",
      isAuthenticated:
        snap.status === "authenticated" && Boolean(snap.claims?.subjectId),
      hasPermission: (permission: string) =>
        sessionHasPermission(snap.claims, permission),
      refresh: () => bootstrapSession({ force: true }),
      logout: (surface?: SessionSurface) =>
        logoutSession({ surface, redirect: true }),
    };
  }
  return ctx;
}

export function useSessionClaims(): SessionClaims | null {
  return useSession().claims;
}

export function useHasPermission(permission: string): boolean {
  return useSession().hasPermission(permission);
}
