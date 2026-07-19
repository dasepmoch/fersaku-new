import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { storefrontTemplates as templates } from "../config";
import type { BuilderConfig } from "../types";
import { PanelTitle } from "../controls/panel-title";

export function TemplatePanel({
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
