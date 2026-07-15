"use client";

import { AlertOctagon, RefreshCcw } from "lucide-react";

export default function AdminConsoleError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <section className="rounded-[24px] border border-[#efc6bc] bg-[#fff2ef] p-8 text-[#743d38]">
      <AlertOctagon className="size-7" />
      <h2 className="mt-5 text-xl font-black">Operational view unavailable</h2>
      <p className="mt-2 text-sm opacity-70">
        Retry the read operation. No privileged mutation was submitted.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#11182a] px-4 text-xs font-extrabold text-white"
      >
        <RefreshCcw className="size-4" /> Retry view
      </button>
    </section>
  );
}
