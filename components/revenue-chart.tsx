"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { revenueData } from "@/lib/mock-data";
import { compactRupiah } from "@/lib/utils";

export function RevenueChart() {
  return (
    <div className="h-[245px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={revenueData}
          margin={{ top: 10, right: 4, left: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#286a49" stopOpacity={0.28} />
              <stop offset="1" stopColor="#286a49" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(23,35,29,.07)" />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#7a867f", fontWeight: 700 }}
            dy={8}
          />
          <Tooltip
            formatter={(v) => [compactRupiah(Number(v)), "Pendapatan"]}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid rgba(23,35,29,.1)",
              boxShadow: "0 10px 30px rgba(23,35,29,.1)",
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#1d5c3e"
            strokeWidth={2.5}
            fill="url(#revenue)"
            activeDot={{
              r: 5,
              fill: "#d7ff64",
              stroke: "#173f2c",
              strokeWidth: 3,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
