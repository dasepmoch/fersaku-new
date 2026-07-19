"use client";

import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProductArt } from "@/components/product-art";
import {
  useArchiveSellerProductMutation,
  usePatchSellerProductMutation,
  usePublishSellerProductMutation,
  useSellerProduct,
} from "@/features/catalog/hooks";
import type {
  ProductFieldError,
  ProductFormField,
} from "@/features/catalog/contracts";
import {
  mapProductCommandThrown,
  normalizeProductSlug,
  parseProductPriceIdr,
  productDetailStatusLabel,
} from "@/features/catalog/mappers";
import {
  displayFileName,
  formatObjectSizeBytes,
  formatObjectUpdatedLabel,
  useRunStoreObjectUploadMutation,
  type StoreObjectMeta,
} from "@/features/seller/objects";
import { compactRupiah, rupiah } from "@/lib/utils";
import { getDomainSource } from "@/shared/data/domain-source";
import {
  createIdempotencyIntentHolder,
  createPendingDedupe,
} from "@/shared/query/mutation-policy";
import { useSellerStoreId } from "@/shared/seller/current-store";
import {
  FormGroup,
  Input,
  MiniStat,
  Select,
  Status,
  sellerCard,
} from "./pieces";

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

export function ProductDetail({ id }: { id: string }) {
  const storeId = useSellerStoreId();
  const apiMode = sellerCatalogIsApi();
  const { data: product } = useSellerProduct(storeId, id);
  const publishMutation = usePublishSellerProductMutation();
  const patchMutation = usePatchSellerProductMutation();
  const archiveMutation = useArchiveSellerProductMutation();
  const uploadMutation = useRunStoreObjectUploadMutation();

  const [tab, setTab] = useState("Detail");
  const [archived, setArchived] = useState(false);
  const [updatesEnabled, setUpdatesEnabled] = useState(true);
  const [releases, setReleases] = useState([
    {
      version: "v3.0",
      notes: "20 prompt riset baru dan Notion workspace yang lebih rapi.",
      date: "2 Jul 2026",
      buyers: 428,
    },
    {
      version: "v2.5",
      notes: "Formula prompt untuk image generation dan video.",
      date: "18 Mei 2026",
      buyers: 361,
    },
  ]);
  const [published, setPublished] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [priceText, setPriceText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ProductFieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [deliveryFile, setDeliveryFile] = useState<{
    objectId: string;
    fileName: string;
    sizeBytes?: number;
    updatedAt?: string;
    status: StoreObjectMeta["status"];
  } | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archiveIdemRef = useRef(createIdempotencyIntentHolder());
  const publishIdemRef = useRef(createIdempotencyIntentHolder());
  const pendingRef = useRef(createPendingDedupe());
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Hydrate form fields when product identity changes (render-time adjust).
  if (product && product.id !== hydratedId) {
    setHydratedId(product.id);
    setTitle(product.title);
    setSlug(product.slug);
    setDescription(product.description);
    setPriceText(String(product.price));
    setArchived(product.status === "archived");
  }

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

  /**
   * Delivery-tab “Publish update to existing buyers” is a file/release UI
   * affordance — not catalog publish. Catalog publish uses header save path
   * when status is draft. Keep local release history UX in mock; API mode
   * only toggles feedback without inventing a release endpoint (SEL-230).
   */
  const onReplaceProductFile = async (file: File | null) => {
    if (!file) return;
    if (!apiMode) {
      setDeliveryFile({
        objectId: `mock_local_${Date.now().toString(36)}`,
        fileName: displayFileName(file, "ai-prompt-pack-v3.zip"),
        sizeBytes: file.size,
        updatedAt: new Date().toISOString(),
        status: "READY",
      });
      setUploadFeedback(null);
      return;
    }
    setUploadFeedback(null);
    try {
      const meta = await uploadMutation.mutateAsync({
        storeId,
        purpose: "PRODUCT_FILE",
        file,
      });
      setDeliveryFile({
        objectId: meta.id,
        fileName: displayFileName(file),
        sizeBytes: meta.sizeBytes ?? file.size,
        updatedAt: meta.updatedAt ?? meta.createdAt,
        status: meta.status,
      });
      if (meta.status === "REJECTED") {
        setUploadFeedback(meta.rejectedReason || "File ditolak scanner.");
      } else if (meta.status !== "READY") {
        setUploadFeedback(`Status unggahan: ${meta.status}`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal mengunggah file.";
      setUploadFeedback(message);
    }
  };

  const publishRelease = async () => {
    if (apiMode) {
      setPublished(true);
      timer.current = setTimeout(() => setPublished(false), 2400);
      return;
    }
    try {
      await publishMutation.mutateAsync({
        storeId: storeId,
        productId: id,
        reason: "seller_product_release_publish",
      });
    } catch {
      return;
    }
    const current = Number(releases[0].version.replace("v", ""));
    const version = `v${(current + 0.1).toFixed(1)}`;
    setReleases((old) => [
      {
        version,
        notes:
          "Perbaikan struktur, bonus prompt, dan template workflow terbaru.",
        date: "Baru saja",
        buyers: 428,
      },
      ...old,
    ]);
    setPublished(true);
    timer.current = setTimeout(() => setPublished(false), 2400);
  };

  const saveChanges = async () => {
    if (!apiMode || !product) return;
    if (!pendingRef.current.tryBegin()) return;
    setSubmitting(true);
    setFieldErrors([]);
    const price = parseProductPriceIdr(priceText);
    if (!title.trim()) {
      setFieldErrors([{ field: "title", message: "Nama produk wajib diisi." }]);
      pendingRef.current.end();
      setSubmitting(false);
      return;
    }
    if (price === null) {
      setFieldErrors([
        { field: "price", message: "Harga harus bilangan bulat Rupiah." },
      ]);
      pendingRef.current.end();
      setSubmitting(false);
      return;
    }
    try {
      await patchMutation.mutateAsync({
        storeId,
        productId: id,
        title: title.trim(),
        slug: normalizeProductSlug(slug) || product.slug,
        description: description.trim(),
        price,
      });
      if (product.status === "draft") {
        const key = publishIdemRef.current.getKey();
        publishIdemRef.current.bindBody({ productId: id });
        await publishMutation.mutateAsync({
          storeId,
          productId: id,
          idempotencyKey: key,
          reason: "seller_product_catalog_publish",
        });
        publishIdemRef.current.reset();
      }
      setHydratedId(null);
    } catch (err) {
      applyErrors(err);
    } finally {
      pendingRef.current.end();
      setSubmitting(false);
    }
  };

  const toggleArchive = async () => {
    if (!apiMode) {
      setArchived(!archived);
      return;
    }
    if (archived) return;
    if (!pendingRef.current.tryBegin()) return;
    setSubmitting(true);
    setFieldErrors([]);
    try {
      const key = archiveIdemRef.current.getKey();
      archiveIdemRef.current.bindBody({ productId: id });
      await archiveMutation.mutateAsync({
        storeId,
        productId: id,
        idempotencyKey: key,
        reason: "seller_product_archive",
      });
      archiveIdemRef.current.reset();
      setArchived(true);
      setHydratedId(null);
    } catch (err) {
      applyErrors(err);
    } finally {
      pendingRef.current.end();
      setSubmitting(false);
    }
  };

  if (!product) return null;
  const p = product;
  const statusLabel = productDetailStatusLabel(p.status, archived);
  const genericError = fieldMsg(fieldErrors, "generic");

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${sellerCard} overflow-hidden`}>
        <div className="hairline flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center">
          <ProductArt
            palette={p.palette}
            glyph={p.glyph}
            className="size-20 shrink-0 !rounded-2xl"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold">{p.title}</h2>
              <Status status={statusLabel} />
            </div>
            <p className="mt-1 text-[10px] text-[#7a867f]">
              {p.id} • fersaku.id/@asep/{p.slug}
            </p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Link
              href={`/@asep-ai-tools/${p.slug}`}
              className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold"
            >
              <Eye className="size-3.5" /> Preview
            </Link>
            <button
              type="button"
              disabled={apiMode && submitting}
              onClick={apiMode ? () => void saveChanges() : undefined}
              className="flex h-10 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-[10px] font-extrabold text-white disabled:opacity-60"
            >
              Simpan perubahan
            </button>
          </div>
        </div>
        <div className="hairline flex overflow-x-auto border-b px-5">
          {["Detail", "Delivery", "Pricing", "Checkout", "Analytics"].map(
            (x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTab(x)}
                className={`border-b-2 px-4 py-4 text-[10px] font-extrabold ${tab === x ? "border-[#173f2c]" : "border-transparent text-[#819087]"}`}
              >
                {x}
              </button>
            ),
          )}
        </div>
        <div className="p-5 sm:p-7">
          {genericError ? (
            <p className="mb-4 text-[10px] font-semibold text-[#a44f3b]">
              {genericError}
            </p>
          ) : null}
          {tab === "Analytics" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <MiniStat
                label="Total penjualan"
                value={String(p.sales)}
                note="Sepanjang waktu"
              />
              <MiniStat
                label="Pendapatan"
                value={compactRupiah(p.sales * p.price)}
                note="Gross revenue"
              />
              <MiniStat
                label="Conversion"
                value="9,2%"
                note="Dari 4.652 views"
              />
            </div>
          ) : tab === "Delivery" ? (
            <div>
              <h3 className="text-sm font-extrabold">File delivery</h3>
              <div className="hairline mt-4 flex items-center gap-4 rounded-2xl border bg-white p-4">
                <span className="grid size-11 place-items-center rounded-xl bg-[#edf1e9]">
                  <Download className="size-5" />
                </span>
                <div>
                  <b className="block text-xs">
                    {deliveryFile?.fileName ?? "ai-prompt-pack-v3.zip"}
                  </b>
                  <span className="text-[9px] text-[#7a867f]">
                    {deliveryFile
                      ? `${formatObjectSizeBytes(deliveryFile.sizeBytes)} • Updated ${formatObjectUpdatedLabel(deliveryFile.updatedAt)}`
                      : "48.2 MB • Updated 2 Jul 2026"}
                    {deliveryFile && deliveryFile.status !== "READY"
                      ? ` • ${deliveryFile.status}`
                      : ""}
                  </span>
                  {uploadFeedback ? (
                    <span className="mt-1 block text-[9px] font-semibold text-[#a44f3b]">
                      {uploadFeedback}
                    </span>
                  ) : null}
                </div>
                <input
                  ref={replaceFileInputRef}
                  type="file"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onReplaceProductFile(f);
                  }}
                />
                <button
                  type="button"
                  disabled={uploadMutation.isPending}
                  onClick={() => replaceFileInputRef.current?.click()}
                  className="ml-auto text-[10px] font-bold text-[#315d47] disabled:opacity-60"
                >
                  {uploadMutation.isPending ? "Uploading…" : "Replace file"}
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input label="Download expiry" value="7 days" />
                <Input label="Maximum downloads" value="5" />
              </div>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#f5f5f0] p-4">
                <div>
                  <b className="block text-[10px]">
                    Product updates untuk pembeli lama
                  </b>
                  <span className="mt-1 block text-[8px] leading-4 text-[#718078]">
                    Jika aktif, seller dapat menerbitkan versi baru dan buyer
                    portal akan menampilkan update. Tidak ada notifikasi jika
                    seller tidak menerbitkan versi.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUpdatesEnabled(!updatesEnabled)}
                  className={`relative ml-4 h-6 w-11 shrink-0 rounded-full ${updatesEnabled ? "bg-[#173f2c]" : "bg-[#c9cec9]"}`}
                >
                  <span
                    className={`absolute top-1 size-4 rounded-full bg-white transition ${updatesEnabled ? "left-6" : "left-1"}`}
                  />
                </button>
              </div>
              {updatesEnabled && (
                <div className="hairline mt-4 grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-2">
                  <Input
                    label="Current public version"
                    value={releases[0].version}
                  />
                  <Input
                    label="Release notes URL"
                    value="fersaku.id/updates/prod_01"
                  />
                  <label className="grid gap-2 text-[9px] font-bold sm:col-span-2">
                    Catatan versi
                    <textarea
                      rows={3}
                      defaultValue="Tambahan 20 prompt riset dan perbaikan struktur Notion workspace."
                      className="hairline rounded-xl border p-3 text-[9px] font-normal outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void publishRelease()}
                    className="h-10 rounded-xl bg-[#173f2c] text-[9px] font-extrabold text-white sm:col-span-2"
                  >
                    {published
                      ? `Published ${releases[0].version} • 428 buyers notified`
                      : "Publish update to existing buyers"}
                  </button>
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-[9px] font-extrabold">
                      Release history
                    </p>
                    {releases.map((release) => (
                      <div
                        key={`${release.version}-${release.date}`}
                        className="hairline flex gap-3 border-t py-3 first:border-0"
                      >
                        <span className="h-fit rounded-lg bg-[#e9ff9b] px-2 py-1 text-[8px] font-black text-[#173f2c]">
                          {release.version}
                        </span>
                        <div>
                          <b className="block text-[9px]">{release.notes}</b>
                          <span className="mt-1 block text-[8px] text-[#718078]">
                            {release.date} • available to {release.buyers}{" "}
                            verified buyers
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-6">
              <FormGroup
                label="Informasi produk"
                desc="Konten yang terlihat di halaman produk."
              >
                <div className="grid gap-4">
                  {apiMode ? (
                    <>
                      <Input
                        label="Nama produk"
                        value={title}
                        onChange={setTitle}
                        error={fieldMsg(fieldErrors, "title")}
                      />
                      <Input
                        label="Slug"
                        value={slug}
                        onChange={(v) => setSlug(normalizeProductSlug(v))}
                        prefix="fersaku.id/@asep/"
                        error={fieldMsg(fieldErrors, "slug")}
                      />
                      <label className="grid gap-2 text-xs font-bold">
                        Deskripsi
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={5}
                          className="hairline rounded-xl border bg-white p-4 text-sm font-normal outline-none"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <Input label="Nama produk" value={p.title} />
                      <Input
                        label="Slug"
                        value={p.slug}
                        prefix="fersaku.id/@asep/"
                      />
                      <label className="grid gap-2 text-xs font-bold">
                        Deskripsi
                        <textarea
                          defaultValue={p.description}
                          rows={5}
                          className="hairline rounded-xl border bg-white p-4 text-sm font-normal outline-none"
                        />
                      </label>
                    </>
                  )}
                </div>
              </FormGroup>
              <FormGroup
                label="Harga & status"
                desc="Atur harga dan visibilitas produk."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {apiMode ? (
                    <Input
                      label="Harga"
                      value={priceText}
                      onChange={setPriceText}
                      prefix="Rp"
                      error={fieldMsg(fieldErrors, "price")}
                    />
                  ) : (
                    <Input label="Harga" value={String(p.price)} prefix="Rp" />
                  )}
                  <Select
                    label="Status"
                    options={[
                      archived
                        ? "Archived"
                        : p.status === "draft"
                          ? "Draft"
                          : "Published",
                      "Draft",
                      "Archived",
                    ]}
                  />
                </div>
              </FormGroup>
            </div>
          )}
        </div>
      </section>
      <aside className="grid content-start gap-4">
        <div className={`${sellerCard} p-5`}>
          <h3 className="text-xs font-extrabold">Ringkasan produk</h3>
          <div className="mt-5 grid gap-3">
            {[
              ["Jenis", p.type],
              ["Terjual", String(p.sales)],
              ["Harga", rupiah(p.price)],
              ["Dibuat", "18 Mar 2026"],
              ["Terakhir diubah", "2 Jul 2026"],
            ].map((x) => (
              <div key={x[0]} className="flex justify-between text-[10px]">
                <span className="text-[#748078]">{x[0]}</span>
                <b className="capitalize">{x[1]}</b>
              </div>
            ))}
          </div>
        </div>
        <div className={`${sellerCard} border-[#efc8c0] p-5`}>
          <h3 className="text-xs font-extrabold text-[#a44f3b]">Danger zone</h3>
          <p className="mt-2 text-[9px] leading-4 text-[#85736e]">
            Arsipkan produk agar tidak bisa dibeli tanpa menghapus data
            penjualan.
          </p>
          <button
            type="button"
            disabled={apiMode && (submitting || archived)}
            onClick={() => void toggleArchive()}
            className="mt-4 h-10 w-full rounded-xl border border-[#efc8c0] bg-[#fff6f2] text-[10px] font-extrabold text-[#a44f3b] disabled:opacity-60"
          >
            {archived ? "Pulihkan produk" : "Arsipkan produk"}
          </button>
        </div>
      </aside>
    </div>
  );
}
