import { Eyebrow } from "./brand";
import { Footer } from "./footer";
import { PublicNav } from "./public-nav";
import { RotatingQuote } from "./rotating-quote";

export function ContentPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f7f2]">
      <PublicNav />
      <header className="grid-fade relative px-5 pt-16 pb-20 text-center lg:px-8 lg:pt-24 lg:pb-28">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="font-display mx-auto max-w-[980px] text-[clamp(4rem,9vw,7.5rem)] leading-[.84] tracking-[-.05em]">
          {title}
        </h1>
        <p className="mx-auto mt-8 max-w-[660px] text-base leading-7 text-[#647169]">
          {description}
        </p>
      </header>
      {children}
      <section className="px-5 pb-24 lg:px-8">
        <RotatingQuote className="mx-auto max-w-[980px]" />
      </section>
      <Footer />
    </main>
  );
}

export function ProseSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="px-5 pb-24 lg:px-8 lg:pb-32">
      <div className="hairline shadow-card prose-fersaku mx-auto max-w-[820px] rounded-[30px] border bg-white p-7 sm:p-10 lg:p-14">
        {children}
      </div>
    </section>
  );
}
