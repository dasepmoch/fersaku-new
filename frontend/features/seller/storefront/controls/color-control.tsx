export function ColorControl({
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
