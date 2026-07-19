import type { SellerRevenuePoint } from "./contracts";

export function demoSellerRevenue(): SellerRevenuePoint[] {
  return [
    { day: "Sen", revenue: 2_100_000, orders: 24 },
    { day: "Sel", revenue: 2_800_000, orders: 31 },
    { day: "Rab", revenue: 2_400_000, orders: 28 },
    { day: "Kam", revenue: 4_100_000, orders: 43 },
    { day: "Jum", revenue: 3_600_000, orders: 39 },
    { day: "Sab", revenue: 5_200_000, orders: 57 },
    { day: "Min", revenue: 4_700_000, orders: 51 },
  ];
}
