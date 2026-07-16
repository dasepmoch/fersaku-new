"use client";

import {
  sellerCard,
  Status,
  MiniStat,
  FormGroup,
  Input,
  Select,
} from "@/features/seller/ui";

import { Gift, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { SectionHead } from "@/shared/ui/section-head";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

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
      <section className={`${sellerCard} mt-4 overflow-hidden`}>
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
      <section className={`${sellerCard} p-5 sm:p-7`}>
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
        <div className={`${sellerCard} sticky top-28 p-5`}>
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
export { Coupons as SellerCouponsScreen, CouponForm as SellerCouponFormScreen };
