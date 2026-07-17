"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Download,
  KeyRound,
  Link2,
  LockKeyhole,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { ProductArt } from "@/components/product-art";
import {
  useCreateSellerProductMutation,
  usePublishSellerProductMutation,
} from "@/features/catalog/hooks";
import type {
  ProductDeliveryOption,
  ProductFieldError,
  ProductFormField,
} from "@/features/catalog/contracts";
import {
  defaultProductGlyph,
  mapProductCommandThrown,
  normalizeProductSlug,
  parseProductPriceIdr,
} from "@/features/catalog/mappers";
import { getDomainSource } from "@/shared/data/domain-source";
import {
  createIdempotencyIntentHolder,
  createPendingDedupe,
} from "@/shared/query/mutation-policy";
import { useSellerStoreId } from "@/shared/seller/current-store";
import { FormGroup, Input, sellerCard } from "./pieces";

function sellerCatalogIsApi(): boolean {
  try {
    return getDomainSource("sellerCatalog") === "api";
  } catch {
    return false;
  }
}

function fieldMsg(
  errors: ProductFieldError[],
  field: ProductFormField,
): string | null {
  return errors.find((e) => e.field === field)?.message ?? null;
}

export function ProductForm() {
  const router = useRouter();
  const storeId = useSellerStoreId();
  const apiMode = sellerCatalogIsApi();
  const createMutation = useCreateSellerProductMutation();
  const publishMutation = usePublishSellerProductMutation();

  const [type, setType] = useState<ProductDeliveryOption>("download");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [priceText, setPriceText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ProductFieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const createIdemRef = useRef(createIdempotencyIntentHolder());
  const publishIdemRef = useRef(createIdempotencyIntentHolder());
  const pendingRef = useRef(createPendingDedupe());

  const previewTitle = title.trim() || "Produk tanpa judul";
  const priceNum = parseProductPriceIdr(priceText);
  const previewPrice =
    priceNum === null ? "Rp0" : `Rp${priceNum.toLocaleString("id-ID")}`;

  const setDelivery = (id: string) => {
    if (
      id === "download" ||
      id === "link" ||
      id === "code" ||
      id === "credentials"
    ) {
      setType(id);
    }
  };

  const applyErrors = (err: unknown) => {
    const mapped = mapProductCommandThrown(err);
    if (mapped.kind === "field_errors") {
      setFieldErrors(mapped.fields);
      return;
    }
    setFieldErrors([
      {
        field: "generic",
        message:
          mapped.kind === "conflict"
            ? mapped.message
            : mapped.message || "Gagal menyimpan produk.",
      },
    ]);
  };

  const buildCreateInput = (idempotencyKey: string) => {
    const price = parseProductPriceIdr(priceText) ?? 0;
    const normalizedSlug = normalizeProductSlug(slug);
    return {
      storeId,
      title: title.trim(),
      ...(normalizedSlug ? { slug: normalizedSlug } : {}),
      description: description.trim(),
      short: description.trim().slice(0, 280),
      price,
      delivery: type,
      palette: "#e9ff9b",
      glyph: defaultProductGlyph(title),
      idempotencyKey,
    };
  };

  const clientValidate = (): ProductFieldError[] => {
    const errs: ProductFieldError[] = [];
    if (!title.trim()) {
      errs.push({ field: "title", message: "Nama produk wajib diisi." });
    }
    const price = parseProductPriceIdr(priceText);
    if (price === null) {
      errs.push({
        field: "price",
        message: "Harga harus bilangan bulat Rupiah.",
      });
    }
    return errs;
  };

  const saveDraft = async () => {
    if (!apiMode) return;
    if (!pendingRef.current.tryBegin()) return;
    setSubmitting(true);
    setFieldErrors([]);
    const local = clientValidate();
    if (local.length) {
      setFieldErrors(local);
      pendingRef.current.end();
      setSubmitting(false);
      return;
    }
    try {
      const body = buildCreateInput(createIdemRef.current.getKey());
      createIdemRef.current.bindBody(body);
      const product = await createMutation.mutateAsync(body);
      createIdemRef.current.reset();
      router.push(`/dashboard/products/${product.id}`);
    } catch (err) {
      applyErrors(err);
    } finally {
      pendingRef.current.end();
      setSubmitting(false);
    }
  };

  const saveAndPublish = async () => {
    if (!apiMode) return;
    if (!pendingRef.current.tryBegin()) return;
    setSubmitting(true);
    setFieldErrors([]);
    const local = clientValidate();
    if (local.length) {
      setFieldErrors(local);
      pendingRef.current.end();
      setSubmitting(false);
      return;
    }
    try {
      const body = buildCreateInput(createIdemRef.current.getKey());
      createIdemRef.current.bindBody(body);
      const product = await createMutation.mutateAsync(body);
      createIdemRef.current.reset();
      const publishKey = publishIdemRef.current.getKey();
      publishIdemRef.current.bindBody({ productId: product.id });
      await publishMutation.mutateAsync({
        storeId,
        productId: product.id,
        idempotencyKey: publishKey,
        reason: "seller_product_catalog_publish",
      });
      publishIdemRef.current.reset();
      router.push(`/dashboard/products/${product.id}`);
    } catch (err) {
      applyErrors(err);
    } finally {
      pendingRef.current.end();
      setSubmitting(false);
    }
  };

  const genericError = fieldMsg(fieldErrors, "generic");

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${sellerCard} p-5 sm:p-7`}>
        <div className="grid gap-6">
          <FormGroup
            label="Informasi produk"
            desc="Informasi utama yang dilihat pembeli."
          >
            <div className="grid gap-4">
              {apiMode ? (
                <>
                  <Input
                    label="Nama produk"
                    placeholder="Contoh: AI Prompt Pack"
                    value={title}
                    onChange={setTitle}
                    error={fieldMsg(fieldErrors, "title")}
                  />
                  <Input
                    label="Slug"
                    placeholder="ai-prompt-pack"
                    prefix="fersaku.id/@asep/"
                    value={slug}
                    onChange={(v) => setSlug(normalizeProductSlug(v))}
                    error={fieldMsg(fieldErrors, "slug")}
                  />
                  <label className="grid gap-2 text-xs font-bold">
                    Deskripsi
                    <textarea
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="ring-focus hairline resize-none rounded-xl border bg-white p-4 text-sm font-normal outline-none"
                      placeholder="Ceritakan manfaat produkmu..."
                    />
                    {fieldMsg(fieldErrors, "description") ? (
                      <span className="text-[9px] font-semibold text-[#a44f3b]">
                        {fieldMsg(fieldErrors, "description")}
                      </span>
                    ) : null}
                  </label>
                </>
              ) : (
                <>
                  <Input
                    label="Nama produk"
                    placeholder="Contoh: AI Prompt Pack"
                  />
                  <Input
                    label="Slug"
                    placeholder="ai-prompt-pack"
                    prefix="fersaku.id/@asep/"
                  />
                  <label className="grid gap-2 text-xs font-bold">
                    Deskripsi
                    <textarea
                      rows={5}
                      className="ring-focus hairline resize-none rounded-xl border bg-white p-4 text-sm font-normal outline-none"
                      placeholder="Ceritakan manfaat produkmu..."
                    />
                  </label>
                </>
              )}
            </div>
          </FormGroup>
          <FormGroup
            label="Jenis pengiriman"
            desc="Pilih bagaimana produk diberikan setelah pembayaran."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["download", Download, "File download"],
                ["link", Link2, "Protected link"],
                ["code", KeyRound, "Stock code"],
                ["credentials", Boxes, "Akun / credentials"],
              ].map(([id, Icon, label]) => (
                <button
                  key={id as string}
                  type="button"
                  onClick={() => setDelivery(id as string)}
                  className={`rounded-2xl border p-4 text-left transition ${type === id ? "border-[#173f2c] bg-[#eef3e9] ring-1 ring-[#173f2c]" : "hairline bg-white hover:bg-[#f6f6f2]"}`}
                >
                  <Icon className="size-5" />
                  <b className="mt-5 block text-xs">{label as string}</b>
                </button>
              ))}
            </div>
            {fieldMsg(fieldErrors, "type") ? (
              <p className="mt-2 text-[9px] font-semibold text-[#a44f3b]">
                {fieldMsg(fieldErrors, "type")}
              </p>
            ) : null}
            {type === "download" && (
              <div className="mt-4 rounded-2xl border border-dashed border-[#173f2c]/20 bg-[#f7f7f3] p-7 text-center">
                <Upload className="mx-auto size-6 text-[#65736b]" />
                <p className="mt-3 text-xs font-extrabold">
                  Tarik file ke sini atau pilih dari perangkat
                </p>
                <p className="mt-1 text-[10px] text-[#87918b]">
                  ZIP, PDF, PNG hingga 2 GB
                </p>
                <button
                  type="button"
                  className="hairline mt-4 rounded-lg border bg-white px-3 py-2 text-[10px] font-bold"
                >
                  Pilih file
                </button>
              </div>
            )}
            {type === "link" && (
              <div className="hairline mt-4 grid gap-4 rounded-2xl border bg-[#f7f7f3] p-5">
                <Input
                  label="Protected delivery URL"
                  placeholder="https://notion.so/your-template"
                />
                <p className="text-[8px] leading-4 text-[#718078]">
                  URL asli hanya diberikan setelah pembayaran dan tidak tampil
                  di storefront.
                </p>
              </div>
            )}
            {type === "code" && (
              <div className="hairline mt-4 rounded-2xl border bg-[#f7f7f3] p-5">
                <label className="grid gap-2 text-[9px] font-bold">
                  Paste stock codes
                  <textarea
                    rows={5}
                    placeholder={"CODE-001\nCODE-002\nCODE-003"}
                    className="hairline rounded-xl border bg-white p-3 font-mono text-[9px] font-normal outline-none"
                  />
                </label>
                <p className="mt-3 text-[8px] text-[#718078]">
                  Satu kode per baris. Setiap paid order mengonsumsi tepat satu
                  kode secara atomik.
                </p>
              </div>
            )}
            {type === "credentials" && (
              <div className="mt-4 rounded-2xl border border-[#cde0a9] bg-[#eff6df] p-5">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="size-4 text-[#486027]" />
                  <div>
                    <b className="block text-[10px]">
                      Structured credential inventory
                    </b>
                    <p className="mt-1 text-[8px] leading-4 text-[#687653]">
                      Buat field seperti username, password, PIN, team link,
                      atau expiry. Secret dienkripsi dan hanya dibuka saat
                      fulfillment.
                    </p>
                  </div>
                </div>
                <code className="mt-4 block rounded-xl bg-[#173f2c] p-3 text-[9px] font-bold text-[#d7ff64]">
                  username|password|team_link
                </code>
                <Link
                  href="/dashboard/inventory/prod_account"
                  className="mt-4 inline-flex text-[9px] font-extrabold text-[#315d47]"
                >
                  Buka schema & inventory editor →
                </Link>
              </div>
            )}
          </FormGroup>
          <FormGroup label="Harga" desc="Gunakan nominal dalam Rupiah.">
            {apiMode ? (
              <Input
                label="Harga produk"
                placeholder="79.000"
                prefix="Rp"
                value={priceText}
                onChange={setPriceText}
                error={fieldMsg(fieldErrors, "price")}
              />
            ) : (
              <Input label="Harga produk" placeholder="79.000" prefix="Rp" />
            )}
          </FormGroup>
          {genericError ? (
            <p className="text-[10px] font-semibold text-[#a44f3b]">
              {genericError}
            </p>
          ) : null}
        </div>
      </section>
      <aside>
        <div className={`${sellerCard} sticky top-28 p-5`}>
          <p className="text-[10px] font-extrabold tracking-wider text-[#7b8780] uppercase">
            Preview
          </p>
          <ProductArt
            palette="#e9ff9b"
            glyph="AI"
            className="mt-4 aspect-[1.25]"
          />
          <h3 className="mt-4 text-sm font-extrabold">{previewTitle}</h3>
          <p className="mt-1 text-xs text-[#7a867f]">{previewPrice}</p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              disabled={apiMode && submitting}
              onClick={apiMode ? () => void saveAndPublish() : undefined}
              className="h-11 rounded-xl bg-[#173f2c] text-xs font-extrabold text-white disabled:opacity-60"
            >
              Simpan & publikasikan
            </button>
            <button
              type="button"
              disabled={apiMode && submitting}
              onClick={apiMode ? () => void saveDraft() : undefined}
              className="hairline h-11 rounded-xl border bg-white text-xs font-bold disabled:opacity-60"
            >
              Simpan sebagai draft
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
