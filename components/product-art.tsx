import { cn } from "@/lib/utils";

export function ProductArt({
  palette,
  glyph,
  className = "",
  title,
}: {
  palette: string;
  glyph: string;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn("noise relative overflow-hidden rounded-[26px]", className)}
      style={{ backgroundColor: palette }}
    >
      <div className="absolute -top-10 -right-8 size-36 rounded-full border border-black/10" />
      <div className="absolute top-2 -right-2 size-20 rounded-full border border-black/10" />
      <div className="absolute bottom-3 left-3 h-1/3 w-[2px] bg-black/15" />
      <div className="absolute right-5 bottom-5 left-6 flex items-end justify-between">
        <span className="font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-none tracking-[-.06em] text-[#17231d]">
          {glyph}
        </span>
        {title && (
          <span className="max-w-24 text-right text-[10px] leading-tight font-extrabold tracking-[.08em] text-black/50 uppercase">
            {title}
          </span>
        )}
      </div>
    </div>
  );
}
