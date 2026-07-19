export const KYC_STATUSES = [
  "Submitted",
  "Vendor check",
  "Needs clarification",
  "Approved",
  "Rejected",
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

export type ApiKycDocumentMeta = {
  id: string;
  type: string;
  label: string;
  status: string;
  contentType?: string;
  sizeBytes?: number;
  scanStatus?: string;
};

export type ApiKycApplicant = {
  id: string;
  store: string;
  owner: string;
  application: string;
  environment: string;
  submitted: string;
  risk: string;
  docs: string[];
  status: KycStatus;
  usage: string;
  /** Age of the application in minutes, used for queue SLA filtering. */
  ageMinutes: number;
  /** Reviewer-facing reason when clarification or rejection is recorded. */
  rejectionReason?: string;
  /** ADM-340 server fields (optional; mock may omit). */
  merchantId?: string;
  wireStatus?: string;
  version?: number;
  documentMeta?: ApiKycDocumentMeta[];
};

const allowedTransitions: Readonly<Record<KycStatus, readonly KycStatus[]>> = {
  Submitted: ["Vendor check", "Needs clarification", "Rejected"],
  "Vendor check": ["Needs clarification", "Approved", "Rejected"],
  "Needs clarification": ["Vendor check", "Rejected"],
  Approved: [],
  Rejected: [],
};

export function canTransitionKyc(from: KycStatus, to: KycStatus) {
  return allowedTransitions[from].includes(to);
}

export function kycTransitionRequiresVendor(status: KycStatus) {
  return status === "Vendor check" || status === "Approved";
}

export type KycAgeFilter = "all" | "30m" | "2h";

export function matchesKycAgeFilter(
  applicant: ApiKycApplicant,
  filter: KycAgeFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "30m") return applicant.ageMinutes >= 30;
  return applicant.ageMinutes >= 120;
}

export function kycAgeLabel(ageMinutes: number): string {
  if (ageMinutes < 60) return `${ageMinutes}m in queue`;
  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  return minutes ? `${hours}h ${minutes}m in queue` : `${hours}h in queue`;
}

export const apiKycSeed: ApiKycApplicant[] = [
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
    ageMinutes: 8,
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
    ageMinutes: 24,
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
    ageMinutes: 60,
    rejectionReason: "KTP name does not match the registered store owner.",
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
    ageMinutes: 120,
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
    ageMinutes: 180,
  },
];
