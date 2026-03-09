"use client";

import { IconAlertTriangle } from "@/components/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-status-fail/15">
        <IconAlertTriangle className="h-6 w-6 text-status-fail" />
      </div>
      <h2 className="text-lg font-bold text-text-primary">Something went wrong</h2>
      <p className="text-[13px] text-text-secondary">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg border border-border bg-surface-2 px-5 py-2.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-3 focus-ring"
      >
        Try again
      </button>
    </div>
  );
}
