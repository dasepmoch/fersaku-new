export function PanelTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-extrabold">{title}</h2>
      <p className="mt-1 text-[9px] leading-5 text-[#718078]">{description}</p>
    </div>
  );
}
