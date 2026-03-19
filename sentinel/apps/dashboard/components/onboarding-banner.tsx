import Link from "next/link";
import { IconShield } from "@/components/icons";

interface OnboardingBannerProps {
  orgName?: string;
}

const STEPS = [
  { num: "①", label: "Connect a repo" },
  { num: "②", label: "Run a scan" },
  { num: "③", label: "Review results" },
];

export function OnboardingBanner({ orgName }: OnboardingBannerProps) {
  const headline = orgName ? `Welcome, ${orgName}` : "Welcome to SENTINEL";

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6 relative overflow-hidden">
      {/* Accent glow overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-accent/5 to-transparent pointer-events-none" />
      {/* Left border accent */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-l-xl" />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: icon + headline + tagline */}
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-accent/10 p-2.5">
            <IconShield className="h-10 w-10 text-accent" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-text-primary">{headline}</h2>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              AI-powered code governance for your engineering org
            </p>
          </div>
        </div>

        {/* Center: three-step pipeline */}
        <div className="flex items-center gap-2 sm:gap-3">
          {STEPS.map((step, idx) => (
            <div key={step.num} className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                  {step.num}
                </span>
                <span className="text-[12px] font-medium text-text-secondary whitespace-nowrap">
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <span className="text-[12px] text-text-tertiary select-none">→</span>
              )}
            </div>
          ))}
        </div>

        {/* Right: CTAs */}
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <Link
            href="/settings/vcs"
            className="inline-block rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Connect your first repository →
          </Link>
          <Link
            href="#"
            className="text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Learn how it works
          </Link>
        </div>
      </div>
    </div>
  );
}
