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
import { useMemo, useState } from "react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { SectionHead } from "@/shared/ui/section-head";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { useSellerStoreId } from "@/shared/seller/current-store";
import {
  useActivateSellerCoupon,
  useCreateSellerCoupon,
  useSellerCoupons,
} from "@/features/seller/coupons/hooks";
import {
  computeCouponListMetrics,
  parseCouponEndsAtInput,
} from "@/features/seller/coupons/mappers";
import { demoCoupons } from "@/features/seller/coupons/mock";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";

function Coupons() {
  const storeId = useSellerStoreId();
  const { data: items } = useSellerCoupons(storeId);
  const coupons = items ?? demoCoupons(storeId || "demo");
  const metrics = useMemo(() => computeCouponListMetrics(coupons), [coupons]);
  const { pageRows, pagination } = useClientPagination(coupons);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat
          label="Kupon aktif"
          value={String(metrics.activeCount)}
          note={`dari ${metrics.totalCount} kupon`}
        />
        <MiniStat
          label="Pesanan dengan kupon"
          value={String(metrics.ordersWithCoupon)}
          note="total penggunaan server"
        />
        <MiniStat
          label="Total diskon"
          value={metrics.totalDiscountLabel}
          note="bulan ini"
        />
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
                <tr key={c.id || c.code} className="hairline border-t text-xs">
                  <td className="px-5 py-4">
                    <span className="rounded-lg border border-dashed border-[#173f2c]/30 bg-[#eff3e9] px-3 py-2 font-mono font-bold">
                      {c.code}
                    </span>
                  </td>
                  <td className="font-extrabold">{c.discountLabel}</td>
                  <td>{c.usageLabel}</td>
                  <td>{c.endsAtLabel}</td>
                  <td>
                    <Status status={c.status} />
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
  const storeId = useSellerStoreId();
  const createMutation = useCreateSellerCoupon(storeId);
  const activateMutation = useActivateSellerCoupon(storeId);
  const [type, setType] = useState("percentage");
  const [code, setCode] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [scopeLabel, setScopeLabel] = useState("Semua produk");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const previewCode = code.trim().toUpperCase() || "LAUNCH20";
  const previewDiscount =
    type === "percentage"
      ? `${discountValue.trim() || "20"}% off untuk semua produk`
      : `Rp${(discountValue.trim() || "50.000").replace(/\./g, "")} off untuk semua produk`;

  const parseIntLoose = (raw: string): number | undefined => {
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) return undefined;
    const n = Number(digits);
    return Number.isSafeInteger(n) ? n : undefined;
  };

  const onSaveAndActivate = () => {
    if (!storeId || createMutation.isPending || activateMutation.isPending) {
      return;
    }
    setSubmitError(null);
    const value = parseIntLoose(discountValue);
    if (!code.trim()) {
      setSubmitError("Kode wajib diisi");
      return;
    }
    if (value == null || value <= 0) {
      setSubmitError("Nilai diskon tidak valid");
      return;
    }
    const maxTotalUses = parseIntLoose(usageLimit);
    const minMerchandise = parseIntLoose(minOrder);
    const ends = parseCouponEndsAtInput(endsAt);

    createMutation.mutate(
      {
        code: code.trim(),
        discountKind: type === "fixed" ? "fixed" : "percentage",
        discountValue: value,
        maxTotalUses,
        minMerchandise,
        endsAt: ends,
        scope:
          scopeLabel === "Produk tertentu"
            ? "SELECTED_PRODUCTS"
            : "ALL_PRODUCTS",
        idempotencyKey: createIdempotencyKey(),
      },
      {
        onSuccess: (created) => {
          activateMutation.mutate(created.id, {
            onError: () => {
              setSubmitError("Kupon disimpan; aktivasi gagal");
            },
          });
        },
        onError: () => {
          setSubmitError("Gagal menyimpan kupon");
        },
      },
    );
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${sellerCard} p-5 sm:p-7`}>
        <FormGroup
          label="Kode kupon"
          desc="Kode yang dimasukkan pembeli saat checkout."
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Input
              label="Kode"
              placeholder="LAUNCH20"
              value={code}
              onChange={setCode}
            />
            <button
              type="button"
              className="hairline mt-5 h-12 rounded-xl border bg-white px-4 text-[10px] font-bold"
              onClick={() => {
                const gen = `SAVE${Math.floor(1000 + Math.random() * 9000)}`;
                setCode(gen);
              }}
            >
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
                type="button"
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
            value={discountValue}
            onChange={setDiscountValue}
          />
        </FormGroup>
        <FormGroup
          label="Batas penggunaan"
          desc="Batasi masa berlaku dan jumlah pemakaian."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Usage limit"
              placeholder="250"
              value={usageLimit}
              onChange={setUsageLimit}
            />
            <Input
              label="Tanggal berakhir"
              placeholder="31 Jul 2026"
              value={endsAt}
              onChange={setEndsAt}
            />
            <Input
              label="Minimum order"
              placeholder="0"
              prefix="Rp"
              value={minOrder}
              onChange={setMinOrder}
            />
            <Select
              label="Berlaku untuk"
              options={["Semua produk", "Produk tertentu"]}
              value={scopeLabel}
              onChange={setScopeLabel}
            />
          </div>
        </FormGroup>
      </section>
      <aside>
        <div className={`${sellerCard} sticky top-28 p-5`}>
          <Gift className="size-5 text-[#315d47]" />
          <h3 className="mt-5 text-sm font-extrabold">Preview kupon</h3>
          <div className="mt-4 rounded-2xl border border-dashed border-[#173f2c]/25 bg-[#eff3e9] p-5 text-center">
            <span className="font-mono text-xl font-extrabold">
              {previewCode}
            </span>
            <p className="mt-2 text-[10px] text-[#6d7972]">{previewDiscount}</p>
          </div>
          {submitError ? (
            <p className="mt-3 text-[10px] font-bold text-[#a7573e]">
              {submitError}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-5 h-11 w-full rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white disabled:opacity-60"
            disabled={
              createMutation.isPending ||
              activateMutation.isPending ||
              !storeId
            }
            onClick={onSaveAndActivate}
          >
            Simpan & aktifkan kupon
          </button>
        </div>
      </aside>
    </div>
  );
}
export { Coupons as SellerCouponsScreen, CouponForm as SellerCouponFormScreen };
