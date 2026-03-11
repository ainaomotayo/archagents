"use client";

import { useEffect, useState } from "react";
import { IconShieldCheck, IconGithub } from "@/components/icons";

interface ProviderInfo {
  id: string;
  name: string;
}

interface DiscoveryResult {
  providers: ProviderInfo[];
  enforced: boolean;
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

async function handleSignIn(providerId: string) {
  const res = await fetch("/api/auth/csrf");
  const { csrfToken } = await res.json();
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/api/auth/signin/${providerId}`;
  const csrf = document.createElement("input");
  csrf.type = "hidden";
  csrf.name = "csrfToken";
  csrf.value = csrfToken;
  const cb = document.createElement("input");
  cb.type = "hidden";
  cb.name = "callbackUrl";
  cb.value = "/";
  form.appendChild(csrf);
  form.appendChild(cb);
  document.body.appendChild(form);
  form.submit();
}

export default function LoginPage() {
  /** All globally configured providers (fetched from NextAuth) */
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([]);
  /** Providers filtered by discovery API for the entered email */
  const [discoveredProviders, setDiscoveredProviders] = useState<
    ProviderInfo[] | null
  >(null);
  /** Whether the org enforces SSO (only discovered providers allowed) */
  const [ssoEnforced, setSsoEnforced] = useState(false);
  /** Loading state for initial provider fetch */
  const [loading, setLoading] = useState(true);
  /** Loading state for discovery API call */
  const [discovering, setDiscovering] = useState(false);
  /** Email entered by user for discovery */
  const [discoveryEmail, setDiscoveryEmail] = useState("");
  /** Error message for discovery */
  const [discoveryError, setDiscoveryError] = useState("");

  // Fetch all globally configured providers on mount
  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data) => setAllProviders(data))
      .catch(() => setAllProviders([]))
      .finally(() => setLoading(false));
  }, []);

  /** The providers to display: discovered (if available) or all */
  const displayProviders =
    discoveredProviders !== null && discoveredProviders.length > 0
      ? discoveredProviders
      : discoveredProviders !== null && ssoEnforced
        ? [] // SSO enforced but no matching providers configured
        : allProviders;

  /** Whether we are in the "show providers" step */
  const showProviders = discoveredProviders !== null;

  async function handleDiscovery(e: React.FormEvent) {
    e.preventDefault();
    const email = discoveryEmail.trim();
    if (!email) return;

    setDiscovering(true);
    setDiscoveryError("");

    try {
      const res = await fetch(
        `/api/auth/discovery?email=${encodeURIComponent(email)}`,
      );

      if (!res.ok) {
        // Fall back to showing all providers
        setDiscoveredProviders([]);
        setSsoEnforced(false);
        return;
      }

      const data: DiscoveryResult = await res.json();

      if (data.providers && data.providers.length > 0) {
        // Filter to only providers that are actually configured globally
        const configuredIds = new Set(allProviders.map((p) => p.id));
        const filtered = data.providers.filter((p) => configuredIds.has(p.id));

        // Use names from the global config for consistency
        const merged = filtered.map((dp) => {
          const global = allProviders.find((gp) => gp.id === dp.id);
          return { id: dp.id, name: dp.name || global?.name || dp.id };
        });

        setDiscoveredProviders(merged.length > 0 ? merged : []);
        setSsoEnforced(data.enforced ?? false);
      } else {
        // Discovery returned no org-specific providers; show all
        setDiscoveredProviders([]);
        setSsoEnforced(data.enforced ?? false);
      }
    } catch {
      // Discovery failed; fall back to all providers
      setDiscoveredProviders([]);
      setSsoEnforced(false);
    } finally {
      setDiscovering(false);
    }
  }

  function handleBack() {
    setDiscoveredProviders(null);
    setSsoEnforced(false);
    setDiscoveryError("");
  }

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
                {showProviders
                  ? `Sign in as ${discoveryEmail}`
                  : "Sign in to access your governance dashboard"}
              </p>
            </div>
          </div>

          {/* Email discovery form or provider buttons */}
          <div className="space-y-2.5">
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : !showProviders ? (
              /* Step 1: Email input for discovery */
              <form onSubmit={handleDiscovery} className="space-y-3">
                <div>
                  <label
                    htmlFor="discovery-email"
                    className="block text-[12px] font-medium text-text-secondary mb-1.5"
                  >
                    Work email
                  </label>
                  <input
                    id="discovery-email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={discoveryEmail}
                    onChange={(e) => setDiscoveryEmail(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-0 px-4 py-3 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </div>
                {discoveryError && (
                  <p className="text-[12px] text-red-400">{discoveryError}</p>
                )}
                <button
                  type="submit"
                  disabled={discovering || !discoveryEmail.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-text-primary px-4 py-3 text-[13px] font-semibold text-surface-0 transition-all hover:bg-text-primary/90 hover:shadow-lg hover:shadow-surface-0/20 focus-ring active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {discovering ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-0 border-t-transparent" />
                  ) : null}
                  Continue
                </button>
              </form>
            ) : displayProviders.length === 0 ? (
              /* No providers available */
              <div className="rounded-lg border border-border bg-surface-0 px-4 py-5 text-center">
                {ssoEnforced ? (
                  <>
                    <p className="text-[13px] text-text-secondary">
                      Your organization requires SSO sign-in
                    </p>
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      The required SSO provider is not configured. Contact your
                      administrator.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-text-secondary">
                      No sign-in providers configured
                    </p>
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      Set GITHUB_CLIENT_ID to enable authentication
                    </p>
                  </>
                )}
              </div>
            ) : (
              /* Step 2: Show discovered/filtered providers */
              displayProviders.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleSignIn(provider.id)}
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

          {/* Back button when showing providers */}
          {showProviders && (
            <div className="flex justify-center">
              <button
                onClick={handleBack}
                className="text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                &larr; Use a different email
              </button>
            </div>
          )}

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
