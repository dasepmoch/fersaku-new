import { orders as fixtureOrders } from "@/lib/mock-data";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import type { SellerOrder } from "./contracts";

export function demoOrders(): SellerOrder[] {
  return fixtureOrders.map((order) => ({
    ...order,
    storeId: DEMO_STORE_ID,
    status: order.status as SellerOrder["status"],
  }));
}
