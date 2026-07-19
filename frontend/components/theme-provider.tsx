"use client";

import { Moon, Sun } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const THEME_KEY = "fersaku-theme";
const THEME_EVENT = "fersaku-theme-change";

function readTheme(): Theme {
  const requested = new URLSearchParams(window.location.search).get("theme");
  if (requested === "light" || requested === "dark") return requested;
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

function writeTheme(next: Theme) {
  localStorage.setItem(THEME_KEY, next);
  document.documentElement.dataset.theme = next;
  window.dispatchEvent(new Event(THEME_EVENT));
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    readTheme,
    () => "light",
  );

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (requested === "light" || requested === "dark") {
      localStorage.setItem(THEME_KEY, requested);
    }
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => {
    writeTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useContext(ThemeContext);
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "theme-toggle hairline grid size-10 place-items-center rounded-xl border bg-white transition hover:-translate-y-0.5",
        className,
      )}
      aria-label={`Gunakan mode ${theme === "light" ? "gelap" : "terang"}`}
      title={`Mode ${theme === "light" ? "gelap" : "terang"}`}
    >
      {theme === "light" ? (
        <Moon className="size-4" />
      ) : (
        <Sun className="size-4" />
      )}
    </button>
  );
}

export function ThemeDock() {
  const pathname = usePathname();
  const hasHeaderToggle =
    pathname === "/" ||
    pathname === "/features" ||
    pathname === "/pricing" ||
    pathname === "/api" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin");
  if (hasHeaderToggle) return null;
  return (
    <ThemeToggle className="shadow-float fixed right-5 bottom-5 z-[90] rounded-full" />
  );
}
