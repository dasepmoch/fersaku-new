import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHead({
  title,
  desc,
  link,
  href = "/dashboard/orders",
}: {
  title: string;
  desc: string;
  link?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <div>
        <h2 className="text-sm font-extrabold">{title}</h2>
        <p className="mt-1 text-[10px] text-[#7d8982]">{desc}</p>
      </div>
      {link && (
        <Link href={href} className="text-[10px] font-extrabold text-[#356549]">
          {link} <ArrowRight className="ml-1 inline size-3" />
        </Link>
      )}
    </div>
  );
}
