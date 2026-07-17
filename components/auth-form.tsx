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
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  hasForbiddenTokenInLocation,
  parseAuthFragmentToken,
  scrubUrlFragment,
  toMfaVerifyRequest,
  toPasswordResetRequest,
  toSellerForgotPasswordRequest,
  toSellerLoginRequest,
  toSellerRegisterRequest,
  useMfaVerifyMutation,
  usePasswordResetMutation,
  useSellerForgotPasswordMutation,
  useSellerLoginMutation,
  useSellerRegisterMutation,
  type SellerAuthField,
} from "@/features/auth";
import { getDomainSource } from "@/shared/data/domain-source";

const schema = z.object({
  name: z.string().min(2, "Nama terlalu pendek").optional(),
  email: z.email("Masukkan email yang valid"),
  password: z.string().min(8, "Minimal 8 karakter"),
});
type Values = z.infer<typeof schema>;

type Ceremony =
  | { kind: "idle" }
  | { kind: "mfa_pending" }
  | { kind: "reset"; token: string }
  | { kind: "reset_done" };

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [show, setShow] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("asep@email.com");
  const [ceremony, setCeremony] = useState<Ceremony>({ kind: "idle" });
  const [mfaCode, setMfaCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetFieldError, setResetFieldError] = useState<string | null>(null);
  const [mfaFieldError, setMfaFieldError] = useState<string | null>(null);
  const fragmentBootstrapped = useRef(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const registerMutation = useSellerRegisterMutation();
  const loginMutation = useSellerLoginMutation();
  const forgotMutation = useSellerForgotPasswordMutation();
  const mfaVerifyMutation = useMfaVerifyMutation();
  const passwordResetMutation = usePasswordResetMutation();

  // AUT-120: password-reset fragment on /login — scrub then typed POST exchange.
  useEffect(() => {
    if (mode !== "login" || fragmentBootstrapped.current) return;
    fragmentBootstrapped.current = true;
    if (typeof window === "undefined") return;

    if (
      hasForbiddenTokenInLocation({
        search: window.location.search,
        pathname: window.location.pathname,
      })
    ) {
      scrubUrlFragment();
      return;
    }

    const token = parseAuthFragmentToken(window.location.hash);
    scrubUrlFragment();
    if (token) {
      queueMicrotask(() => {
        setCeremony({ kind: "reset", token });
        setResetOpen(false);
      });
    }
  }, [mode]);

  const pending =
    isSubmitting ||
    registerMutation.isPending ||
    loginMutation.isPending ||
    forgotMutation.isPending ||
    mfaVerifyMutation.isPending ||
    passwordResetMutation.isPending;

  const applyFieldErrors = (
    fields: Array<{ field: SellerAuthField; message: string }>,
  ) => {
    for (const item of fields) {
      setError(item.field, { type: "server", message: item.message });
    }
  };

  const submit = async (values: Values) => {
    if (mode === "register") {
      const dto = toSellerRegisterRequest({
        email: values.email,
        password: values.password,
        name: values.name,
      });
      const result = await registerMutation.mutateAsync(dto);
      if (!result.ok) {
        if (result.kind === "field_errors") applyFieldErrors(result.fields);
        // blocked / generic: no new surface (UXE-011); stay on form.
        return;
      }
      // API: register does not issue a session (verify-email first) → login.
      // Mock: preserve existing prototype path to onboarding.
      if (getDomainSource("auth") === "mock") {
        router.push("/dashboard/onboarding");
      } else {
        router.push("/login");
      }
      return;
    }

    const dto = toSellerLoginRequest({
      email: values.email,
      password: values.password,
    });
    const result = await loginMutation.mutateAsync({
      ...dto,
      returnTo,
    });
    if (!result.ok) {
      if (result.kind === "field_errors") applyFieldErrors(result.fields);
      return;
    }
    if (result.kind === "mfa_pending") {
      // MFA_PENDING: stay on login; collect code via existing Field geometry.
      setCeremony({ kind: "mfa_pending" });
      setMfaCode("");
      setMfaFieldError(null);
      return;
    }
    router.push(result.redirectTo);
  };

  const submitMfa = async () => {
    const code = mfaCode.trim();
    if (!code) return;
    setMfaFieldError(null);
    const result = await mfaVerifyMutation.mutateAsync({
      ...toMfaVerifyRequest({ code }),
      returnTo,
      surface: "seller",
    });
    if (!result.ok) {
      if (result.kind === "invalid_code") {
        setMfaFieldError("Kode tidak valid. Coba lagi.");
      }
      // blocked: stay without inventing panels (UXE-011).
      return;
    }
    if (result.redirectTo) {
      router.push(result.redirectTo);
    }
  };

  const submitPasswordReset = async () => {
    if (ceremony.kind !== "reset") return;
    if (newPassword.length < 8) {
      setResetFieldError("Minimal 8 karakter");
      return;
    }
    setResetFieldError(null);
    const result = await passwordResetMutation.mutateAsync(
      toPasswordResetRequest({
        token: ceremony.token,
        newPassword,
      }),
    );
    if (!result.ok) {
      if (result.kind === "field_errors" && result.fields[0]) {
        setResetFieldError(result.fields[0].message);
        return;
      }
      if (result.kind === "invalid_token") {
        setResetFieldError("Link tidak valid atau sudah kedaluwarsa.");
        return;
      }
      return;
    }
    setCeremony({ kind: "reset_done" });
    setNewPassword("");
  };

  const sendReset = async () => {
    if (!resetEmail.includes("@")) return;
    const result = await forgotMutation.mutateAsync(
      toSellerForgotPasswordRequest({ email: resetEmail }),
    );
    if (result.ok) {
      setResetSent(true);
      return;
    }
    // blocked / field errors: keep dialog open without inventing panels.
    if (result.kind === "field_errors" && result.fields[0]) {
      // Reuse existing email input only — no error DOM added.
      setResetEmail(resetEmail);
    }
  };

  if (ceremony.kind === "reset" || ceremony.kind === "reset_done") {
    return (
      <div className="mt-8 grid gap-4">
        {ceremony.kind === "reset_done" ? (
          <div className="py-2 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#e7f6ec] text-[#238150]">
              <CheckCircle2 className="size-6" />
            </span>
            <h2 className="mt-5 text-lg font-extrabold">Password diperbarui.</h2>
            <p className="mt-2 text-[10px] leading-5 text-[#718078]">
              Silakan masuk dengan password baru.
            </p>
            <button
              type="button"
              onClick={() => setCeremony({ kind: "idle" })}
              className="mt-6 h-12 w-full rounded-xl bg-[#173f2c] text-sm font-extrabold text-white"
            >
              Kembali ke login
            </button>
          </div>
        ) : (
          <>
            <Field label="Password baru" error={resetFieldError ?? undefined}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="ring-focus hairline h-12 w-full rounded-xl border bg-white px-4 text-sm outline-none"
                autoComplete="new-password"
              />
            </Field>
            <button
              type="button"
              disabled={pending || newPassword.length < 8}
              onClick={() => {
                void submitPasswordReset();
              }}
              className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white transition hover:bg-[#0e3020] disabled:opacity-60"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <>
                  Simpan password baru
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </>
        )}
      </div>
    );
  }

  if (ceremony.kind === "mfa_pending") {
    return (
      <div className="mt-8 grid gap-4">
        <Field
          label="Kode autentikator"
          error={mfaFieldError ?? undefined}
        >
          <input
            value={mfaCode}
            onChange={(e) =>
              setMfaCode(e.target.value.replace(/\s/g, "").slice(0, 12))
            }
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="ring-focus hairline h-12 w-full rounded-xl border bg-white px-4 text-sm outline-none"
          />
        </Field>
        <button
          type="button"
          disabled={pending || mfaCode.trim().length < 6}
          onClick={() => {
            void submitMfa();
          }}
          className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white transition hover:bg-[#0e3020] disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <>
              Verifikasi MFA
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    );
  }

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
          disabled={pending}
          className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white transition hover:bg-[#0e3020] disabled:opacity-60"
        >
          {pending ? (
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
                  disabled={!resetEmail.includes("@") || forgotMutation.isPending}
                  onClick={() => {
                    void sendReset();
                  }}
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
