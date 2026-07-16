export type Dispute = {
  id: string;
  order: string;
  buyer: string;
  merchant: string;
  reason: string;
  amount: string;
  funds: string;
  status: string;
  age: string;
  evidence: number;
};

export const disputeSeed: Dispute[] = [
  {
    id: "DSP-24071",
    order: "FRS-240712-1848",
    buyer: "Nadia Putri",
    merchant: "Asep AI Tools",
    reason: "File rusak / tidak dapat dibuka",
    amount: "Rp129.000",
    funds: "Held",
    status: "Evidence review",
    age: "18m",
    evidence: 3,
  },
  {
    id: "DSP-24066",
    order: "FRS-240711-1721",
    buyer: "Rizky Hidayat",
    merchant: "DesignKit Studio",
    reason: "Produk tidak sesuai deskripsi",
    amount: "Rp249.000",
    funds: "Held",
    status: "Seller response",
    age: "2h",
    evidence: 5,
  },
  {
    id: "DSP-24052",
    order: "FRS-240710-1604",
    buyer: "Dimas Ardi",
    merchant: "Prompt Factory ID",
    reason: "Delivery kosong",
    amount: "Rp79.000",
    funds: "Available",
    status: "New",
    age: "5h",
    evidence: 2,
  },
  {
    id: "DSP-24041",
    order: "FRS-240709-1422",
    buyer: "Sinta Maharani",
    merchant: "Digital Supply ID",
    reason: "Akses link expired",
    amount: "Rp99.000",
    funds: "Held",
    status: "Evidence review",
    age: "1d",
    evidence: 4,
  },
  {
    id: "DSP-24033",
    order: "FRS-240708-1109",
    buyer: "Fajar Nugroho",
    merchant: "KodeKita",
    reason: "Kode stok invalid",
    amount: "Rp159.000",
    funds: "Held",
    status: "Seller response",
    age: "2d",
    evidence: 6,
  },
  {
    id: "DSP-24021",
    order: "FRS-240707-0931",
    buyer: "Laras Ayu",
    merchant: "NotionKita",
    reason: "Refund request partial",
    amount: "Rp49.000",
    funds: "Released",
    status: "Resolved",
    age: "3d",
    evidence: 2,
  },
];
