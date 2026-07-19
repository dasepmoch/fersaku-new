import Link from "next/link";
import { Logo } from "./brand";
import { getDomainSource } from "@/shared/data/domain-source";

export function Footer() {
  // KEY-23: prototype demo storefront only when publicCatalog is mock.
  const showDemoStore = getDomainSource("publicCatalog") === "mock";
  const productLinks: [string, string][] = [
    ["Fitur", "/features"],
    ["Harga", "/pricing"],
    ...(showDemoStore
      ? ([["Toko demo", "/@asep-ai-tools"]] as [string, string][])
      : []),
    ["Help center", "/help"],
  ];

  return (
    <footer className="bg-[#102b20] px-5 py-12 text-white lg:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-5 max-w-xs text-sm leading-6 text-white/55">
            Tempat paling indah untuk menjual karya digital di Indonesia.
          </p>
        </div>
        {[
          ["Produk", productLinks],
          [
            "Developer",
            [
              ["QRIS API", "/api"],
              ["Dokumentasi", "/docs/api"],
              ["Status", "/status"],
              ["Security", "/security"],
            ],
          ],
          [
            "Perusahaan",
            [
              ["Tentang", "/about"],
              ["Blog", "/blog"],
              ["Careers", "/careers"],
              ["Kontak", "/contact"],
              ["Changelog", "/changelog"],
            ],
          ],
        ].map(([heading, items]) => (
          <div key={heading as string}>
            <h4 className="text-xs font-bold tracking-[.15em] text-[#d7ff64] uppercase">
              {heading}
            </h4>
            <div className="mt-4 grid gap-3">
              {(items as string[][]).map(([item, href]) => (
                <Link
                  key={item}
                  href={href}
                  className="text-sm text-white/55 hover:text-white"
                >
                  {item}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-[1180px] flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:justify-between">
        <span>© 2026 Fersaku. Dibuat untuk kreator Indonesia.</span>
        <span className="flex flex-wrap gap-4">
          <Link href="/privacy" className="hover:text-white">
            Privasi
          </Link>
          <Link href="/terms" className="hover:text-white">
            Ketentuan
          </Link>
          <Link href="/cookies" className="hover:text-white">
            Cookie
          </Link>
        </span>
      </div>
    </footer>
  );
}
