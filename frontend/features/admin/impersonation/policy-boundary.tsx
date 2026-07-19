"use client";

import { LockKeyhole, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ImpersonationSession } from "./session";
import {
  canRunImpersonationCommand,
  impersonationBlockedMessage,
} from "./policy";

type GuardedElement = HTMLElement;

function commandFor(element: GuardedElement | null) {
  return element?.dataset.impersonationCommand ?? "";
}

function fieldsFor(element: GuardedElement | null) {
  return (element?.dataset.impersonationFields ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

function isExplicitlySafe(element: GuardedElement | null) {
  return (
    element?.dataset.impersonationSafe === "true" ||
    element?.dataset.feedback === "off" ||
    Boolean(element?.closest("nav"))
  );
}

export function ImpersonationPolicyBoundary({
  session,
  children,
}: {
  session: ImpersonationSession | null;
  children: React.ReactNode;
}) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const reportBlocked = () => {
    if (!session) return;
    setMessage(impersonationBlockedMessage(session.scope));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 3200);
  };

  const blocks = (element: GuardedElement | null) => {
    if (!session || isExplicitlySafe(element)) return false;
    return !canRunImpersonationCommand(
      session,
      commandFor(element),
      fieldsFor(element),
    );
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button");
    const downloadLink = target.closest<GuardedElement>("a[download]");
    const guardedElement = button ?? downloadLink;
    if (!guardedElement || (button && button.disabled)) return;
    if (!blocks(guardedElement)) return;
    event.preventDefault();
    event.stopPropagation();
    reportBlocked();
  };

  const handleSubmit = (event: React.FormEvent<HTMLDivElement>) => {
    const form = event.target as GuardedElement;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as GuardedElement | null;
    const guardedElement = submitter ?? form;
    if (!blocks(guardedElement)) return;
    event.preventDefault();
    event.stopPropagation();
    reportBlocked();
  };

  return (
    <div onClickCapture={handleClick} onSubmitCapture={handleSubmit}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[155] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#6e5518]/20 bg-[#6e5518]/95 px-4 py-3 text-[10px] font-extrabold text-white shadow-2xl backdrop-blur-xl"
        >
          <LockKeyhole className="size-4 text-[#fff0bf]" />
          <span className="max-w-[300px]">{message}</span>
          <button
            type="button"
            data-impersonation-safe="true"
            onClick={() => setMessage("")}
            className="ml-2 text-white/50"
            aria-label="Tutup pemberitahuan impersonation"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
