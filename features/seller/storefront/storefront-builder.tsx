"use client";

import Link from "next/link";
import {
  Check,
  Eye,
  Globe2,
  LayoutGrid,
  List,
  Monitor,
  Palette,
  Redo2,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { storefrontTemplates as templates } from "./config";
import { readStorefrontDraft, writeStorefrontDraft } from "./draft";
import {
  pushHistory,
  redoState,
  reorderSectionsList,
  undoState,
} from "./history";
import { BrandPanel } from "./panels/brand-panel";
import { LayoutPanel } from "./panels/layout-panel";
import { LinksPanel } from "./panels/links-panel";
import { SectionsPanel } from "./panels/sections-panel";
import { TemplatePanel } from "./panels/template-panel";
import { StorePreview } from "./preview/store-preview";
import { usePublishStorefrontMutation } from "./mutations";
import type { BuilderConfig, BuilderTab } from "./types";

const tabs: Array<{ label: BuilderTab; icon: typeof Palette }> = [
  { label: "Templates", icon: Sparkles },
  { label: "Brand", icon: Palette },
  { label: "Layout", icon: LayoutGrid },
  { label: "Sections", icon: List },
  { label: "Links & SEO", icon: Globe2 },
];

export function StorefrontBuilder() {
  const draft = useMemo(() => readStorefrontDraft(), []);
  const publishMutation = usePublishStorefrontMutation();
  const [config, setConfig] = useState(draft.config);
  const [history, setHistory] = useState<BuilderConfig[]>([]);
  const [future, setFuture] = useState<BuilderConfig[]>([]);
  const [tab, setTab] = useState<BuilderTab>("Templates");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saved, setSaved] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [logoStyle, setLogoStyle] = useState<"letter" | "spark" | "image">(
    draft.logoStyle,
  );
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const commit = (next: BuilderConfig) => {
    setHistory((items) => pushHistory(items, config));
    setFuture([]);
    setConfig(next);
  };
  const update = (patch: Partial<BuilderConfig>) => {
    commit({ ...config, ...patch });
  };
  const undo = () => {
    const next = undoState(history, config, future);
    if (!next) return;
    setFuture(next.future);
    setConfig(next.config);
    setHistory(next.history);
  };
  const redo = () => {
    const next = redoState(history, config, future);
    if (!next) return;
    setHistory(next.history);
    setConfig(next.config);
    setFuture(next.future);
  };
  const applyTemplate = (template: (typeof templates)[number]) => {
    update({ ...template.config, template: template.name });
  };
  const reorderSections = (from: number, to: number) => {
    const sections = reorderSectionsList(config.sections, from, to);
    if (!sections) return;
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
            type="button"
            aria-label="Undo perubahan"
            onClick={undo}
            disabled={!history.length}
            className="hairline grid size-10 place-items-center rounded-xl border bg-white disabled:opacity-30"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Redo perubahan"
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
              writeStorefrontDraft(config, logoStyle);
              void publishMutation
                .mutateAsync({
                  storeId: "store_demo_asep",
                  config,
                  logoStyle,
                  reason: "seller_storefront_publish",
                  idempotencyKey: `storefront_${config.name}`,
                })
                .catch(() => setSaved(false));
              setSaved(true);
              const timer = setTimeout(() => setSaved(false), 1800);
              timers.current.push(timer);
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
                  type="button"
                  aria-label="Preview desktop"
                  onClick={() => setDevice("desktop")}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    device === "desktop" && "bg-[#e9ff9b] text-[#173f2c]",
                  )}
                >
                  <Monitor className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Preview mobile"
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
