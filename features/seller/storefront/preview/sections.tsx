import { ShieldCheck, Sparkles, Star } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import type { CatalogProduct as Product } from "@/features/catalog/contracts";
import { cn, rupiah } from "@/lib/utils";
import type { BuilderConfig } from "../types";

export function TrustSection({
  config,
  device,
  radius,
}: {
  config: BuilderConfig;
  device: "desktop" | "mobile";
  radius: string;
}) {
  return (
    <div
      className={cn(
        "mx-3 mt-3 grid gap-1",
        device === "mobile" ? "grid-cols-1" : "grid-cols-3",
      )}
    >
      {config.trustBadges.map((badge, badgeIndex) => (
        <div
          key={`${badge}-${badgeIndex}`}
          className={cn(
            "flex items-center justify-center gap-1.5 border border-current/10 bg-white/60 px-2 py-2 text-[5px] font-bold",
            radius,
          )}
        >
          <ShieldCheck className="size-2.5" />
          {badge}
        </div>
      ))}
    </div>
  );
}

export function ProductSection({
  section,
  sectionProducts,
  config,
  device,
  font,
  cardClass,
}: {
  section: BuilderConfig["sections"][number];
  sectionProducts: Product[];
  config: BuilderConfig;
  device: "desktop" | "mobile";
  font: string;
  cardClass: (index: number) => string;
}) {
  return (
    <div className={cn("px-4", config.density === "compact" ? "py-5" : "py-7")}>
      <div className="flex items-end">
        <div>
          <p className="text-[5px] font-black tracking-[.18em] uppercase opacity-50">
            {section.id === "featured" ? "Curated for you" : "All products"}
          </p>
          <h3 className={cn("mt-1 text-xl", font)}>{section.label}</h3>
        </div>
        <span className="ml-auto text-[5px] opacity-50">
          {sectionProducts.length} products
        </span>
      </div>
      <div
        className={cn(
          "mt-4 grid",
          config.density === "compact" ? "gap-1.5" : "gap-3",
          config.layout === "catalog"
            ? "grid-cols-1"
            : config.layout === "minimal"
              ? "grid-cols-2"
              : device === "mobile"
                ? "grid-cols-2"
                : "grid-cols-3",
        )}
      >
        {sectionProducts.map((product, index) => (
          <div key={product.id} className={cardClass(index)}>
            <ProductArt
              palette={product.palette}
              glyph={product.glyph}
              className={cn(
                config.cards === "compact"
                  ? "size-12 shrink-0 !rounded-[8px]"
                  : config.cards === "poster"
                    ? "aspect-[.9] !rounded-none"
                    : "!rounded-[8px] aspect-[1.15]",
              )}
            />
            <div
              className={cn(config.cards === "compact" ? "min-w-0 p-2" : "p-3")}
            >
              <b className="block truncate text-[7px]">{product.title}</b>
              <p className="mt-1 line-clamp-2 text-[5px] leading-3 opacity-55">
                {product.short}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <b className="text-[6px]">{rupiah(product.price)}</b>
                {config.showRatings && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[5px] font-bold"
                    style={{ color: config.accent }}
                  >
                    <Star className="size-2 fill-current" /> 4.9
                  </span>
                )}
                {config.showSales && (
                  <span className="ml-auto text-[5px] opacity-50">
                    {product.sales} sold
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReviewsSection({
  config,
  font,
}: {
  config: BuilderConfig;
  font: string;
}) {
  return (
    <div className="mx-4 border-y border-current/10 py-6">
      <div className="flex items-center">
        <div>
          <p className="text-[5px] font-black tracking-[.16em] uppercase opacity-50">
            Verified reviews
          </p>
          <h3 className={cn("mt-1 text-xl", font)}>Loved by real buyers.</h3>
        </div>
        <b className={cn("ml-auto text-4xl", font)}>4.9</b>
        <div className="ml-2">
          <div className="flex" style={{ color: config.accent }}>
            {[1, 2, 3, 4, 5].map((x) => (
              <Star key={x} className="size-2.5 fill-current" />
            ))}
          </div>
          <span className="text-[5px] opacity-50">186 reviews</span>
        </div>
      </div>
    </div>
  );
}

export function AboutSection({
  config,
  font,
}: {
  config: BuilderConfig;
  font: string;
}) {
  return (
    <div className="mx-4 py-7">
      <p className="text-[5px] font-black tracking-[.16em] uppercase opacity-50">
        About the creator
      </p>
      <h3 className={cn("mt-2 max-w-lg text-xl leading-tight", font)}>
        {config.tagline || "Small tools, thoughtfully made."}
      </h3>
      <p className="mt-3 max-w-lg text-[6px] leading-3 opacity-55">
        {config.bio}
      </p>
    </div>
  );
}

export function NewsletterSection({
  config,
  radius,
}: {
  config: BuilderConfig;
  radius: string;
}) {
  return (
    <div
      className={cn("m-4 p-5", radius)}
      style={{ backgroundColor: config.accent, color: config.ink }}
    >
      <Sparkles className="size-3" />
      <b className="mt-3 block text-[8px]">Get the next useful thing.</b>
      <div className="mt-3 flex">
        <span className="flex-1 rounded-l-lg bg-white/70 px-3 py-2 text-[5px]">
          email@you.com
        </span>
        <span
          className="rounded-r-lg px-3 py-2 text-[5px] font-black"
          style={{ backgroundColor: config.ink, color: config.accent }}
        >
          Join
        </span>
      </div>
    </div>
  );
}
