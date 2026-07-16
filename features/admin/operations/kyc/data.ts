export type ApiKycApplicant = {
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
