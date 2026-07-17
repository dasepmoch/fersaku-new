import {
  ArrowUpRight,
  Camera,
  Globe2,
  ImagePlus,
  Link2,
  Search,
} from "lucide-react";
import { getStorefrontBuilderPreviewProducts } from "@/features/catalog/api";
import { cn } from "@/lib/utils";
import type { BuilderConfig } from "../types";
import {
  AboutSection,
  NewsletterSection,
  ProductSection,
  ReviewsSection,
  TrustSection,
} from "./sections";

export function StorePreview({
  config,
  device,
  logoStyle,
  visibleSections,
}: {
  config: BuilderConfig;
  device: "desktop" | "mobile";
  logoStyle: string;
  visibleSections: BuilderConfig["sections"];
}) {
  const radius =
    config.radius === "round"
      ? "rounded-[22px]"
      : config.radius === "soft"
        ? "rounded-[12px]"
        : "rounded-none";
  const font =
    config.font === "editorial"
      ? "font-display tracking-[-.04em]"
      : config.font === "mono"
        ? "font-mono tracking-tight"
        : config.font === "friendly"
          ? "font-sans tracking-normal"
          : "font-sans tracking-[-.03em]";
  const limit = device === "mobile" ? 4 : 6;
  const products = getStorefrontBuilderPreviewProducts();
  const allProducts = products.slice(0, limit);
  const featuredProducts = (
    config.featuredIds.length
      ? config.featuredIds
          .map((id) => products.find((product) => product.id === id))
          .filter(Boolean)
      : products.slice(0, 2)
  ).slice(0, limit) as typeof products;
  const logoMark =
    logoStyle === "spark" ? (
      "✦"
    ) : logoStyle === "image" ? (
      <ImagePlus className="size-4" />
    ) : (
      config.name[0] || "A"
    );
  const cardClass = (index: number) =>
    cn(
      "overflow-hidden",
      radius,
      config.cards === "soft" && "border-0 bg-white/85 shadow-sm",
      config.cards === "outline" && "border-2 border-current/20 bg-transparent",
      config.cards === "poster" && "border border-current/10 bg-white",
      config.cards === "compact" &&
        "flex items-center border border-current/10 bg-white/70 p-1.5",
      config.cards !== "compact" &&
        config.cards !== "soft" &&
        config.cards !== "outline" &&
        config.cards !== "poster" &&
        "border border-current/10 bg-white/70",
      config.layout === "editorial" &&
        index === 0 &&
        device === "desktop" &&
        "col-span-2 grid grid-cols-2",
    );

  return (
    <div
      className={cn(
        "store-builder-preview min-h-[680px] overflow-hidden",
        config.texture === "noise" && "noise",
        config.texture === "grid" && "store-grid",
        config.texture === "dots" && "store-dots",
      )}
      style={{ backgroundColor: config.canvas, color: config.ink }}
    >
      {config.announcementEnabled && config.announcement && (
        <div
          className="px-4 py-2 text-center text-[6px] font-black"
          style={{ backgroundColor: config.accent, color: config.ink }}
        >
          {config.announcement}{" "}
          <ArrowUpRight className="ml-1 inline size-2.5" />
        </div>
      )}
      <div
        className={cn(
          "flex items-center px-5",
          device === "mobile" ? "h-14" : "h-16",
        )}
      >
        <span className="truncate text-[9px] font-black">{config.name}</span>
        <div className="ml-auto flex items-center gap-2">
          {config.showSearch && (
            <span className="grid size-7 place-items-center rounded-full border border-current/15">
              <Search className="size-3" />
            </span>
          )}
          <span className="text-[7px] font-bold">Products</span>
          <span className="text-[7px] font-bold">About</span>
        </div>
      </div>
      <div
        className={cn(
          "relative mx-3 overflow-hidden p-5 text-white",
          radius,
          config.hero === "compact"
            ? "min-h-[150px]"
            : config.hero === "spotlight"
              ? device === "mobile"
                ? "min-h-[280px]"
                : "min-h-[300px]"
              : device === "mobile"
                ? "min-h-[240px]"
                : "min-h-[260px]",
          config.align === "center" && "text-center",
        )}
        style={{ backgroundColor: config.ink }}
      >
        {config.hero === "spotlight" && (
          <div
            className="pointer-events-none absolute -top-10 -right-8 size-40 rounded-full opacity-40 blur-2xl"
            style={{ backgroundColor: config.accent }}
          />
        )}
        <div
          className={cn(
            "relative flex h-full",
            config.hero === "split" && "items-center justify-between",
            config.hero === "spotlight" &&
              "flex-col items-center justify-center",
            config.hero !== "split" &&
              config.hero !== "spotlight" &&
              "flex-col justify-end",
            config.align === "center" && "items-center",
          )}
        >
          <div
            className={cn(
              config.hero === "split" && "max-w-[65%]",
              config.hero === "spotlight" && "max-w-md",
            )}
          >
            <span
              className={cn(
                "grid place-items-center text-base font-black",
                config.radius === "sharp" ? "rounded-none" : "rounded-xl",
                config.hero === "compact" ? "size-8" : "size-11",
                config.align === "center" && "mx-auto",
              )}
              style={{ backgroundColor: config.accent, color: config.ink }}
            >
              {logoMark}
            </span>
            <p className="mt-5 text-[5px] font-black tracking-[.2em] text-white/45 uppercase">
              {config.tagline}
            </p>
            <h2
              className={cn(
                "mt-2 leading-none",
                font,
                config.hero === "compact"
                  ? "text-xl"
                  : device === "mobile"
                    ? "text-3xl"
                    : "text-4xl",
              )}
            >
              {config.name}
            </h2>
            <p className="mt-3 max-w-md text-[7px] leading-4 text-white/55">
              {config.bio}
            </p>
            <div
              className={cn(
                "mt-4 flex flex-wrap gap-2",
                (config.align === "center" || config.hero === "spotlight") &&
                  "justify-center",
              )}
            >
              {config.instagram && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[5px] font-bold text-white/80">
                  <Camera className="size-2.5" />
                  {config.instagram}
                </span>
              )}
              {config.website && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[5px] font-bold text-white/80">
                  <Link2 className="size-2.5" />
                  {config.website.replace(/^https?:\/\//, "")}
                </span>
              )}
              {config.customLinks.slice(0, 2).map((link) => (
                <span
                  key={`${link.label}-${link.url}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[5px] font-bold text-white/80"
                >
                  <Globe2 className="size-2.5" />
                  {link.label}
                </span>
              ))}
            </div>
          </div>
          {(config.hero === "split" || config.hero === "spotlight") && (
            <div
              className={cn(
                "grid place-items-center text-xl font-black",
                radius,
                config.hero === "spotlight" && "mt-5",
              )}
              style={{
                width:
                  config.hero === "spotlight"
                    ? device === "mobile"
                      ? 90
                      : 140
                    : device === "mobile"
                      ? 70
                      : 120,
                height:
                  config.hero === "spotlight"
                    ? device === "mobile"
                      ? 70
                      : 100
                    : device === "mobile"
                      ? 100
                      : 150,
                backgroundColor: config.accent,
                color: config.ink,
              }}
            >
              NEW
            </div>
          )}
        </div>
      </div>
      {visibleSections.map((section) => {
        if (section.id === "trust")
          return (
            <TrustSection
              key={section.id}
              config={config}
              device={device}
              radius={radius}
            />
          );
        if (section.id === "featured" || section.id === "products") {
          const sectionProducts =
            section.id === "featured" ? featuredProducts : allProducts;
          return (
            <ProductSection
              key={section.id}
              section={section}
              sectionProducts={sectionProducts}
              config={config}
              device={device}
              font={font}
              cardClass={cardClass}
            />
          );
        }
        if (section.id === "reviews")
          return (
            <ReviewsSection key={section.id} config={config} font={font} />
          );
        if (section.id === "about")
          return <AboutSection key={section.id} config={config} font={font} />;
        if (section.id === "newsletter")
          return (
            <NewsletterSection
              key={section.id}
              config={config}
              radius={radius}
            />
          );
        return null;
      })}
      <div className="border-t border-current/10 p-4 text-center text-[5px] opacity-45">
        {config.name}
        {config.website
          ? ` • ${config.website.replace(/^https?:\/\//, "")}`
          : ""}
        {" • Powered by Fersaku"}
      </div>
    </div>
  );
}
