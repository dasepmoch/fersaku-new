export function FormGroup({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hairline border-b pb-7 last:border-0">
      <div className="mb-5">
        <h2 className="text-sm font-extrabold">{label}</h2>
        <p className="mt-1 text-[10px] text-[#7b8780]">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export function FieldInput({
  label,
  placeholder,
  prefix,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  placeholder?: string;
  prefix?: string;
  value?: string;
  onChange?: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <div className="hairline flex h-12 overflow-hidden rounded-xl border bg-white">
        {prefix && (
          <span className="hairline flex items-center border-r bg-[#f3f4ef] px-3 text-[10px] font-semibold text-[#77837b]">
            {prefix}
          </span>
        )}
        <input
          value={onChange ? (value ?? "") : undefined}
          defaultValue={onChange ? undefined : value}
          onChange={(event) => onChange?.(event.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-4 text-sm font-normal outline-none"
        />
      </div>
    </label>
  );
}
