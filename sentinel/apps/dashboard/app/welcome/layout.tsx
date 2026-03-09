/**
 * Public layout — minimal wrapper without the dashboard sidebar.
 * Used for marketing pages (landing, pricing, etc.)
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Navigation bar */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-tight text-white">
            SENTINEL
          </a>
          <div className="flex items-center gap-6">
            <a
              href="/pricing"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Pricing
            </a>
            <a
              href="/dashboard"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Dashboard
            </a>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} SENTINEL. Security for AI-generated code.
      </footer>
    </div>
  );
}
