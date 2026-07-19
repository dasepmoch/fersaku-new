import {
  FileCheck2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
} from "lucide-react";
import { ContentPage } from "@/components/content-page";

export default function SecurityPage() {
  const controls = [
    [
      LockKeyhole,
      "Encryption",
      "TLS in transit and encrypted provider credentials.",
    ],
    [
      Fingerprint,
      "Access control",
      "RBAC, MFA requirements, and audited privileged actions.",
    ],
    [
      KeyRound,
      "Secret handling",
      "Raw API keys shown once and stored as secure hashes.",
    ],
    [
      FileCheck2,
      "Auditability",
      "Immutable context for sensitive seller and admin events.",
    ],
    [
      Server,
      "Infrastructure",
      "Isolated environments, queue controls, and provider abstraction.",
    ],
    [
      ShieldCheck,
      "Payment safety",
      "Verified signatures and idempotent fulfillment patterns.",
    ],
  ];
  return (
    <ContentPage
      eyebrow="Security at Fersaku"
      title={
        <>
          Kepercayaan dibangun dari <em className="text-[#315d47]">detail.</em>
        </>
      }
      description="Cara kami merancang akses, pembayaran, data, delivery, dan operasi platform agar aman sejak awal."
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-[1080px]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {controls.map(([Icon, t, d]) => (
              <div
                key={t as string}
                className="hairline shadow-card rounded-[26px] border bg-white p-6"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-[#e9ff9b]">
                  <Icon className="size-4" />
                </span>
                <h3 className="mt-8 text-sm font-extrabold">{t as string}</h3>
                <p className="mt-2 text-xs leading-6 text-[#718078]">
                  {d as string}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-5 rounded-[34px] bg-[#173f2c] p-8 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:p-12">
            <div>
              <h2 className="font-display text-5xl">
                Menemukan celah keamanan?
              </h2>
              <p className="mt-3 text-xs leading-6 text-white/50">
                Laporkan secara bertanggung jawab. Jangan mengakses atau
                mengubah data pengguna lain.
              </p>
            </div>
            <a
              href="mailto:security@fersaku.id"
              className="rounded-full bg-[#d7ff64] px-6 py-3 text-center text-xs font-extrabold text-[#173f2c]"
            >
              security@fersaku.id
            </a>
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
