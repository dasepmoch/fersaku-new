export type WebhookRow = {
  id: string;
  source: string;
  event: string;
  order: string;
  http: string;
  providerStatus: string;
  orderStatus: string;
  age: string;
  attempts: number;
};

export const initialWebhooks: WebhookRow[] = [
  {
    id: "whd_9244",
    source: "Duitku",
    event: "payment.qris.paid",
    order: "FRS-240712-1902",
    http: "Timeout",
    providerStatus: "PAID",
    orderStatus: "Pending",
    age: "3m",
    attempts: 4,
  },
  {
    id: "whd_9241",
    source: "Duitku",
    event: "payment.qris.paid",
    order: "FRS-240712-1848",
    http: "200",
    providerStatus: "PAID",
    orderStatus: "Fulfilled",
    age: "7m",
    attempts: 1,
  },
  {
    id: "whd_9231",
    source: "Xendit",
    event: "withdrawal.completed",
    order: "WD-120724",
    http: "200",
    providerStatus: "COMPLETED",
    orderStatus: "Completed",
    age: "12m",
    attempts: 1,
  },
  {
    id: "whd_9227",
    source: "Seller",
    event: "delivery.fulfilled",
    order: "FRS-240712-1811",
    http: "500",
    providerStatus: "DELIVERED",
    orderStatus: "Fulfilled",
    age: "18m",
    attempts: 3,
  },
  {
    id: "whd_9224",
    source: "Duitku",
    event: "payment.qris.paid",
    order: "FRS-240712-1804",
    http: "401",
    providerStatus: "PAID",
    orderStatus: "Pending",
    age: "24m",
    attempts: 5,
  },
  {
    id: "whd_9218",
    source: "Xendit",
    event: "withdrawal.failed",
    order: "WD-120690",
    http: "200",
    providerStatus: "FAILED",
    orderStatus: "Pending",
    age: "36m",
    attempts: 2,
  },
  {
    id: "whd_9211",
    source: "Seller",
    event: "delivery.failed",
    order: "FRS-240712-1790",
    http: "500",
    providerStatus: "FAILED",
    orderStatus: "Pending",
    age: "48m",
    attempts: 4,
  },
];
