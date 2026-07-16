import { LayoutGrid, List, Type } from "lucide-react";
import { cn } from "@/lib/utils";

export function OptionGrid({
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
