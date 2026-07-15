"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Code2,
  FileCheck2,
  KeyRound,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
type ApiKycApplicant = {
  id: string;
  store: string;
  owner: string;
  application: string;
  environment: string;
  submitted: string;
  risk: string;
  docs: string[];
  status: string;
  usage: string;
};
const apiKycSeed: ApiKycApplicant[] = [
  {
    id: "API-2198",
    store: "Studio Reka",
    owner: "Raka Pratama",
    application: "APP-QRS-8821",
    environment: "Live",
    submitted: "8m ago",
    risk: "Low",
    docs: ["KTP", "Selfie", "NPWP"],
    status: "Submitted",
    usage: "SaaS checkout API",
  },
  {
    id: "API-2193",
    store: "Kelas Finansial",
    owner: "Nisa Handayani",
    application: "APP-QRS-8814",
    environment: "Live",
    submitted: "24m ago",
    risk: "Medium",
    docs: ["KTP", "Selfie", "NPWP", "NIB"],
    status: "Vendor check",
    usage: "Course platform API",
  },
  {
    id: "API-2187",
    store: "Budi Design Vault",
    owner: "Budi Setiawan",
    application: "APP-QRS-8798",
    environment: "Live",
    submitted: "1h ago",
    risk: "High",
    docs: ["KTP", "Selfie"],
    status: "Needs clarification",
    usage: "Custom QRIS integration",
  },
  {
    id: "API-2179",
    store: "NotionKita",
    owner: "Salsa Maharani",
    application: "APP-QRS-8762",
    environment: "Live",
    submitted: "2h ago",
    risk: "Low",
    docs: ["KTP", "Selfie", "NPWP"],
    status: "Approved",
    usage: "Membership backend",
  },
  {
    id: "API-2172",
    store: "Prompt Factory ID",
    owner: "Gilang Ramadhan",
    application: "APP-QRS-8744",
    environment: "Live",
    submitted: "3h ago",
    risk: "Medium",
    docs: ["KTP", "Selfie", "NPWP"],
    status: "Vendor check",
    usage: "Automation API",
  },
];
export function KycVerificationCenter() {
  const [applicants, setApplicants] = useState(apiKycSeed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("Provider belum dipilih");
  const [vendorSaved, setVendorSaved] = useState(false);
  const selected = applicants.find((item) => item.id === selectedId);
  const columns = [
    "Submitted",
    "Vendor check",
    "Needs clarification",
    "Approved",
  ];
  const visible = applicants.filter((item) =>
    `${item.store} ${item.owner} ${item.id} ${item.application}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const move = (status: string) => {
    if (!selected) return;
    setApplicants((items) =>
      items.map((item) =>
        item.id === selected.id ? { ...item, status } : item,
      ),
    );
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
              produk, inventory, saldo, dan withdrawal tidak
              memerlukan KYC ini dan tetap mendapat akses penuh. Sandbox API
              juga tetap tersedia tanpa KYC.
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

      <section className={`${panel} mt-4 overflow-hidden`}>
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
              value={vendor}
              onChange={(event) => {
                setVendor(event.target.value);
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
              onClick={() => {
                setVendorSaved(true);
                setTimeout(() => setVendorSaved(false), 1600);
              }}
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

        <div className="grid gap-4 overflow-x-auto bg-[#f5f6f9] p-4 xl:grid-cols-4">
          {columns.map((column) => (
            <div key={column} className="min-w-[270px]">
              <div className="mb-3 flex items-center">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    column === "Approved"
                      ? "bg-[#2da467]"
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
                      <div className="mt-4 flex items-center border-t border-[#edf0f4] pt-3 text-[7px] text-[#7c879d]">
                        <KeyRound className="mr-1.5 size-3" />{" "}
                        {applicant.environment} key request
                        <span className="ml-auto">{applicant.submitted}</span>
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
        />
      )}
    </>
  );
}
function ApiKycDialog({
  applicant,
  vendor,
  onClose,
  onMove,
}: {
  applicant: ApiKycApplicant;
  vendor: string;
  onClose: () => void;
  onMove: (status: string) => void;
}) {
  return (
    <Modal
      title={applicant.store}
      eyebrow={`Live QRIS API application ${applicant.application}`}
      icon={Code2}
      onClose={onClose}
    >
      <div className="rounded-2xl border border-[#b9c9f5] bg-[#eef2ff] p-4 text-[8px] leading-4 text-[#53678d]">
        <ShieldCheck className="mr-2 inline size-3.5" /> KYC decision controls
        only production QRIS API access. Storefront, hosted checkout, product
        delivery, balance, and seller payout remain unaffected.
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["KTP front", "OCR pending"],
          ["Selfie / liveness", "Vendor check"],
          ["NPWP", "Format valid"],
        ].map(([name, note]) => (
          <div
            key={name}
            className="aspect-[1.2] rounded-2xl border border-[#dfe3ec] bg-[#f5f6f9] p-4"
          >
            <FileCheck2 className="size-5 text-[#53637a]" />
            <b className="mt-8 block text-[8px]">{name}</b>
            <span className="mt-1 block text-[7px] text-[#6f7a8d]">{note}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["Applicant", applicant.owner],
          ["Requested access", "Live QRIS payment API"],
          ["Use case", applicant.usage],
          ["Verification adapter", vendor],
          ["Risk tier", applicant.risk],
          ["Sandbox access", "Active - no KYC required"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#f5f6f9] p-3">
            <span className="text-[7px] text-[#7c879d]">{label}</span>
            <b className="mt-1 block text-[8px]">{value}</b>
          </div>
        ))}
      </div>
      <Field label="Reviewer note">
        <textarea
          rows={3}
          defaultValue="Review identity package and intended API use before enabling production credentials."
          className="w-full resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] outline-none"
        />
      </Field>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          onClick={() => onMove("Vendor check")}
          className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold"
        >
          Send to vendor
        </button>
        <button
          onClick={() => onMove("Needs clarification")}
          className="h-10 rounded-xl border border-[#e7c86d] bg-[#fff8e8] text-[8px] font-bold text-[#82651f]"
        >
          Request changes
        </button>
        <button
          onClick={() => onMove("Rejected")}
          className="h-10 rounded-xl border border-[#efc0bc] text-[8px] font-bold text-[#bd4e47]"
        >
          Reject API
        </button>
        <button
          onClick={() => onMove("Approved")}
          className="h-10 rounded-xl bg-[#218a52] text-[8px] font-extrabold text-white"
        >
          Enable live API
        </button>
      </div>
    </Modal>
  );
}
function AdminMetric({
  icon: Icon,
  label,
  value,
  note,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const colors =
    tone === "danger"
      ? "bg-[#fff0ee] text-[#c9544d]"
      : tone === "warning"
        ? "bg-[#fff5df] text-[#ad741f]"
        : tone === "success"
          ? "bg-[#e7f6ec] text-[#238150]"
          : "bg-[#edf1fb] text-[#536fdf]";
  return (
    <div className={`${panel} p-5`}>
      <div className="flex items-start">
        <span
          className={cn("grid size-10 place-items-center rounded-xl", colors)}
        >
          <Icon className="size-4" />
        </span>
        <ArrowRight className="ml-auto size-4 text-[#a0a8b7]" />
      </div>
      <p className="mt-5 text-[8px] font-extrabold tracking-[.12em] text-[#7c879d] uppercase">
        {label}
      </p>
      <b className="mt-1 block text-xl tracking-[-.04em]">{value}</b>
      <span className="mt-1 block text-[8px] text-[#7c879d]">{note}</span>
    </div>
  );
}
function RiskDot({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "ml-auto rounded-full px-2 py-1 text-[7px] font-extrabold",
        value === "High"
          ? "bg-[#fff0ee] text-[#c9544d]"
          : value === "Medium"
            ? "bg-[#fff5df] text-[#9b6a1f]"
            : "bg-[#e7f6ec] text-[#238150]",
      )}
    >
      {value}
    </span>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 grid gap-2 text-[8px] font-extrabold">
      {label}
      {children}
    </label>
  );
}
function Modal({
  title,
  eyebrow,
  icon: Icon,
  onClose,
  children,
  danger = false,
}: {
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/72 p-4 backdrop-blur-sm">
      <section className="my-6 w-full max-w-2xl rounded-[26px] bg-white p-6 text-[#131827] shadow-2xl">
        <div className="flex items-start">
          <span
            className={cn(
              "grid size-12 place-items-center rounded-2xl",
              danger
                ? "bg-[#fff0ee] text-[#c9544d]"
                : "bg-[#edf1fb] text-[#536fdf]",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="ml-4">
            <p className="text-[7px] font-extrabold tracking-[.18em] text-[#7c879d] uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-black">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
