"use client";

/**
 * ADM-370 hooks — bounded visibility-aware health polling; emergency mutations.
 */

import { useEffect, useState } from "react";
import {
  ADMIN_ACTION_PERMISSIONS,
  claimsHavePermission,
} from "@/features/admin/config/permissions";
import {
  getDomainSource,
  mockPlaceholderData,
} from "@/shared/data/domain-source";
import { useSessionClaims } from "@/shared/auth/session-provider";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminSystemFees,
  getAdminSystemSnapshot,
  listAdminEmergencyControls,
  listAdminProviderInfrastructure,
  previewAdminSystemFees,
  setAdminEmergencyControl,
  type FeePreviewInput,
  type SetEmergencyControlInput,
} from "./api";
import {
  demoEmergencyControls,
  demoFeePolicy,
  demoSystemSnapshot,
} from "./mock";

/** Health poll interval when tab visible (bounded). */
export const HEALTH_POLL_MS = 45_000;

function useAdminSystemReadEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminRead") === "mock") return true;
  // providers: payments.read; system/emergency: platform.emergency
  return (
    claimsHavePermission(claims?.permissions, "payments.read") ||
    claimsHavePermission(
      claims?.permissions,
      ADMIN_ACTION_PERMISSIONS.platformEmergency,
    )
  );
}

function useAdminEmergencyReadEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminRead") === "mock") return true;
  return claimsHavePermission(
    claims?.permissions,
    ADMIN_ACTION_PERMISSIONS.platformEmergency,
  );
}

export function useAdminEmergencyWriteEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(
    claims?.permissions,
    ADMIN_ACTION_PERMISSIONS.platformEmergency,
  );
}

function useAdminFeesReadEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminRead") === "mock") return true;
  return claimsHavePermission(
    claims?.permissions,
    ADMIN_ACTION_PERMISSIONS.platformFeesPreview,
  );
}

/** Visibility-aware poll: only while document is visible. */
function useVisibilityAwareRefetchInterval(intervalMs: number): number | false {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return visible ? intervalMs : false;
}

export function useAdminSystemSnapshot() {
  const enabled = useAdminEmergencyReadEnabled();
  const poll = useVisibilityAwareRefetchInterval(HEALTH_POLL_MS);
  return useAppQuery({
    queryKey: queryKeys.admin.system(),
    queryFn: (signal) => getAdminSystemSnapshot(signal),
    surface: "private",
    enabled,
    refetchInterval: poll,
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoSystemSnapshot(),
    ),
  });
}

export function useAdminEmergencyControls() {
  const enabled = useAdminEmergencyReadEnabled();
  const poll = useVisibilityAwareRefetchInterval(HEALTH_POLL_MS);
  return useAppQuery({
    queryKey: queryKeys.admin.emergencyControls(),
    queryFn: (signal) => listAdminEmergencyControls(signal),
    surface: "private",
    enabled,
    refetchInterval: poll,
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoEmergencyControls(),
    ),
  });
}

export function useAdminProviderInfrastructure() {
  const enabled = useAdminSystemReadEnabled();
  const poll = useVisibilityAwareRefetchInterval(HEALTH_POLL_MS);
  return useAppQuery({
    queryKey: queryKeys.admin.providers(),
    queryFn: (signal) => listAdminProviderInfrastructure(signal),
    surface: "private",
    enabled,
    refetchInterval: poll,
    placeholderData: mockPlaceholderData("adminRead", {
      rows: demoSystemSnapshot().componentHealth,
      emergencyControls: demoEmergencyControls(),
      overallLabel: demoSystemSnapshot().overallLabel,
      overallKind: demoSystemSnapshot().overallKind,
      checkedLabel: "just now",
      feePolicyVersion: "LAUNCH_FEE_POLICY_V1",
      note: "",
      systemError: null,
      providersError: null,
    }),
  });
}

export function useAdminSystemFees() {
  const enabled = useAdminFeesReadEnabled();
  return useAppQuery({
    queryKey: queryKeys.admin.systemFees(),
    queryFn: (signal) => getAdminSystemFees(signal),
    surface: "finance",
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoFeePolicy()),
  });
}

function invalidateOpsCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "system"] });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "emergency-controls"],
  });
  void queryClient.invalidateQueries({ queryKey: ["admin", "providers"] });
}

export function useSetAdminEmergencyControlMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "emergency-controls", "set"],
    mutationFn: (input: SetEmergencyControlInput, signal) =>
      setAdminEmergencyControl(input, signal),
    onSuccess: () => {
      invalidateOpsCaches(queryClient);
    },
  });
}

export function usePreviewAdminSystemFeesMutation() {
  return useAppMutation({
    mutationKey: ["admin", "system", "fees", "preview"],
    mutationFn: (input: FeePreviewInput, signal) =>
      previewAdminSystemFees(input, signal),
  });
}
