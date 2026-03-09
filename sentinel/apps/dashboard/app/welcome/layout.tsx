import { IconShieldCheck } from "@/components/icons";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-0 text-text-primary">
      {/* Navigation bar */}
      <nav className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle">
              <IconShieldCheck className="h-[18px] w-[18px] text-accent" />
            </div>
            <span className="text-[15px] font-bold tracking-wide text-text-primary">SENTINEL</span>
          </a>
          <div className="flex items-center gap-6">
            <a
              href="/pricing"
              className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Pricing
            </a>
            <a
              href="/dashboard"
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110"
            >
              Dashboard
            </a>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="border-t border-border px-6 py-8 text-center text-[13px] text-text-tertiary">
        &copy; {new Date().getFullYear()} SENTINEL. Security for AI-generated code.
      </footer>
    </div>
  );
}
