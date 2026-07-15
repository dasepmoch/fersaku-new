import { PublicNav } from "./public-nav";
import { Footer } from "./footer";
import { Eyebrow } from "./brand";

export function MarketingHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
}) {
  return (
    <>
      <PublicNav />
      <section className="grid-fade relative px-5 pt-16 pb-20 text-center lg:px-8 lg:pt-24 lg:pb-28">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="font-display mx-auto max-w-[900px] text-[clamp(4rem,9vw,7.5rem)] leading-[.84] tracking-[-.05em]">
          {title}
        </h1>
        <p className="mx-auto mt-8 max-w-[640px] text-base leading-7 text-[#647169]">
          {description}
        </p>
      </section>
    </>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen overflow-hidden">
      {children}
      <Footer />
    </main>
  );
}
