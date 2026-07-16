export type Discrepancy = {
  id: string;
  providerRef: string;
  order: string;
  provider: string;
  internal: string;
  amount: string;
  difference: string;
  age: string;
  severity: string;
  status: string;
};

export const discrepancySeed: Discrepancy[] = [
  {
    id: "REC-9281",
    providerRef: "DKT-99281",
    order: "FRS-240712-1902",
    provider: "PAID",
    internal: "PENDING",
    amount: "Rp129.000",
    difference: "+Rp129.000",
    age: "6m",
    severity: "Critical",
    status: "Open",
  },
  {
    id: "REC-9272",
    providerRef: "DKT-99142",
    order: "FRS-240712-1874",
    provider: "PAID",
    internal: "PAID",
    amount: "Rp79.000",
    difference: "Fee Rp700",
    age: "18m",
    severity: "Medium",
    status: "Review",
  },
  {
    id: "REC-9241",
    providerRef: "XND-82114",
    order: "WD-120724",
    provider: "COMPLETED",
    internal: "PROCESSING",
    amount: "Rp5.000.000",
    difference: "Rp5.000.000",
    age: "42m",
    severity: "High",
    status: "Open",
  },
  {
    id: "REC-9230",
    providerRef: "DKT-99011",
    order: "FRS-240712-1801",
    provider: "PAID",
    internal: "PAID",
    amount: "Rp49.000",
    difference: "Fee Rp450",
    age: "1h",
    severity: "Low",
    status: "Review",
  },
  {
    id: "REC-9218",
    providerRef: "XND-81990",
    order: "WD-120701",
    provider: "COMPLETED",
    internal: "COMPLETED",
    amount: "Rp2.500.000",
    difference: "Rp0",
    age: "2h",
    severity: "Low",
    status: "Resolved",
  },
  {
    id: "REC-9204",
    providerRef: "DKT-98840",
    order: "FRS-240711-1650",
    provider: "PAID",
    internal: "PENDING",
    amount: "Rp199.000",
    difference: "+Rp199.000",
    age: "4h",
    severity: "Critical",
    status: "Open",
  },
];
