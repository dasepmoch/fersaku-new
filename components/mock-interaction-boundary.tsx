"use client";

import { CheckCircle2, X } from "lucide-react";
import { useRef, useState } from "react";

export function MockInteractionBoundary({
  children,
  tone = "seller",
}: {
  children: React.ReactNode;
  tone?: "seller" | "admin";
}) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest("button");
    if (
      !button ||
      button.disabled ||
      button.dataset.feedback === "off" ||
      button.classList.contains("theme-toggle")
    )
      return;
    const label =
      button.dataset.action ||
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      button.textContent?.trim();
    if (!label) return;
    setMessage(`${label} diproses dalam mode mock.`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2600);
  };

  return (
    <div onClickCapture={handleClick}>
      {children}
      {message && (
        <div
          className={`fixed bottom-5 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3 text-[10px] font-extrabold shadow-2xl backdrop-blur-xl ${tone === "admin" ? "border-[#2f3d62] bg-[#11182a]/95 text-white" : "border-[#173f2c]/15 bg-[#173f2c]/95 text-white"}`}
        >
          <CheckCircle2
            className={`size-4 ${tone === "admin" ? "text-[#809bff]" : "text-[#d7ff64]"}`}
          />
          <span className="max-w-[280px] truncate">{message}</span>
          <button
            data-feedback="off"
            onClick={() => setMessage("")}
            className="ml-2 text-white/50"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
