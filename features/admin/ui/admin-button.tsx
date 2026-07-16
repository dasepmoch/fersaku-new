"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { adminPrimaryButtonClass, adminSecondaryButtonClass } from "./styles";

type AdminButtonProps = {
  children: ReactNode;
  secondary?: boolean;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  disabled?: boolean;
  className?: string;
};

export function AdminButton({
  children,
  secondary = false,
  onClick,
  type = "button",
  disabled,
  className,
}: AdminButtonProps) {
  const base = secondary ? adminSecondaryButtonClass : adminPrimaryButtonClass;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className ? `${base} ${className}` : base}
    >
      {children}
    </button>
  );
}
