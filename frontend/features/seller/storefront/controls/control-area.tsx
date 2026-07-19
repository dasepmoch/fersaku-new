export function ControlArea({
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="hairline resize-none rounded-xl border bg-white p-3 text-xs leading-5 font-normal outline-none"
      />
    </label>
  );
}
