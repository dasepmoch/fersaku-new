"use client";

import Link from "next/link";
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Eye,
  Globe2,
  GripVertical,
  ImagePlus,
  Camera,
  LayoutGrid,
  Link2,
  List,
  Monitor,
  Palette,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { ProductArt } from "@/components/product-art";
import { products } from "@/lib/mock-data";
import { cn, rupiah } from "@/lib/utils";
import {
  initialStorefrontConfig,
  storefrontTemplates as templates,
} from "./config";
import type {
  BuilderConfig,
  BuilderTab,
  CardStyle,
  FontStyle,
  Hero,
  Layout,
  Radius,
  Texture,
} from "./types";

const tabs: Array<{ label: BuilderTab; icon: typeof Palette }> = [
  { label: "Templates", icon: Sparkles },
  { label: "Brand", icon: Palette },
  { label: "Layout", icon: LayoutGrid },
  { label: "Sections", icon: List },
  { label: "Links & SEO", icon: Globe2 },
];

function readStorefrontDraft(): {
  config: BuilderConfig;
  logoStyle: "letter" | "spark" | "image";
} {
  if (typeof window === "undefined") {
    return { config: initialStorefrontConfig, logoStyle: "letter" };
  }
  try {
    const raw = localStorage.getItem("fersaku-storefront-draft");
    if (!raw) return { config: initialStorefrontConfig, logoStyle: "letter" };
    const parsed = JSON.parse(raw) as {
      config?: BuilderConfig;
      logoStyle?: "letter" | "spark" | "image";
    };
    return {
      config: parsed.config
        ? { ...initialStorefrontConfig, ...parsed.config }
        : initialStorefrontConfig,
      logoStyle: parsed.logoStyle || "letter",
    };
  } catch {
    return { config: initialStorefrontConfig, logoStyle: "letter" };
  }
}

