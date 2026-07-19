"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const card = "rounded-[22px] border hairline bg-[#fbfaf7] shadow-card";

export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[#07110c]/65 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="hairline max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] border bg-[#fbfaf7] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start gap-4">
          <div>
            <h2 className="text-lg font-extrabold">{title}</h2>
            <p className="mt-1 text-[10px] leading-5 text-[#718078]">
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="hairline ml-auto grid size-9 place-items-center rounded-xl border bg-white"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function SettingsForm({
  title,
  description,
  fields,
  values,
  onChange,
  types,
}: {
  title: string;
  description: string;
  fields: string[];
  /** Controlled values keyed by label (SEL-340). */
  values?: Record<string, string>;
  onChange?: (label: string, value: string) => void;
  types?: Record<string, string>;
}) {
  return (
    <div>
      <h2 className="text-sm font-extrabold">{title}</h2>
      <p className="mt-1 text-[10px] text-[#718078]">{description}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const [label, fallback] = field.split("|");
          const controlled = values !== undefined;
          const value = controlled ? (values[label] ?? "") : fallback;
          return (
            <label key={label} className="grid gap-2 text-[9px] font-bold">
              {label}
              <input
                type={types?.[label] ?? "text"}
                {...(controlled
                  ? {
                      value,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        onChange?.(label, e.target.value),
                    }
                  : { defaultValue: fallback })}
                className="hairline h-11 rounded-xl border bg-white px-3 text-xs font-normal outline-none"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function Preference({
  label,
  defaultOn,
  value,
  onChange,
}: {
  label: string;
  defaultOn?: boolean;
  /** Controlled value (SEL-340 server prefs). */
  value?: boolean;
  onChange?: (next: boolean) => void;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(Boolean(defaultOn));
  const on = controlled ? Boolean(value) : internal;
  return (
    <div className="hairline flex items-center justify-between rounded-xl border bg-white p-3">
      <span className="text-[9px] font-bold">{label}</span>
      <button
        type="button"
        onClick={() => {
          const next = !on;
          if (controlled) {
            onChange?.(next);
            return;
          }
          setInternal(next);
        }}
        className={cn(
          "relative h-5 w-9 rounded-full",
          on ? "bg-[#173f2c]" : "bg-[#cbd0cb]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-3 rounded-full bg-white transition",
            on ? "left-5" : "left-1",
          )}
        />
      </button>
    </div>
  );
}
