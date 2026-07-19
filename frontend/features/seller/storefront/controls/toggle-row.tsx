import { cn } from "@/lib/utils";

export function ToggleRow({
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
