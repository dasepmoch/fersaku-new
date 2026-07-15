"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Nama terlalu pendek").optional(),
  email: z.email("Masukkan email yang valid"),
  password: z.string().min(8, "Minimal 8 karakter"),
});
type Values = z.infer<typeof schema>;

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("asep@email.com");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const submit = async () => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    router.push(mode === "register" ? "/dashboard/onboarding" : "/dashboard");
  };

  return (
    <>
      <form onSubmit={handleSubmit(submit)} className="mt-8 grid gap-4">
        {mode === "register" && (
          <Field label="Nama lengkap" error={errors.name?.message}>
            <input
              {...register("name")}
              placeholder="Asep Kurnia"
              className="ring-focus hairline h-12 w-full rounded-xl border bg-white px-4 text-sm outline-none"
            />
          </Field>
        )}
        <Field label="Email" error={errors.email?.message}>
          <input
            {...register("email")}
            type="email"
            placeholder="asep@email.com"
            className="ring-focus hairline h-12 w-full rounded-xl border bg-white px-4 text-sm outline-none"
          />
        </Field>
        <Field
          label="Password"
          error={errors.password?.message}
          action={
            mode === "login" ? (
              <button
                type="button"
                onClick={() => {
                  setResetOpen(true);
                  setResetSent(false);
                }}
                className="text-[11px] font-bold text-[#315d47]"
              >
                Lupa password?
              </button>
            ) : undefined
          }
        >
          <div className="relative">
            <input
              {...register("password")}
              type={show ? "text" : "password"}
              placeholder={
                mode === "login" ? "Password kamu" : "Minimal 8 karakter"
              }
              className="ring-focus hairline h-12 w-full rounded-xl border bg-white px-4 pr-12 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute top-1/2 right-4 -translate-y-1/2 text-[#7b8780]"
            >
              {show ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </Field>
        <button
          disabled={isSubmitting}
          className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white transition hover:bg-[#0e3020] disabled:opacity-60"
        >
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <>
              {mode === "login" ? "Masuk ke Fersaku" : "Buat akun gratis"}
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
        {mode === "register" && (
          <p className="text-center text-[10px] leading-4 text-[#88928c]">
            Dengan mendaftar, kamu menyetujui Ketentuan Layanan dan Kebijakan
            Privasi Fersaku.
          </p>
        )}
      </form>

      {resetOpen && (
        <div className="fixed inset-0 z-[160] grid place-items-center bg-[#07110c]/70 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-[26px] bg-[#fbfaf7] p-6 shadow-2xl">
            {resetSent ? (
              <div className="py-6 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#e7f6ec] text-[#238150]">
                  <CheckCircle2 className="size-6" />
                </span>
                <h2 className="mt-5 text-lg font-extrabold">
                  Link reset dikirim.
                </h2>
                <p className="mt-2 text-[10px] leading-5 text-[#718078]">
                  Periksa inbox {resetEmail}. Link mock berlaku selama 30 menit.
                </p>
                <button
                  onClick={() => setResetOpen(false)}
                  className="mt-6 h-10 w-full rounded-xl bg-[#173f2c] text-[9px] font-extrabold text-white"
                >
                  Kembali ke login
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#e9ff9b] text-[#173f2c]">
                    <Mail className="size-5" />
                  </span>
                  <button
                    onClick={() => setResetOpen(false)}
                    className="ml-auto"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <h2 className="mt-5 text-lg font-extrabold">Reset password</h2>
                <p className="mt-2 text-[10px] leading-5 text-[#718078]">
                  Masukkan email akun. Fersaku akan mengirim link reset tanpa
                  mengungkap apakah email terdaftar.
                </p>
                <label className="mt-5 grid gap-2 text-[9px] font-bold">
                  Email
                  <input
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    type="email"
                    className="hairline h-11 rounded-xl border bg-white px-3 text-xs outline-none"
                  />
                </label>
                <button
                  disabled={!resetEmail.includes("@")}
                  onClick={() => setResetSent(true)}
                  className="mt-5 h-11 w-full rounded-xl bg-[#173f2c] text-[9px] font-extrabold text-white disabled:opacity-40"
                >
                  Kirim link reset mock
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  error,
  action,
  children,
}: {
  label: string;
  error?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex justify-between text-xs font-bold">
        {label}
        {action}
      </span>
      {children}
      {error && (
        <span className="text-[11px] font-semibold text-[#c3543b]">
          {error}
        </span>
      )}
    </label>
  );
}
