"use client";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">SENTINEL</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to access the dashboard
          </p>
        </div>

        <button
          onClick={() => {
            // In production this calls signIn("github") from next-auth/react
            window.location.href = "/api/auth/signin/github";
          }}
          className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 transition-colors"
        >
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}
