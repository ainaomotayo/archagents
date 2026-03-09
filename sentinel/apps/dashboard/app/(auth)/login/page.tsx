"use client";

import { useEffect, useState } from "react";
import { IconShieldCheck, IconGithub } from "@/components/icons";

interface ProviderInfo {
  id: string;
  name: string;
}

function ProviderIcon({ id, className }: { id: string; className?: string }) {
  if (id === "github") return <IconGithub className={className} />;
  if (id === "gitlab") return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" />
    </svg>
  );
  // Key icon for OIDC/SAML
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <div className="flex min-h-screen items-center justify-center bg-surface-0 grid-pattern">
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-accent/20 to-transparent opacity-50 blur-xl" />

        <div className="relative space-y-8 rounded-2xl border border-border bg-surface-1 p-8">
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

          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : providers.length === 0 ? (
              <p className="text-center text-[13px] text-text-secondary">
                No sign-in providers configured
              </p>
            ) : (
              providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => {
                    window.location.href = `/api/auth/signin/${provider.id}`;
                  }}
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-text-primary px-4 py-3 text-[13px] font-semibold text-surface-0 transition-all hover:opacity-90 focus-ring"
                >
                  <ProviderIcon id={provider.id} className="h-5 w-5" />
                  Sign in with {provider.name}
                </button>
              ))
            )}
          </div>

          <p className="text-center text-[11px] text-text-tertiary">
            Protected by SENTINEL governance platform
          </p>
        </div>
      </div>
    </div>
  );
}
