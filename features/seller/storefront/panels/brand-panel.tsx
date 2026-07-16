import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { storefrontTemplates as templates } from "../config";
import type { BuilderConfig } from "../types";
import { ColorControl } from "../controls/color-control";
import { ControlArea } from "../controls/control-area";
import { ControlInput } from "../controls/control-input";
import { PanelTitle } from "../controls/panel-title";
import { ToggleRow } from "../controls/toggle-row";

export function BrandPanel({
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
