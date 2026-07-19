import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/instrument-serif/400.css";
import "./globals.css";
import { ThemeDock, ThemeProvider } from "@/components/theme-provider";
import { AppQueryProvider } from "@/shared/query/query-provider";
import { assertSafePublicEnvironment } from "@/shared/config/env";
import {
  createBootstrapDomainSourceSnapshot,
  toPublicDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { DomainSourceProvider } from "@/shared/data/domain-source-provider";
import { SessionProvider } from "@/shared/auth/session-provider";

assertSafePublicEnvironment();

export const metadata: Metadata = {
  title: "Fersaku — Sell digital products beautifully",
  description:
    "Buat toko, terima pembayaran QRIS, dan kirim produk digital secara otomatis.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // INT-025: evaluate once on server; pass public-safe snapshot for hydration.
  const domainSourceSnapshot = toPublicDomainSourceSnapshot(
    createBootstrapDomainSourceSnapshot(),
  );

  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const requested=new URLSearchParams(location.search).get("theme");const saved=localStorage.getItem("fersaku-theme");const preferred=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=requested==="light"||requested==="dark"?requested:saved||preferred}catch{}`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <DomainSourceProvider snapshot={domainSourceSnapshot}>
            <AppQueryProvider>
              <SessionProvider>{children}</SessionProvider>
              <ThemeDock />
            </AppQueryProvider>
          </DomainSourceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
