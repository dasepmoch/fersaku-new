import { orders } from "@/lib/mock-data";
import type { SellerCustomer } from "./contracts";

const ORDER_COUNTS = [12, 8, 5, 3, 9, 6, 4, 11, 2, 7, 5, 3, 8];
const SPENT_AMOUNTS = [
  948000, 732000, 547000, 299000, 412000, 680000, 255000, 1_120_000, 188000,
  503000, 367000, 921000, 144000,
];

export function demoCustomers(): SellerCustomer[] {
  return orders.map((order, index) => ({
    ...order,
    orders: ORDER_COUNTS[index % ORDER_COUNTS.length],
    spent: SPENT_AMOUNTS[index % SPENT_AMOUNTS.length],
  }));
}
