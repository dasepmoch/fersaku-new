import { orders as fixtureOrders } from "@/lib/mock-data";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import type { SellerOrder } from "./contracts";

export function demoOrders(): SellerOrder[] {
  return fixtureOrders.map((order) => ({
    ...order,
    storeId: DEMO_STORE_ID,
    status: order.status as SellerOrder["status"],
    feeIdr: 3070,
    merchantNetIdr: order.amount - 3070,
    payment: {
      method: "QRIS",
      paymentIntent: "qris_2Yc91p",
      provider: "Xendit",
      status: order.status as string,
    },
    delivery:
      order.status === "Paid" || order.status === "Delivered"
        ? {
            fulfilled: true,
            status: "ACTIVE",
            accessCount: 1,
            maxAccesses: 5,
            summary: `Link download dibuat dan dikirim ke ${order.email}. Digunakan 1 dari 5 kali.`,
          }
        : undefined,
    timeline: [
      {
        label: "Pesanan dibuat",
        atDisplay: "12 Jul 2026",
        timeDisplay: "14:32:08",
      },
      {
        label: "QRIS dibuat",
        atDisplay: "12 Jul 2026",
        timeDisplay: "14:32:09",
      },
      {
        label: "Pembayaran terkonfirmasi",
        atDisplay: "12 Jul 2026",
        timeDisplay: "14:33:21",
      },
      {
        label: "Delivery berhasil",
        atDisplay: "12 Jul 2026",
        timeDisplay: "14:33:23",
      },
      {
        label: "Saldo seller dikreditkan",
        atDisplay: "12 Jul 2026",
        timeDisplay: "14:33:23",
      },
    ],
  }));
}
