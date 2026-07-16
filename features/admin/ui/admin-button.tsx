"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { adminPrimaryButtonClass, adminSecondaryButtonClass } from "./styles";

type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  secondary?: boolean;
};

export function AdminButton({
  children,
  secondary = false,
  type = "button",
  className,
  ...buttonProps
}: AdminButtonProps) {
  const base = secondary ? adminSecondaryButtonClass : adminPrimaryButtonClass;
  return (
    <button
      type={type}
      className={className ? `${base} ${className}` : base}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
