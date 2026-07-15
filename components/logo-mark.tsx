import { cn } from "@/lib/utils";

export function LogoMark({
  className = "",
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Fersaku"
      className={cn("size-9", className)}
      fill="none"
    >
      <rect
        width="48"
        height="48"
        rx="15"
        fill={inverted ? "#D7FF64" : "#173F2C"}
      />
      <path
        d="M14 13.5h20v6H20v5h11v6H20V39h-6V13.5Z"
        fill={inverted ? "#173F2C" : "#D7FF64"}
      />
      <path d="m30.5 27.5 5.5 5.5-5.5 5.5v-3H25v-5h5.5v-3Z" fill="#FF794D" />
      <circle
        cx="35.5"
        cy="13.5"
        r="2.5"
        fill={inverted ? "#173F2C" : "#F8F7F2"}
      />
    </svg>
  );
}