export function StorefrontBuilder() {
  const draft = useMemo(() => readStorefrontDraft(), []);
  const [config, setConfig] = useState(draft.config);
  const [history, setHistory] = useState<BuilderConfig[]>([]);
  const [future, setFuture] = useState<BuilderConfig[]>([]);
  const [tab, setTab] = useState<BuilderTab>("Templates");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saved, setSaved] = useState(false);
  const [logoStyle, setLogoStyle] = useState<"letter" | "spark" | "image">(
    draft.logoStyle,
  );

  const commit = (next: BuilderConfig) => {
    setHistory((items) => [...items.slice(-19), config]);
    setFuture([]);
    setConfig(next);
  };
  const update = (patch: Partial<BuilderConfig>) => {
    commit({ ...config, ...patch });
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [config, ...items]);
    setConfig(previous);
    setHistory((items) => items.slice(0, -1));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, config]);
    setConfig(next);
    setFuture((items) => items.slice(1));
  };
  const applyTemplate = (template: (typeof templates)[number]) => {
    update({ ...template.config, template: template.name });
  };
  const reorderSections = (from: number, to: number) => {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= config.sections.length ||
      to >= config.sections.length
    ) {
      return;
    }
    const sections = [...config.sections];
    const [item] = sections.splice(from, 1);
    sections.splice(to, 0, item);
    update({ sections });
  };
  const moveSection = (index: number, direction: number) => {
    reorderSections(index, index + direction);
  };
  const visibleSections = useMemo(
    () => config.sections.filter((item) => item.visible),
    [config.sections],
  );

  return (
    <div className="-mt-2">
      <div className="hairline shadow-card mb-4 flex flex-col gap-3 rounded-[22px] border bg-[#fbfaf7] p-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-[#d7ff64] text-[#173f2c]">
            <Settings2 className="size-4" />
          </span>
          <div className="min-w-0">
            <b className="block truncate text-xs">Storefront Studio</b>
            <span className="text-[8px] text-[#718078]">
              Draft autosaved just now • revision 14
            </span>
          </div>
        </div>
        <div className="flex overflow-x-auto lg:ml-4">
          {tabs.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => setTab(label)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[9px] font-extrabold",
                tab === label ? "bg-[#173f2c] text-white" : "text-[#718078]",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!history.length}
            className="hairline grid size-10 place-items-center rounded-xl border bg-white disabled:opacity-30"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            onClick={redo}
            disabled={!future.length}
            className="hairline grid size-10 place-items-center rounded-xl border bg-white disabled:opacity-30"
          >
            <Redo2 className="size-4" />
          </button>
          <Link
            href="/@asep-ai-tools"
            className="hairline hidden h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold sm:flex"
          >
            <Eye className="size-3.5" /> Live store
          </Link>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(
                  "fersaku-storefront-draft",
                  JSON.stringify({ config, logoStyle }),
                );
              } catch {
                /* ignore quota / private mode */
              }
              setSaved(true);
              setTimeout(() => setSaved(false), 1800);
            }}
            className="flex h-10 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-[9px] font-extrabold text-white"
          >
            {saved ? <Check className="size-4" /> : <Save className="size-4" />}
            {saved ? "Published" : "Publish"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(420px,560px)_minmax(0,1fr)]">
        <section className="hairline shadow-card rounded-[22px] border bg-[#fbfaf7] p-5 sm:p-6">
          {tab === "Templates" && (
            <TemplatePanel config={config} applyTemplate={applyTemplate} />
          )}
          {tab === "Brand" && (
            <BrandPanel
              config={config}
              update={update}
              logoStyle={logoStyle}
              setLogoStyle={setLogoStyle}
            />
          )}
          {tab === "Layout" && <LayoutPanel config={config} update={update} />}
          {tab === "Sections" && (
            <SectionsPanel
              config={config}
              update={update}
              moveSection={moveSection}
              reorderSections={reorderSections}
            />
          )}
          {tab === "Links & SEO" && (
            <LinksPanel config={config} update={update} />
          )}
        </section>

        <aside className="min-w-0">
          <div className="hairline shadow-card sticky top-24 rounded-[22px] border bg-[#e7e9e4] p-3">
            <div className="mb-3 flex items-center px-2">
              <div>
                <b className="block text-[10px]">Live preview</b>
                <span className="text-[8px] text-[#718078]">
                  Every control updates this canvas instantly
                </span>
              </div>
              <div className="hairline ml-auto flex rounded-xl border bg-white p-1">
                <button
                  onClick={() => setDevice("desktop")}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    device === "desktop" && "bg-[#e9ff9b] text-[#173f2c]",
                  )}
                >
                  <Monitor className="size-4" />
                </button>
                <button
                  onClick={() => setDevice("mobile")}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    device === "mobile" && "bg-[#e9ff9b] text-[#173f2c]",
                  )}
                >
                  <Smartphone className="size-4" />
                </button>
              </div>
            </div>
            <div
              className={cn(
                "mx-auto overflow-hidden border border-black/10 bg-white shadow-2xl transition-all duration-500",
                device === "mobile"
                  ? "max-w-[330px] rounded-[32px] border-[8px] border-[#17231d]"
                  : "w-full rounded-[18px]",
              )}
            >
              <StorePreview
                config={config}
                device={device}
                logoStyle={logoStyle}
                visibleSections={visibleSections}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TemplatePanel({
  config,
  applyTemplate,
}: {
  config: BuilderConfig;
  applyTemplate: (template: (typeof templates)[number]) => void;
}) {
  return (
    <div>
      <PanelTitle
        title="Choose a complete template"
        description="Template changes layout, typography, colors, hero, cards, texture, and density as one coherent system."
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {templates.map((template) => (
          <button
            key={template.name}
            onClick={() => applyTemplate(template)}
            className={cn(
              "group rounded-[20px] border p-3 text-left transition hover:-translate-y-0.5",
              config.template === template.name
                ? "border-[#173f2c] bg-[#eff3e9]"
                : "hairline bg-white",
            )}
          >
            <div
              className="flex h-24 overflow-hidden rounded-xl"
              style={{ backgroundColor: template.colors[2] }}
            >
              <div
                className="m-2 flex flex-1 flex-col justify-end rounded-lg p-3"
                style={{
                  backgroundColor: template.colors[0],
                  color: template.colors[1],
                }}
              >
                <span
                  className="size-5 rounded-md"
                  style={{ backgroundColor: template.colors[1] }}
                />
                <span className="mt-3 h-2 w-1/2 rounded bg-current opacity-70" />
                <span className="mt-1 h-1.5 w-3/4 rounded bg-current opacity-30" />
              </div>
              <div
                className="my-2 mr-2 w-1/3 rounded-lg"
                style={{ backgroundColor: template.colors[1] }}
              />
            </div>
            <div className="mt-3 flex items-center">
              <div>
                <b className="block text-[10px]">{template.name}</b>
                <span className="text-[8px] text-[#718078]">
                  {template.note}
                </span>
              </div>
              {config.template === template.name && (
                <span className="ml-auto grid size-6 place-items-center rounded-full bg-[#173f2c] text-white">
                  <Check className="size-3" />
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-5 rounded-2xl bg-[#eef3e9] p-4 text-[9px] leading-5 text-[#617065]">
        <Sparkles className="mr-2 inline size-4 text-[#315d47]" />
        Applying a template keeps your store name, copy, links, products, and
        section content intact.
      </div>
    </div>
  );
}

function BrandPanel({
  config,
  update,
  logoStyle,
  setLogoStyle,
}: {
  config: BuilderConfig;
  update: (patch: Partial<BuilderConfig>) => void;
  logoStyle: string;
  setLogoStyle: (style: "letter" | "spark" | "image") => void;
}) {
  return (
    <div>
      <PanelTitle
        title="Brand identity"
        description="All copy, color, and identity changes render in the preview while you type."
      />
      <div className="mt-6 flex items-center gap-4">
        <span
          className="shadow-card grid size-16 place-items-center rounded-2xl text-2xl font-black"
          style={{ backgroundColor: config.accent, color: config.ink }}
        >
          {logoStyle === "spark" ? (
            "✦"
          ) : logoStyle === "image" ? (
            <ImagePlus className="size-6" />
          ) : (
            config.name[0] || "A"
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          {(["letter", "spark", "image"] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setLogoStyle(style)}
              className={cn(
                "rounded-xl border px-3 py-2 text-[8px] font-bold capitalize",
                logoStyle === style
                  ? "border-[#173f2c] bg-[#eff3e9]"
                  : "hairline bg-white",
              )}
            >
              {style === "image" && (
                <ImagePlus className="mr-1 inline size-3" />
              )}
              {style}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-4">
        <ControlInput
          label="Store name"
          value={config.name}
          onChange={(name) => update({ name })}
        />
        <ControlInput
          label="Tagline"
          value={config.tagline}
          onChange={(tagline) => update({ tagline })}
        />
        <ControlArea
          label="Bio"
          value={config.bio}
          onChange={(bio) => update({ bio })}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorControl
            label="Accent"
            value={config.accent}
            onChange={(accent) => update({ accent })}
          />
          <ColorControl
            label="Ink"
            value={config.ink}
            onChange={(ink) => update({ ink })}
          />
          <ColorControl
            label="Canvas"
            value={config.canvas}
            onChange={(canvas) => update({ canvas })}
          />
        </div>
        <div>
          <p className="mb-2 text-[9px] font-extrabold">Quick palettes</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.name}
                onClick={() =>
                  update({
                    accent: template.colors[1],
                    ink: template.colors[0],
                    canvas: template.colors[2],
                  })
                }
                title={template.name}
                className="flex overflow-hidden rounded-full border-2 border-white shadow-sm"
              >
                {template.colors.map((color) => (
                  <span
                    key={color}
                    className="size-7"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </button>
            ))}
          </div>
        </div>
        <div className="hairline rounded-2xl border bg-white p-4">
          <ToggleRow
            label="Announcement bar"
            description="Show an important launch or update message."
            checked={config.announcementEnabled}
            onChange={(announcementEnabled) => update({ announcementEnabled })}
          />
          {config.announcementEnabled && (
            <div className="mt-4">
              <ControlInput
                label="Announcement copy"
                value={config.announcement}
                onChange={(announcement) => update({ announcement })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LayoutPanel({
  config,
  update,
}: {
  config: BuilderConfig;
  update: (patch: Partial<BuilderConfig>) => void;
}) {
  return (
    <div>
      <PanelTitle
        title="Layout system"
        description="Build a distinct composition instead of simply changing colors."
      />
      <OptionGrid
        label="Product layout"
        value={config.layout}
        values={["grid", "editorial", "catalog", "minimal"]}
        onChange={(layout) => update({ layout: layout as Layout })}
      />
      <OptionGrid
        label="Hero composition"
        value={config.hero}
        values={["statement", "split", "compact", "spotlight"]}
        onChange={(hero) => update({ hero: hero as Hero })}
      />
      <OptionGrid
        label="Product cards"
        value={config.cards}
        values={["soft", "outline", "poster", "compact"]}
        onChange={(cards) => update({ cards: cards as CardStyle })}
      />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SelectControl
          label="Typography"
          value={config.font}
          values={["editorial", "modern", "friendly", "mono"]}
          onChange={(font) => update({ font: font as FontStyle })}
        />
        <SelectControl
          label="Background texture"
          value={config.texture}
          values={["noise", "grid", "dots", "clean"]}
          onChange={(texture) => update({ texture: texture as Texture })}
        />
        <SelectControl
          label="Corner style"
          value={config.radius}
          values={["round", "soft", "sharp"]}
          onChange={(radius) => update({ radius: radius as Radius })}
        />
        <SelectControl
          label="Content density"
          value={config.density}
          values={["comfortable", "compact"]}
          onChange={(density) =>
            update({ density: density as BuilderConfig["density"] })
          }
        />
      </div>
      <div className="hairline mt-5 rounded-2xl border bg-white p-4">
        <p className="text-[9px] font-extrabold">Header alignment</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => update({ align: "left" })}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border p-3 text-[9px] font-bold",
              config.align === "left"
                ? "border-[#173f2c] bg-[#eff3e9]"
                : "hairline",
            )}
          >
            <AlignLeft className="size-4" /> Left
          </button>
          <button
            onClick={() => update({ align: "center" })}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border p-3 text-[9px] font-bold",
              config.align === "center"
                ? "border-[#173f2c] bg-[#eff3e9]"
                : "hairline",
            )}
          >
            <AlignCenter className="size-4" /> Center
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <ToggleRow
          label="Store search"
          description="Allow buyers to search products."
          checked={config.showSearch}
          onChange={(showSearch) => update({ showSearch })}
        />
        <ToggleRow
          label="Sales counter"
          description="Show verified sales on cards."
          checked={config.showSales}
          onChange={(showSales) => update({ showSales })}
        />
        <ToggleRow
          label="Rating summary"
          description="Show verified rating social proof."
          checked={config.showRatings}
          onChange={(showRatings) => update({ showRatings })}
        />
      </div>
    </div>
  );
}

function SectionsPanel({
  config,
  update,
  moveSection,
  reorderSections,
}: {
  config: BuilderConfig;
  update: (patch: Partial<BuilderConfig>) => void;
  moveSection: (index: number, direction: number) => void;
  reorderSections: (from: number, to: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const toggleFeatured = (id: string) =>
    update({
      featuredIds: config.featuredIds.includes(id)
        ? config.featuredIds.filter((item) => item !== id)
        : [...config.featuredIds, id],
    });

  const onDragStart = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };
  const onDragOver = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (overIndex !== index) setOverIndex(index);
  };
  const onDrop = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const from = dragIndex ?? Number(event.dataTransfer.getData("text/plain"));
    if (Number.isFinite(from)) reorderSections(from, index);
    setDragIndex(null);
    setOverIndex(null);
  };
  const onDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div>
      <PanelTitle
        title="Sections & merchandising"
        description="Control the exact page order, visibility, featured products, and trust content."
      />
      <div className="mt-6 grid gap-2">
        {config.sections.map((section, index) => (
          <div
            key={section.id}
            onDragOver={onDragOver(index)}
            onDrop={onDrop(index)}
            className={cn(
              "hairline flex items-center rounded-xl border bg-white p-3",
              dragIndex === index && "opacity-50",
              overIndex === index &&
                dragIndex !== null &&
                dragIndex !== index &&
                "border-[#173f2c] bg-[#eff3e9]",
            )}
          >
            <span
              draggable
              onDragStart={onDragStart(index)}
              onDragEnd={onDragEnd}
              className="grid size-7 cursor-grab place-items-center text-[#829087] active:cursor-grabbing"
              aria-label={`Drag ${section.label}`}
              title="Drag to reorder"
            >
              <GripVertical className="size-4" />
            </span>
            <div className="ml-2 min-w-0">
              <b className="block text-[9px]">{section.label}</b>
              <span className="text-[7px] text-[#718078]">
                Section {index + 1}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                update({
                  sections: config.sections.map((item) =>
                    item.id === section.id
                      ? { ...item, visible: !item.visible }
                      : item,
                  ),
                })
              }
              className={cn(
                "relative ml-auto h-5 w-9 rounded-full",
                section.visible ? "bg-[#173f2c]" : "bg-[#cbd0cb]",
              )}
              aria-label={`Toggle ${section.label}`}
            >
              <span
                className={cn(
                  "absolute top-1 size-3 rounded-full bg-white transition",
                  section.visible ? "left-5" : "left-1",
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => moveSection(index, -1)}
              disabled={index === 0}
              className="hairline ml-2 grid size-7 place-items-center rounded-lg border disabled:opacity-25"
              aria-label={`Move ${section.label} up`}
            >
              <ArrowUp className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => moveSection(index, 1)}
              disabled={index === config.sections.length - 1}
              className="hairline ml-1 grid size-7 place-items-center rounded-lg border disabled:opacity-25"
              aria-label={`Move ${section.label} down`}
            >
              <ArrowDown className="size-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="hairline mt-7 border-t pt-6">
        <h3 className="text-xs font-extrabold">Featured products</h3>
        <p className="mt-1 text-[8px] text-[#718078]">
          Choose products promoted at the top of the collection.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {products.slice(0, 6).map((product) => (
            <button
              key={product.id}
              onClick={() => toggleFeatured(product.id)}
              className={cn(
                "flex items-center rounded-xl border p-3 text-left",
                config.featuredIds.includes(product.id)
                  ? "border-[#173f2c] bg-[#eff3e9]"
                  : "hairline bg-white",
              )}
            >
              <span
                className="grid size-9 place-items-center rounded-lg text-[8px] font-black"
                style={{ backgroundColor: product.palette }}
              >
                {product.glyph}
              </span>
              <span className="ml-3 min-w-0">
                <b className="block truncate text-[8px]">{product.title}</b>
                <span className="text-[7px] text-[#718078]">
                  {rupiah(product.price)}
                </span>
              </span>
              {config.featuredIds.includes(product.id) && (
                <Check className="ml-auto size-3.5 text-[#315d47]" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="hairline mt-7 border-t pt-6">
        <h3 className="text-xs font-extrabold">Trust badges</h3>
        <div className="mt-3 grid gap-2">
          {config.trustBadges.map((badge, index) => (
            <div key={`${badge}-${index}`} className="flex">
              <input
                value={badge}
                onChange={(e) =>
                  update({
                    trustBadges: config.trustBadges.map((item, i) =>
                      i === index ? e.target.value : item,
                    ),
                  })
                }
                className="hairline h-10 min-w-0 flex-1 rounded-l-xl border bg-white px-3 text-[9px]"
              />
              <button
                onClick={() =>
                  update({
                    trustBadges: config.trustBadges.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
                className="hairline grid w-10 place-items-center rounded-r-xl border bg-white text-[#a44f3b]"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              update({
                trustBadges: [...config.trustBadges, "New trust signal"],
              })
            }
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-[#173f2c]/30 text-[8px] font-bold"
          >
            <Plus className="size-3.5" /> Add badge
          </button>
        </div>
      </div>
    </div>
  );
}

function LinksPanel({
  config,
  update,
}: {
  config: BuilderConfig;
  update: (patch: Partial<BuilderConfig>) => void;
}) {
  return (
    <div>
      <PanelTitle
        title="Links, domain & SEO"
        description="Finish the storefront metadata buyers and search engines will see."
      />
      <div className="mt-6 grid gap-4">
        <ControlInput
          label="Instagram"
          value={config.instagram}
          onChange={(instagram) => update({ instagram })}
        />
        <ControlInput
          label="Website"
          value={config.website}
          onChange={(website) => update({ website })}
        />
        <div className="hairline rounded-2xl border bg-white p-4">
          <div className="flex items-center">
            <div>
              <b className="text-[9px]">Custom domain</b>
              <p className="mt-1 text-[8px] text-[#718078]">
                shop.asep.ai • DNS verified
              </p>
            </div>
            <span className="ml-auto flex items-center gap-1 rounded-full bg-[#e5f5e6] px-2 py-1 text-[7px] font-extrabold text-[#2e714f]">
              <BadgeCheck className="size-3" /> Connected
            </span>
          </div>
        </div>
        <div>
          <div className="flex items-center">
            <h3 className="text-[9px] font-extrabold">Custom links</h3>
            <button
              onClick={() =>
                update({
                  customLinks: [
                    ...config.customLinks,
                    { label: "New link", url: "https://" },
                  ],
                })
              }
              className="ml-auto flex items-center gap-1 text-[8px] font-bold text-[#315d47]"
            >
              <Plus className="size-3" /> Add link
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {config.customLinks.map((link, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1.4fr_auto] gap-2"
              >
                <input
                  value={link.label}
                  onChange={(e) =>
                    update({
                      customLinks: config.customLinks.map((item, i) =>
                        i === index ? { ...item, label: e.target.value } : item,
                      ),
                    })
                  }
                  className="hairline h-10 min-w-0 rounded-xl border bg-white px-3 text-[8px]"
                />
                <input
                  value={link.url}
                  onChange={(e) =>
                    update({
                      customLinks: config.customLinks.map((item, i) =>
                        i === index ? { ...item, url: e.target.value } : item,
                      ),
                    })
                  }
                  className="hairline h-10 min-w-0 rounded-xl border bg-white px-3 text-[8px]"
                />
                <button
                  onClick={() =>
                    update({
                      customLinks: config.customLinks.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                  className="hairline grid size-10 place-items-center rounded-xl border bg-white text-[#a44f3b]"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="hairline border-t pt-6">
          <h3 className="text-xs font-extrabold">Search preview</h3>
          <div className="hairline mt-3 rounded-2xl border bg-white p-4">
            <p className="text-[10px] text-[#315d47]">shop.asep.ai</p>
            <p className="mt-1 text-base font-bold text-[#3657a7]">
              {config.seoTitle}
            </p>
            <p className="mt-1 text-[9px] leading-4 text-[#718078]">
              {config.seoDescription}
            </p>
          </div>
          <div className="mt-4 grid gap-4">
            <ControlInput
              label="SEO title"
              value={config.seoTitle}
              onChange={(seoTitle) => update({ seoTitle })}
            />
            <ControlArea
              label="Meta description"
              value={config.seoDescription}
              onChange={(seoDescription) => update({ seoDescription })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StorePreview({
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
            config.hero === "spotlight" && "flex-col items-center justify-center",
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
            <div
              key={section.id}
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
        if (section.id === "featured" || section.id === "products") {
          const sectionProducts =
            section.id === "featured" ? featuredProducts : allProducts;
          return (
            <div
              key={section.id}
              className={cn(
                "px-4",
                config.density === "compact" ? "py-5" : "py-7",
              )}
            >
              <div className="flex items-end">
                <div>
                  <p className="text-[5px] font-black tracking-[.18em] uppercase opacity-50">
                    {section.id === "featured"
                      ? "Curated for you"
                      : "All products"}
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
                      className={cn(
                        config.cards === "compact" ? "min-w-0 p-2" : "p-3",
                      )}
                    >
                      <b className="block truncate text-[7px]">
                        {product.title}
                      </b>
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
        if (section.id === "reviews")
          return (
            <div
              key={section.id}
              className="mx-4 border-y border-current/10 py-6"
            >
              <div className="flex items-center">
                <div>
                  <p className="text-[5px] font-black tracking-[.16em] uppercase opacity-50">
                    Verified reviews
                  </p>
                  <h3 className={cn("mt-1 text-xl", font)}>
                    Loved by real buyers.
                  </h3>
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
        if (section.id === "about")
          return (
            <div key={section.id} className="mx-4 py-7">
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
        if (section.id === "newsletter")
          return (
            <div
              key={section.id}
              className={cn("m-4 p-5", radius)}
              style={{ backgroundColor: config.accent, color: config.ink }}
            >
              <Sparkles className="size-3" />
              <b className="mt-3 block text-[8px]">
                Get the next useful thing.
              </b>
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
        return null;
      })}
      <div className="border-t border-current/10 p-4 text-center text-[5px] opacity-45">
        {config.name}
        {config.website ? ` • ${config.website.replace(/^https?:\/\//, "")}` : ""}
        {" • Powered by Fersaku"}
      </div>
    </div>
  );
}

function PanelTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-extrabold">{title}</h2>
      <p className="mt-1 text-[9px] leading-5 text-[#718078]">{description}</p>
    </div>
  );
}
function ControlInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hairline h-11 rounded-xl border bg-white px-3 text-xs font-normal outline-none"
      />
    </label>
  );
}
function ControlArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="hairline resize-none rounded-xl border bg-white p-3 text-xs leading-5 font-normal outline-none"
      />
    </label>
  );
}
function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <span className="hairline flex h-11 overflow-hidden rounded-xl border bg-white">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-11 cursor-pointer border-0 bg-transparent p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 px-2 font-mono text-[8px] uppercase outline-none"
        />
      </span>
    </label>
  );
}
function SelectControl({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="hairline h-11 w-full appearance-none rounded-xl border bg-white px-3 text-[9px] capitalize"
        >
          {values.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2" />
      </span>
    </label>
  );
}
function OptionGrid({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-[9px] font-extrabold">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {values.map((item) => (
          <button
            key={item}
            onClick={() => onChange(item)}
            className={cn(
              "flex items-center rounded-xl border p-3 text-left capitalize",
              value === item
                ? "border-[#173f2c] bg-[#eff3e9]"
                : "hairline bg-white",
            )}
          >
            <span
              className={cn(
                "mr-3 grid size-8 place-items-center rounded-lg",
                value === item ? "bg-[#173f2c] text-white" : "bg-[#eef0eb]",
              )}
            >
              {item === "catalog" || item === "compact" ? (
                <List className="size-3.5" />
              ) : item === "minimal" || item === "outline" ? (
                <Type className="size-3.5" />
              ) : (
                <LayoutGrid className="size-3.5" />
              )}
            </span>
            <b className="text-[8px]">{item}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="hairline flex items-center rounded-xl border bg-white p-3">
      <div>
        <b className="block text-[9px]">{label}</b>
        <span className="text-[7px] text-[#718078]">{description}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative ml-auto h-5 w-9 rounded-full",
          checked ? "bg-[#173f2c]" : "bg-[#cbd0cb]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-3 rounded-full bg-white transition",
            checked ? "left-5" : "left-1",
          )}
        />
      </button>
    </div>
  );
}
