"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-bold text-red-400">Something went wrong</h2>
      <p className="text-sm text-slate-400">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
