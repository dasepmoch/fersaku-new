import { surfaceCard } from "./styles";

export function MiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={`${surfaceCard} p-5`}>
      <p className="text-[9px] font-extrabold tracking-wider text-[#7d8982] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-[9px] text-[#7d8982]">{note}</p>
    </div>
  );
}
