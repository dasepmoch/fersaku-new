import { orders } from "@/lib/mock-data";
import type { SellerCustomer } from "./contracts";

const ORDER_COUNTS = [12, 8, 5, 3, 9, 6, 4, 11, 2, 7, 5, 3, 8];
const SPENT_AMOUNTS = [
  948000, 732000, 547000, 299000, 412000, 680000, 255000, 1_120_000, 188000,
  503000, 367000, 921000, 144000,
];

export function demoCustomers(): SellerCustomer[] {
  return orders.map((order, index) => {
    const orderCount = ORDER_COUNTS[index % ORDER_COUNTS.length];
    const spent = SPENT_AMOUNTS[index % SPENT_AMOUNTS.length];
    return {
      ...order,
      orders: orderCount,
      spent,
      avgOrder: Math.round(spent / Math.max(1, orderCount)),
      productCount: Math.min(4, orderCount),
      firstSeenDisplay: "18 Mar 2026",
      marketingConsentLabel: "Subscribed during checkout • 18 Mar 2026",
      noteBody: "",
      noteVersion: 0,
      history: [
        {
          id: order.id,
          date: order.date,
          avatar: order.avatar,
          customer: order.customer,
          email: order.email,
          product: order.product,
          status: order.status,
          amount: order.amount,
        },
      ],
    };
  });
}
