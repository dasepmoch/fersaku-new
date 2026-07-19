export function ControlInput({
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
