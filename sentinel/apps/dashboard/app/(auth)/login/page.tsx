"use client";

import { IconShieldCheck, IconGithub } from "@/components/icons";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 grid-pattern">
      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Glow effect */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-accent/20 to-transparent opacity-50 blur-xl" />

        <div className="relative space-y-8 rounded-2xl border border-border bg-surface-1 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle border border-border-accent">
              <IconShieldCheck className="h-6 w-6 text-accent" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-wide text-text-primary">SENTINEL</h1>
              <p className="mt-1 text-[13px] text-text-secondary">
                Sign in to access your governance dashboard
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              window.location.href = "/api/auth/signin/github";
            }}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-text-primary px-4 py-3 text-[13px] font-semibold text-surface-0 transition-all hover:opacity-90 focus-ring"
          >
            <IconGithub className="h-5 w-5" />
            Sign in with GitHub
          </button>

          <p className="text-center text-[11px] text-text-tertiary">
            Enterprise SSO available on the Enterprise plan
          </p>
        </div>
      </div>
    </div>
  );
}
