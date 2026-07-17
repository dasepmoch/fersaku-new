"use client";

/**
 * ADM-340 hooks. Query cache holds case metadata only — never document bytes.
 */

import { useEffect, useRef, useState } from "react";
import { claimsHavePermission } from "@/features/admin/config/permissions";
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
  getAdminKycCase,
  listAdminKycCases,
  revokeAdminKycDocumentView,
  transitionAdminKyc,
  viewAdminKycDocument,
  type AdminKycDocumentView,
  type AdminKycListFilters,
  type TransitionAdminKycInput,
  type ViewAdminKycDocumentInput,
} from "./api";
import { demoAdminKycQueue } from "./mock";

const DOC_VIEW_TTL_MS = 2 * 60_000;

function useAdminKycReadEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminRead") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "kyc.review");
}

/** kyc.review gates list + transition + document view (BE combined until kyc.read). */
export function useAdminKycReviewEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "kyc.review");
}

export function useAdminKycQueue(filters: AdminKycListFilters = {}) {
  const enabled = useAdminKycReadEnabled();
  const keyFilters = {
    status: filters.status ?? "",
    age: filters.age ?? "all",
    limit: filters.limit ?? 50,
  };
  return useAppQuery({
    queryKey: queryKeys.admin.kyc(keyFilters),
    queryFn: (signal) => listAdminKycCases(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoAdminKycQueue()),
  });
}

export function useAdminKycCase(caseId: string) {
  const enabled = useAdminKycReadEnabled();
  const id = caseId.trim();
  return useAppQuery({
    queryKey: queryKeys.admin.kycCase(id),
    queryFn: (signal) => getAdminKycCase(id, signal),
    surface: "private",
    enabled: enabled && Boolean(id),
  });
}

function invalidateKycCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  caseId?: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["admin", "kyc"],
  });
  if (caseId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.kycCase(caseId),
    });
  }
}

export function useTransitionAdminKycMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "kyc", "transition"],
    mutationFn: (input: TransitionAdminKycInput, signal) =>
      transitionAdminKyc(input, signal),
    onSuccess: (data) => {
      invalidateKycCaches(queryClient, data.case.id);
    },
  });
}

/**
 * Component-local decrypted document view: short TTL, revoke on unmount/hidden.
 * Never put blob/objectUrl into React Query.
 */
export function useAdminKycDocumentViewMemory() {
  const [view, setView] = useState<AdminKycDocumentView | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setView((prev) => {
      revokeAdminKycDocumentView(prev);
      return null;
    });
  };

  const hold = (next: AdminKycDocumentView) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setView((prev) => {
      if (prev && prev.objectUrl !== next.objectUrl) {
        revokeAdminKycDocumentView(prev);
      }
      return next;
    });
    timerRef.current = setTimeout(clear, DOC_VIEW_TTL_MS);
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") clear();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clear();
    };
  }, []);

  return { view, hold, clear };
}

export function useViewAdminKycDocumentMutation() {
  return useAppMutation({
    mutationKey: ["admin", "kyc", "document-view"],
    mutationFn: (input: ViewAdminKycDocumentInput, signal) =>
      viewAdminKycDocument(input, signal),
    // Intentionally no onSuccess cache write — blob stays in mutation result only.
  });
}
