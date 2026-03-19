import Link from "next/link";
import type { ComponentType } from "react";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  headline: string;
  body?: string;
  cta?: { label: string; href: string };
  secondaryLink?: { label: string; href: string };
  variant?: "default" | "success";
}

export function EmptyState({
  icon: Icon,
  headline,
  body,
  cta,
  secondaryLink,
  variant = "default",
}: EmptyStateProps) {
  const isSuccess = variant === "success";
  return (
    <div
      className={`flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-surface-1 ${
        isSuccess ? "border-status-pass/20" : "border-border"
      }`}
    >
      <div className="flex flex-col items-center text-center px-6 py-12 max-w-sm">
        <div
          className={`mb-5 flex h-14 w-14 items-center justify-center rounded-xl ring-2 ring-offset-2 ring-offset-surface-1 ${
            isSuccess
              ? "bg-status-pass/10 ring-status-pass/20 text-status-pass"
              : "bg-surface-2 ring-border text-text-tertiary"
          }`}
        >
          <Icon className="h-7 w-7" />
        </div>
        <p className="text-[15px] font-semibold text-text-primary">{headline}</p>
        {body && (
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">{body}</p>
        )}
        {cta && (
          <Link
            href={cta.href}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-110 focus-ring"
          >
            {cta.label}
            <span aria-hidden>→</span>
          </Link>
        )}
        {secondaryLink && (
          <a
            href={secondaryLink.href}
            className="mt-3 text-[12px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {secondaryLink.label}
          </a>
        )}
      </div>
    </div>
  );
}
