"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  Camera,
  Link2,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/brand";
import { ProductArt } from "@/components/product-art";
import type { PublicStorefront } from "@/features/catalog/contracts";
import {
  filterStorefrontProducts,
  publicProductHref,
  SAFE_EXTERNAL_LINK_REL,
  SAFE_EXTERNAL_LINK_TARGET,
} from "@/features/catalog/mappers";
import { cn, rupiah } from "@/lib/utils";

type Props = {
  store: PublicStorefront;
};

/**
 * PUB-210 — existing storefront chrome with client product search + safe socials.
 * Geometry/classes/copy match the frozen store page snapshot.
 */
export function PublicStorefrontView({ store }: Props) {
  const editorial = store.layout === "editorial";
  const radius =
    store.radius === "round"
      ? "rounded-[36px]"
      : store.radius === "soft"
        ? "rounded-[22px]"
        : "rounded-none";
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelId = useId();

  const products = useMemo(
    () => filterStorefrontProducts(store.products, query),
    [store.products, query],
  );

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  return (
    <main
      className={cn(
        "storefront-root min-h-screen overflow-hidden",
        store.texture === "grid" && "store-grid",
        store.texture === "dots" && "store-dots",
      )}
      style={{ backgroundColor: store.canvas, color: store.ink }}
    >
      {store.announcement && (
        <div
          className="px-5 py-2.5 text-center text-[10px] font-extrabold"
          style={{ backgroundColor: store.accent, color: store.ink }}
        >
          {store.announcement} <ArrowUpRight className="ml-1 inline size-3" />
        </div>
      )}
      <header className="mx-auto flex h-20 max-w-[1320px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              aria-label="Cari produk"
              aria-expanded={searchOpen}
              aria-controls={searchPanelId}
              onClick={() => setSearchOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-full border border-black/10 bg-white/70"
            >
              <Search className="size-4" />
            </button>
            {searchOpen && (
              <div
                id={searchPanelId}
                className="absolute top-12 right-0 z-20 w-[min(18rem,calc(100vw-2.5rem))] rounded-full border border-black/10 bg-white/95 px-3 py-2 shadow-card"
              >
                <label className="sr-only" htmlFor={`${searchPanelId}-input`}>
                  Cari produk
                </label>
                <input
                  id={`${searchPanelId}-input`}
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchOpen(false);
                      setQuery("");
                    }
                  }}
                  placeholder="Cari produk..."
                  className="w-full bg-transparent text-xs outline-none"
                  style={{ color: store.ink }}
                />
              </div>
            )}
          </div>
          <Link href="/login" className="hidden text-xs font-bold sm:block">
            Seller login
          </Link>
        </div>
      </header>
      <section className="px-4 pb-12 sm:px-8">
        <div
          className={cn(
            "relative mx-auto max-w-[1240px] overflow-hidden p-7 text-white sm:p-12 lg:p-16",
            radius,
            store.texture === "noise" && "noise",
            store.hero === "compact" ? "min-h-[260px]" : "min-h-[390px]",
          )}
          style={{ backgroundColor: store.ink }}
        >
          <div className="absolute -top-44 -right-16 size-[520px] rounded-full border border-white/10" />
          <div
            className="absolute -bottom-32 left-1/3 size-80 rounded-full blur-3xl"
            style={{ backgroundColor: `${store.accent}33` }}
          />
          <div
            className={cn(
              "relative flex min-h-[270px] flex-col justify-end",
              store.headerAlign === "center" && "items-center text-center",
            )}
          >
            <span
              className="grid size-20 -rotate-3 place-items-center text-4xl font-black shadow-2xl"
              style={{
                backgroundColor: store.accent,
                color: store.ink,
                borderRadius: store.radius === "sharp" ? 0 : 24,
              }}
            >
              {store.monogram}
            </span>
            <div
              className={cn(
                "mt-7 flex w-full flex-col justify-between gap-7 md:flex-row md:items-end",
                store.headerAlign === "center" && "md:flex-col md:items-center",
              )}
            >
              <div>
                <p className="mb-3 text-[10px] font-extrabold tracking-[.2em] text-white/45 uppercase">
                  {store.tagline}
                </p>
                <div className="flex items-center gap-2">
                  <h1
                    className={cn(
                      "font-display text-5xl tracking-[-.045em] sm:text-7xl",
                      store.font === "modern" && "font-sans font-black",
                    )}
                  >
                    {store.name}
                  </h1>
                  {store.verified && (
                    <BadgeCheck
                      className="size-6"
                      style={{ color: store.accent }}
                    />
                  )}
                </div>
                <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">
                  {store.bio}
                </p>
              </div>
              <div className="flex gap-2">
                {store.socials.instagram && (
                  <a
                    href={store.socials.instagram}
                    aria-label="Instagram"
                    target={SAFE_EXTERNAL_LINK_TARGET}
                    rel={SAFE_EXTERNAL_LINK_REL}
                    className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/5"
                  >
                    <Camera className="size-4" />
                  </a>
                )}
                {store.socials.youtube && (
                  <a
                    href={store.socials.youtube}
                    aria-label="YouTube"
                    target={SAFE_EXTERNAL_LINK_TARGET}
                    rel={SAFE_EXTERNAL_LINK_REL}
                    className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/5"
                  >
                    <Play className="size-4" />
                  </a>
                )}
                {store.socials.website && (
                  <a
                    href={store.socials.website}
                    aria-label="Website"
                    target={SAFE_EXTERNAL_LINK_TARGET}
                    rel={SAFE_EXTERNAL_LINK_REL}
                    className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/5"
                  >
                    <Link2 className="size-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto grid max-w-[1180px] gap-3 sm:grid-cols-3">
          {store.trustBadges.map((badge) => (
            <div
              key={badge}
              className="flex items-center justify-center gap-2 border border-black/10 bg-white/55 px-4 py-3 text-[10px] font-extrabold backdrop-blur"
              style={{ borderRadius: store.radius === "sharp" ? 0 : 16 }}
            >
              <ShieldCheck className="size-4" />
              {badge}
            </div>
          ))}
        </div>
      </section>
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-extrabold tracking-[.16em] uppercase opacity-55">
                Curated collection
              </p>
              <h2
                className={cn(
                  "font-display mt-2 text-4xl tracking-[-.03em] sm:text-5xl",
                  store.font === "modern" && "font-sans font-black",
                )}
              >
                Produk digital pilihan
              </h2>
            </div>
            <span className="text-xs font-bold opacity-55">
              {products.length} produk
            </span>
          </div>
          <div
            className={cn(
              "mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
              editorial && "lg:grid-cols-2",
            )}
          >
            {products.map((p, index) => (
              <Link
                href={publicProductHref(store.slug, p.slug)}
                key={p.id}
                className={cn(
                  "group shadow-card border border-black/10 bg-white/70 p-3 transition duration-300 hover:-translate-y-1",
                  radius,
                  editorial &&
                    index === 0 &&
                    "sm:col-span-2 lg:grid lg:grid-cols-2 lg:gap-5",
                )}
              >
                <div className="relative">
                  <ProductArt
                    palette={p.palette}
                    glyph={p.glyph}
                    title={p.type}
                    className={cn(
                      "aspect-[1.18]",
                      store.cards === "poster" && "aspect-[1.4]",
                    )}
                  />
                  {p.badge && (
                    <span
                      className="absolute top-3 left-3 rounded-full px-3 py-1.5 text-[9px] font-extrabold tracking-wider uppercase"
                      style={{
                        backgroundColor: store.ink,
                        color: store.accent,
                      }}
                    >
                      {p.badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-col p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="text-base font-extrabold tracking-tight">
                        {p.title}
                      </h3>
                      <p className="mt-2 text-xs leading-5 opacity-60">
                        {p.short}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-5">
                    <b className="text-sm">
                      {rupiah(p.price)}
                      {p.allowPayWhatYouWant && (
                        <span className="ml-1 text-[8px] font-medium opacity-50">
                          minimum
                        </span>
                      )}
                    </b>
                    <span className="flex items-center gap-1 text-[10px] font-bold opacity-55">
                      <Sparkles className="size-3" />
                      {p.sales} terjual
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-6 border-y border-black/10 py-10 sm:flex-row">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.16em] uppercase opacity-55">
              Social proof
            </p>
            <h2 className="font-display mt-2 text-4xl">
              Disukai pembeli, dirawat kreator.
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <b className="font-display text-6xl">{store.rating}</b>
            <div>
              <div className="flex" style={{ color: store.accent }}>
                {[1, 2, 3, 4, 5].map((x) => (
                  <Star key={x} className="size-4 fill-current" />
                ))}
              </div>
              <p className="mt-1 text-[10px] opacity-55">
                {store.reviewCount} ulasan terverifikasi
              </p>
            </div>
          </div>
        </div>
      </section>
      <footer className="border-t border-black/10 px-5 py-8 text-center text-xs opacity-60">
        Dibuat dengan{" "}
        <Link href="/" className="font-extrabold">
          fersaku
        </Link>
      </footer>
    </main>
  );
}
