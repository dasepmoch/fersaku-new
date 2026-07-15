"use client";

import Link from "next/link";
import { ArrowRight, Gift, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const card = "rounded-[22px] border hairline bg-[#fbfaf7] shadow-card";
function Coupons() {
  const coupons = [
    ["LAUNCH20", "20%", "128 / 250", "20 Jul 2026", "Active"],
    ["HEMAT50K", "Rp50.000", "42 / 100", "31 Jul 2026", "Active"],
    ["RAMADAN", "15%", "304 / 300", "30 Mar 2026", "Expired"],
    ["WELCOME10", "10%", "88 / 500", "15 Aug 2026", "Active"],
    ["FLASH30", "30%", "19 / 50", "18 Jul 2026", "Active"],
    ["VIP100K", "Rp100.000", "7 / 25", "30 Sep 2026", "Active"],
    ["BUNDLING", "12%", "54 / 200", "12 Aug 2026", "Active"],
    ["STUDENT15", "15%", "61 / 150", "1 Sep 2026", "Active"],
    ["EARLYBIRD", "25%", "210 / 200", "1 May 2026", "Expired"],
    ["REFER20", "20%", "33 / 100", "31 Dec 2026", "Active"],
    ["WEEKEND", "Rp25.000", "14 / 80", "20 Jul 2026", "Active"],
    ["CLEAROUT", "40%", "99 / 100", "5 Jul 2026", "Expired"],
  ];
  const { pageRows, pagination } = useClientPagination(coupons);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Kupon aktif" value="2" note="dari 3 kupon" />
        <MiniStat
          label="Pesanan dengan kupon"
          value="170"
          note="35% dari total"
        />
        <MiniStat label="Total diskon" value="Rp4,2jt" note="bulan ini" />
      </div>
      <section className={`${card} mt-4 overflow-hidden`}>
        <SectionHead title="Semua kupon" desc="Kode promo untuk tokomu" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead>
              <tr className="bg-[#f3f4ef] text-[9px] tracking-wider text-[#7f8a83] uppercase">
                <th className="px-5 py-3">Kode</th>
                <th>Diskon</th>
                <th>Penggunaan</th>
                <th>Berakhir</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => (
                <tr key={c[0]} className="hairline border-t text-xs">
                  <td className="px-5 py-4">
                    <span className="rounded-lg border border-dashed border-[#173f2c]/30 bg-[#eff3e9] px-3 py-2 font-mono font-bold">
                      {c[0]}
                    </span>
                  </td>
                  <td className="font-extrabold">{c[1]}</td>
                  <td>{c[2]}</td>
                  <td>{c[3]}</td>
                  <td>
                    <Status status={c[4]} />
                  </td>
                  <td>
                    <MoreHorizontal className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
    </>
  );
}
function CouponForm() {
  const [type, setType] = useState("percentage");
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} p-5 sm:p-7`}>
        <FormGroup
          label="Kode kupon"
          desc="Kode yang dimasukkan pembeli saat checkout."
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Input label="Kode" placeholder="LAUNCH20" />
            <button className="hairline mt-5 h-12 rounded-xl border bg-white px-4 text-[10px] font-bold">
              Generate code
            </button>
          </div>
        </FormGroup>
        <FormGroup
          label="Nilai diskon"
          desc="Pilih persentase atau potongan tetap."
        >
          <div className="mb-4 grid grid-cols-2 gap-2">
            {[
              ["percentage", "Persentase"],
              ["fixed", "Nominal tetap"],
            ].map((x) => (
              <button
                key={x[0]}
                onClick={() => setType(x[0])}
                className={`rounded-xl border p-3 text-[10px] font-bold ${type === x[0] ? "border-[#173f2c] bg-[#eef3e9]" : "hairline bg-white"}`}
              >
                {x[1]}
              </button>
            ))}
          </div>
          <Input
            label={type === "percentage" ? "Diskon" : "Potongan"}
            placeholder={type === "percentage" ? "20" : "50.000"}
            prefix={type === "fixed" ? "Rp" : undefined}
          />
        </FormGroup>
        <FormGroup
          label="Batas penggunaan"
          desc="Batasi masa berlaku dan jumlah pemakaian."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Usage limit" placeholder="250" />
            <Input label="Tanggal berakhir" placeholder="31 Jul 2026" />
            <Input label="Minimum order" placeholder="0" prefix="Rp" />
            <Select
              label="Berlaku untuk"
              options={["Semua produk", "Produk tertentu"]}
            />
          </div>
        </FormGroup>
      </section>
      <aside>
        <div className={`${card} sticky top-28 p-5`}>
          <Gift className="size-5 text-[#315d47]" />
          <h3 className="mt-5 text-sm font-extrabold">Preview kupon</h3>
          <div className="mt-4 rounded-2xl border border-dashed border-[#173f2c]/25 bg-[#eff3e9] p-5 text-center">
            <span className="font-mono text-xl font-extrabold">LAUNCH20</span>
            <p className="mt-2 text-[10px] text-[#6d7972]">
              20% off untuk semua produk
            </p>
          </div>
          <button className="mt-5 h-11 w-full rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white">
            Simpan & aktifkan kupon
          </button>
        </div>
      </aside>
    </div>
  );
}
function Status({ status }: { status: string }) {
  const positive = ["Paid", "Active", "Completed", "Delivered"].includes(
    status,
  );
  const pending = ["Pending", "Processing"].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-extrabold ${positive ? "bg-[#e5f5e6] text-[#2e714f]" : pending ? "bg-[#fff4ce] text-[#8a6c22]" : "bg-[#ffebe3] text-[#a7573e]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
function MiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-[9px] font-extrabold tracking-wider text-[#7d8982] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-[9px] text-[#7d8982]">{note}</p>
    </div>
  );
}
function SectionHead({
  title,
  desc,
  link,
}: {
  title: string;
  desc: string;
  link?: string;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <div>
        <h2 className="text-sm font-extrabold">{title}</h2>
        <p className="mt-1 text-[10px] text-[#7d8982]">{desc}</p>
      </div>
      {link && (
        <Link
          href="/dashboard/orders"
          className="text-[10px] font-extrabold text-[#356549]"
        >
          {link} <ArrowRight className="ml-1 inline size-3" />
        </Link>
      )}
    </div>
  );
}
function FormGroup({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hairline border-b pb-7 last:border-0">
      <div className="mb-5">
        <h2 className="text-sm font-extrabold">{label}</h2>
        <p className="mt-1 text-[10px] text-[#7b8780]">{desc}</p>
      </div>
      {children}
    </div>
  );
}
function Input({
  label,
  placeholder,
  prefix,
  value,
}: {
  label: string;
  placeholder?: string;
  prefix?: string;
  value?: string;
}) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <div className="hairline flex h-12 overflow-hidden rounded-xl border bg-white">
        {prefix && (
          <span className="hairline flex items-center border-r bg-[#f3f4ef] px-3 text-[10px] font-semibold text-[#77837b]">
            {prefix}
          </span>
        )}
        <input
          defaultValue={value}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-4 text-sm font-normal outline-none"
        />
      </div>
    </label>
  );
}
function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <select className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none">
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}

export { Coupons as SellerCouponsScreen, CouponForm as SellerCouponFormScreen };
