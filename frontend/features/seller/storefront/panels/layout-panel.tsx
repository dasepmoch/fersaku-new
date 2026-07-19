import { AlignCenter, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  BuilderConfig,
  CardStyle,
  FontStyle,
  Hero,
  Layout,
  Radius,
  Texture,
} from "../types";
import { OptionGrid } from "../controls/option-grid";
import { PanelTitle } from "../controls/panel-title";
import { SelectControl } from "../controls/select-control";
import { ToggleRow } from "../controls/toggle-row";

export function LayoutPanel({
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
