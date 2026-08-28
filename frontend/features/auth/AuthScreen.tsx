"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Eye,
  EyeOff,
  FlaskConical,
  HeartPulse,
  Home,
  LockKeyhole,
  ReceiptIndianRupee,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";

import { Button, Field, Input } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { authSchema, type AuthFormValues } from "@/features/auth/auth.schema";

const loginHighlights = [
  {
    eyebrow: "Connected clinical care",
    title: "Move every patient journey forward.",
    description:
      "Bring appointments, consultations and patient records together in one coordinated workspace.",
    icon: Stethoscope,
    iconTone: "bg-emerald-100/80 text-emerald-700 ring-emerald-200",
    badgeTone: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
    features: [
      { icon: HeartPulse, label: "OPD, consultations & records" },
      { icon: FlaskConical, label: "Labs, pharmacy & billing" },
    ],
  },
  {
    eyebrow: "Care without boundaries",
    title: "Continue care beyond the clinic.",
    description:
      "Coordinate home-care bookings, visit services and branch teams without losing the patient context.",
    icon: Home,
    iconTone: "bg-sky-100/80 text-sky-700 ring-sky-200",
    badgeTone: "border-sky-200 bg-sky-50/80 text-sky-700",
    features: [
      { icon: Home, label: "Home care & visit workflows" },
      { icon: Building2, label: "Ready for every branch" },
    ],
  },
  {
    eyebrow: "Clear operational insight",
    title: "Turn daily work into better decisions.",
    description:
      "Track collections, workloads and service activity while every role sees only what it needs.",
    icon: BarChart3,
    iconTone: "bg-violet-100/80 text-violet-700 ring-violet-200",
    badgeTone: "border-violet-200 bg-violet-50/80 text-violet-700",
    features: [
      { icon: ReceiptIndianRupee, label: "Revenue & operations reporting" },
      { icon: ShieldCheck, label: "Permission-aware access" },
    ],
  },
];

export function AuthScreen({
  onLogin,
}: {
  onLogin: (data: AuthFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { identifier: "", password: "" },
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState(0);
  const [highlightPaused, setHighlightPaused] = useState(false);

  useEffect(() => {
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (highlightPaused || reducedMotion) return undefined;

    const timer = window.setInterval(() => {
      setActiveHighlight((current) => (current + 1) % loginHighlights.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [highlightPaused]);

  const submit = async (data: AuthFormValues) => {
    setError("");
    setLoading(true);
    try {
      await onLogin(data);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f7f9] px-4 py-4 text-slate-900 sm:px-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-60 w-60 rounded-full bg-slate-200/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-sky-100/60 blur-3xl" />

      <div className="relative grid w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_22px_55px_-32px_rgba(15,23,42,0.38)] lg:grid-cols-[.88fr_1.12fr]">
        <section
          className="relative hidden overflow-hidden border-r border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/60 p-6 lg:flex lg:flex-col"
          onMouseEnter={() => setHighlightPaused(true)}
          onMouseLeave={() => setHighlightPaused(false)}
        >
          <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full bg-emerald-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-[size:28px_28px] opacity-50" />

          <div className="relative inline-flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-fg shadow-lg shadow-emerald-900/15">
              <HeartPulse size={21} />
            </span>
            <div>
              <p className="font-black text-slate-950">MedizinHub HMS</p>
              <p className="text-xs text-slate-500">Healthcare Workspace</p>
            </div>
          </div>

          <div className="relative mt-5 min-h-[270px] flex-1">
            {loginHighlights.map((highlight, index) => {
              const HighlightIcon = highlight.icon;
              const active = activeHighlight === index;

              return (
                <article
                  key={highlight.eyebrow}
                  data-testid={`login-highlight-${index}`}
                  data-active={active ? "true" : "false"}
                  aria-hidden={!active}
                  className={`absolute inset-0 flex flex-col transition-all duration-700 ease-out ${
                    active
                      ? "translate-x-0 opacity-100"
                      : "pointer-events-none translate-x-4 opacity-0"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-lg ring-1 backdrop-blur-md ${highlight.iconTone}`}
                    >
                      <HighlightIcon size={16} />
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide backdrop-blur-md ${highlight.badgeTone}`}
                    >
                      {highlight.eyebrow}
                    </span>
                  </div>

                  <h1 className="mt-3 text-[1.35rem] font-black leading-tight tracking-tight text-slate-950">
                    {highlight.title}
                  </h1>
                  <p className="mt-2 text-[13px] leading-5 text-slate-600">
                    {highlight.description}
                  </p>

                  <div className="mt-auto grid gap-2 pt-3">
                    {highlight.features.map(({ icon: FeatureIcon, label }) => (
                      <div
                        key={label}
                        className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/65 px-3 py-2 shadow-sm ring-1 ring-slate-200/70 backdrop-blur-xl"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/90 text-brand shadow-sm">
                          <FeatureIcon size={15} />
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="relative mt-4 flex items-center justify-center border-t border-white/80 pt-3">
            <div className="flex items-center gap-1.5" aria-label="Login highlights">
              {loginHighlights.map((highlight, index) => (
                <button
                  key={highlight.eyebrow}
                  type="button"
                  onClick={() => setActiveHighlight(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    activeHighlight === index
                      ? "w-7 bg-brand"
                      : "w-2 bg-slate-300 hover:bg-slate-400"
                  }`}
                  aria-label={`Show highlight ${index + 1}: ${highlight.eyebrow}`}
                  aria-current={activeHighlight === index ? "true" : undefined}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center px-5 py-7 sm:px-8 lg:px-9">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-fg">
                <HeartPulse size={21} />
              </span>
              <div>
                <p className="font-black text-slate-950">MedizinHub HMS</p>
                <p className="text-xs text-slate-500">Healthcare Workspace</p>
              </div>
            </div>

            <div className="mb-5">
              <span className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-success-subtle text-brand ring-1 ring-emerald-100">
                <LockKeyhole size={18} />
              </span>
              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Sign in using your username or email.
              </p>
            </div>

            <form onSubmit={handleSubmit(submit)} className="grid gap-3.5">
              <Field label="Username or email">
                <div className="relative">
                  <UserRound
                    aria-hidden="true"
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    autoComplete="username"
                    placeholder="username or name@clinic.com"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 pr-3 text-sm focus:bg-white"
                    {...register("identifier")}
                  />
                </div>
                {errors.identifier && (
                  <p className="mt-1 text-xs font-semibold text-red-500">
                    {errors.identifier.message}
                  </p>
                )}
              </Field>

              <Field label="Password">
                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 pr-11 text-sm focus:bg-white"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-200/70"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs font-semibold text-red-500">
                    {errors.password.message}
                  </p>
                )}
              </Field>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                >
                  {error}
                </div>
              )}

              <Button
                disabled={loading}
                className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm shadow-md shadow-emerald-900/10"
              >
                <ButtonLoader loading={loading}>
                  <span>{loading ? "Signing in..." : "Sign in"}</span>
                  {!loading && <ArrowRight size={17} />}
                </ButtonLoader>
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-500">
              <ShieldCheck size={14} className="text-brand" />
              Protected by secure, role-based access
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
