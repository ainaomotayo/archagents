"use client";

import { useEffect, useState } from "react";
import { IconShieldCheck, IconGithub } from "@/components/icons";

interface ProviderInfo {
  id: string;
  name: string;
}

function ProviderIcon({ id, className }: { id: string; className?: string }) {
  if (id === "github") return <IconGithub className={className} />;
  if (id === "gitlab")
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" />
      </svg>
    );
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

export default function LoginPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data) => setProviders(data))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-surface-0 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-[100px]" />
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-surface-0 to-transparent" />

      <div className="relative w-full max-w-[380px] px-6 animate-fade-up">
        {/* Glow ring */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-b from-accent/15 via-accent/5 to-transparent opacity-60 blur-xl" />

        <div className="relative space-y-8 rounded-2xl border border-border bg-surface-1/90 p-8 backdrop-blur-sm shadow-2xl shadow-surface-0/50">
          {/* Logo & header */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-3 rounded-2xl bg-accent/10 blur-lg" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-accent-subtle border border-border-accent">
                <IconShieldCheck className="h-7 w-7 text-accent" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-wide text-text-primary">
                SENTINEL
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                Sign in to access your governance dashboard
              </p>
            </div>
          </div>

          {/* Providers */}
          <div className="space-y-2.5">
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : providers.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface-0 px-4 py-5 text-center">
                <p className="text-[13px] text-text-secondary">
                  No sign-in providers configured
                </p>
                <p className="mt-1 text-[11px] text-text-tertiary">
                  Set GITHUB_CLIENT_ID to enable authentication
                </p>
              </div>
            ) : (
              providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => {
                    window.location.href = `/api/auth/signin/${provider.id}`;
                  }}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-text-primary px-4 py-3 text-[13px] font-semibold text-surface-0 transition-all hover:bg-text-primary/90 hover:shadow-lg hover:shadow-surface-0/20 focus-ring active:scale-[0.98]"
                >
                  <ProviderIcon
                    id={provider.id}
                    className="h-5 w-5 transition-transform group-hover:scale-110"
                  />
                  Sign in with {provider.name}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="space-y-3 pt-2">
            <div className="h-px bg-border" />
            <p className="text-center text-[11px] leading-relaxed text-text-tertiary">
              Protected by SENTINEL governance platform.
              <br />
              Your data is encrypted and secure.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
