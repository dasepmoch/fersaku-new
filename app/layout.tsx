import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/instrument-serif/400.css";
import "./globals.css";
import { ThemeDock, ThemeProvider } from "@/components/theme-provider";
import { AppQueryProvider } from "@/shared/query/query-provider";
import { assertSafePublicEnvironment } from "@/shared/config/env";

assertSafePublicEnvironment();

export const metadata: Metadata = {
  title: "Fersaku — Sell digital products beautifully",
  description:
    "Buat toko, terima pembayaran QRIS, dan kirim produk digital secara otomatis.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
          <AppQueryProvider>
            {children}
            <ThemeDock />
          </AppQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
