"use client";

import { adminPanel, ControlDialog } from "@/features/admin/ui";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Code2,
  Clock3,
  FileCheck2,
  KeyRound,
  RefreshCcw,
  Search,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canTransitionKyc,
  kycAgeLabel,
  kycTransitionRequiresVendor,
  matchesKycAgeFilter,
  type KycAgeFilter,
  type KycStatus,
} from "./data";
import { ApiKycDialog } from "./dialog";
import { AdminMetric, RiskDot } from "./pieces";
import {
  useAdminKycQueue,
  useAdminKycReviewEnabled,
  useTransitionAdminKycMutation,
} from "./hooks";
import { isAdminKycApiDomain } from "./api";
import { createIdempotencyKey } from "@/shared/api/idempotency";

export function KycVerificationCenter() {
  const canReview = useAdminKycReviewEnabled();
  const [query, setQuery] = useState("");
  const [ageFilter, setAgeFilter] = useState<KycAgeFilter>("all");
  const [vendor, setVendor] = useState("Provider belum dipilih");
  const [vendorDraft, setVendorDraft] = useState("Provider belum dipilih");
  const [vendorSaved, setVendorSaved] = useState(false);
  const [adapterDialogOpen, setAdapterDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, { status: KycStatus; rejectionReason?: string }>
  >({});
  const idemRef = useRef<string | null>(null);

  const isApi = isAdminKycApiDomain();
  const queueQuery = useAdminKycQueue({
    age: ageFilter === "all" ? "all" : ageFilter,
    limit: 50,
  });
  const transitionMutation = useTransitionAdminKycMutation();

  // Mock fixtures live in hooks/api only (INT-170 presentation boundary).
  const applicants = useMemo(() => {
    const base = queueQuery.data ?? [];
    return base.map((item) => {
      const o = localOverrides[item.id];
      if (!o) return item;
      return {
        ...item,
        status: o.status,
        rejectionReason: o.rejectionReason ?? item.rejectionReason,
      };
    });
  }, [queueQuery.data, localOverrides]);

  const selected = applicants.find((item) => item.id === selectedId);
  const columns = [
    "Submitted",
    "Vendor check",
    "Needs clarification",
    "Approved",
    "Rejected",
  ];
  const visible = applicants.filter(
    (item) =>
      `${item.store} ${item.owner} ${item.id} ${item.application}`
        .toLowerCase()
        .includes(query.toLowerCase()) && matchesKycAgeFilter(item, ageFilter),
  );

  const move = async (status: KycStatus, rejectionReason?: string) => {
    if (!selected) return;
    if (!canTransitionKyc(selected.status, status)) return;
    if (
      kycTransitionRequiresVendor(status) &&
      vendor === "Provider belum dipilih"
    ) {
      return;
    }
    if (!canReview) return;

    const reason = (rejectionReason ?? "").trim();
    if (reason.length < 12) return;

    if (isApi) {
      if (!idemRef.current) {
        idemRef.current = createIdempotencyKey();
      }
      await transitionMutation.mutateAsync({
        caseId: selected.id,
        status,
        reason,
        idempotencyKey: idemRef.current,
      });
      idemRef.current = null;
      setSelectedId(null);
      return;
    }

    // Mock path: local board update only.
    setLocalOverrides((prev) => ({
      ...prev,
      [selected.id]: {
        status,
        rejectionReason:
          status === "Rejected" || status === "Needs clarification"
            ? reason
            : undefined,
      },
    }));
    setSelectedId(null);
  };

  return (
    <>
      <section className="mb-4 overflow-hidden rounded-[22px] border border-[#b9c9f5] bg-[#eef2ff]">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#dfe7ff] text-[#536fdf]">
            <Code2 className="size-5" />
          </span>
          <div>
            <p className="text-xs font-black">
              KYC hanya untuk aktivasi Live QRIS API
            </p>
            <p className="mt-1.5 max-w-3xl text-[9px] leading-5 text-[#65718b]">
              Seller yang hanya menggunakan hosted storefront, checkout Fersaku,
              produk, inventory, saldo, dan withdrawal tidak memerlukan KYC ini
              dan tetap mendapat akses penuh. Sandbox API juga tetap tersedia
              tanpa KYC.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-2 text-[8px] font-extrabold text-[#536fdf] sm:ml-auto">
            API applicants only
          </span>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          icon={FileCheck2}
          label="API applications"
          value="18"
          note="Live QRIS access"
          tone="warning"
        />
        <AdminMetric
          icon={UserCheck}
          label="Approved today"
          value="12"
          note="Live API enabled"
          tone="success"
        />
        <AdminMetric
          icon={AlertTriangle}
          label="Clarification"
          value="7"
          note="3 identity mismatch"
          tone="danger"
        />
        <AdminMetric
          icon={KeyRound}
          label="Live keys blocked"
          value="23"
          note="Store features unaffected"
        />
      </div>

      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-[#e5e8ef] p-5 xl:flex-row xl:items-center">
          <div>
            <h2 className="text-sm font-black">
              QRIS API verification pipeline
            </h2>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              Identity verification for merchants requesting production API
              payment access.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row xl:ml-auto">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe3ec] px-3 text-[#7c879d]">
              <Search className="size-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search API applicant..."
                className="w-40 bg-transparent text-[8px] outline-none"
              />
            </label>
            <select
              aria-label="Queue age filter"
              value={ageFilter}
              onChange={(event) =>
                setAgeFilter(event.target.value as KycAgeFilter)
              }
              className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[8px] font-bold"
            >
              <option value="all">All queue age</option>
              <option value="30m">Older than 30m</option>
              <option value="2h">Older than 2h</option>
            </select>
            <select
              aria-label="KYC verification adapter"
              value={vendorDraft}
              onChange={(event) => {
                setVendorDraft(event.target.value);
                setVendorSaved(false);
              }}
              className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[8px] font-bold"
            >
              <option>Provider belum dipilih</option>
              <option>Verihubs adapter</option>
              <option>VIDA adapter</option>
              <option>Manual review mock</option>
            </select>
            <button
              type="button"
              disabled={
                vendorDraft === "Provider belum dipilih" ||
                vendorDraft === vendor
              }
              onClick={() => setAdapterDialogOpen(true)}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#11182a] px-4 text-[8px] font-extrabold text-white"
            >
              {vendorSaved ? (
                <Check className="size-3.5" />
              ) : (
                <RefreshCcw className="size-3.5" />
              )}
              {vendorSaved ? "Adapter saved" : "Save adapter"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 overflow-x-auto bg-[#f5f6f9] p-4 xl:grid-cols-5">
          {columns.map((column) => (
            <div key={column} className="min-w-[270px]">
              <div className="mb-3 flex items-center">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    column === "Approved"
                      ? "bg-[#2da467]"
                      : column === "Rejected"
                        ? "bg-[#d85b53]"
                        : column === "Needs clarification"
                          ? "bg-[#e99730]"
                          : "bg-[#5b7cfa]",
                  )}
                />
                <b className="ml-2 text-[9px]">{column}</b>
                <span className="ml-auto rounded-full bg-white px-2 py-1 text-[7px] font-bold text-[#7c879d]">
                  {visible.filter((item) => item.status === column).length}
                </span>
              </div>
              <div className="grid gap-3">
                {visible
                  .filter((item) => item.status === column)
                  .map((applicant) => (
                    <button
                      key={applicant.id}
                      type="button"
                      onClick={() => setSelectedId(applicant.id)}
                      className="rounded-2xl border border-[#dfe3ec] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start">
                        <span className="grid size-10 place-items-center rounded-xl bg-[#edf1fb] text-[9px] font-black text-[#536fdf]">
                          {applicant.store
                            .split(" ")
                            .map((word) => word[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                        <div className="ml-3 min-w-0">
                          <b className="block truncate text-[9px]">
                            {applicant.store}
                          </b>
                          <span className="mt-1 block text-[7px] text-[#7c879d]">
                            {applicant.application}
                          </span>
                        </div>
                        <RiskDot value={applicant.risk} />
                      </div>
                      <div className="mt-4 rounded-xl bg-[#f5f6f9] p-3">
                        <p className="text-[7px] font-bold text-[#536fdf]">
                          LIVE QRIS API
                        </p>
                        <p className="mt-1 text-[8px]">{applicant.usage}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {applicant.docs.map((doc) => (
                          <span
                            key={doc}
                            className="rounded-lg bg-[#f1f3f7] px-2 py-1 text-[7px] font-bold text-[#667188]"
                          >
                            {doc}
                          </span>
                        ))}
                      </div>
                      {applicant.rejectionReason && (
                        <div className="mt-3 rounded-xl bg-[#fff8e8] p-3 text-[7px] leading-4 text-[#806f4f]">
                          <b className="block text-[#9b6a1f]">Review reason</b>
                          <span>{applicant.rejectionReason}</span>
                        </div>
                      )}
                      <div className="mt-4 flex items-center border-t border-[#edf0f4] pt-3 text-[7px] text-[#7c879d]">
                        <KeyRound className="mr-1.5 size-3" />
                        {applicant.environment} key request
                        <span className="ml-auto inline-flex items-center gap-1 text-[#9b6a1f]">
                          <Clock3 className="size-3" />
                          {kycAgeLabel(applicant.ageMinutes)}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {selected && (
        <ApiKycDialog
          applicant={selected}
          vendor={vendor}
          onClose={() => setSelectedId(null)}
          onMove={move}
          busy={transitionMutation.isPending}
        />
      )}
      {adapterDialogOpen && (
        <ControlDialog
          title="Save KYC verification adapter"
          target="kyc-verification-adapter"
          onConfirm={() => {
            setVendor(vendorDraft);
            setVendorSaved(true);
          }}
          onClose={() => setAdapterDialogOpen(false)}
        />
      )}
    </>
  );
}
