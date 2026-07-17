"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useState, type DragEvent } from "react";
import { getStorefrontBuilderPreviewProducts } from "@/features/catalog/api";
import { cn, rupiah } from "@/lib/utils";
import type { BuilderConfig } from "../types";
import { PanelTitle } from "../controls/panel-title";

export function SectionsPanel({
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
          {getStorefrontBuilderPreviewProducts().slice(0, 6).map((product) => (
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
