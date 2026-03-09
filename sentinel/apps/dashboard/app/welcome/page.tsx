/**
 * Landing / marketing page for SENTINEL.
 */

const FEATURES = [
  {
    title: "Security Scanning",
    description:
      "Automated detection of vulnerabilities, injection risks, and insecure patterns in AI-generated code.",
    icon: "shield",
  },
  {
    title: "License Compliance",
    description:
      "Verify that AI-generated code doesn't introduce license conflicts or IP contamination.",
    icon: "scale",
  },
  {
    title: "Quality Assessment",
    description:
      "Evaluate code quality, maintainability, and adherence to best practices before merge.",
    icon: "sparkles",
  },
  {
    title: "Policy Enforcement",
    description:
      "Define and enforce organizational policies with configurable rules and approval gates.",
    icon: "lock",
  },
  {
    title: "AI Detection",
    description:
      "Identify AI-generated code segments and track provenance across your codebase.",
    icon: "cpu",
  },
  {
    title: "Compliance Certification",
    description:
      "Generate audit-ready compliance certificates with full traceability and evidence chains.",
    icon: "badge",
  },
] as const;

const ICON_MAP: Record<string, string> = {
  shield: "\u{1F6E1}",
  scale: "\u{2696}",
  sparkles: "\u{2728}",
  lock: "\u{1F512}",
  cpu: "\u{1F9E0}",
  badge: "\u{1F3C5}",
};

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            Trust Every Line of
            <span className="text-indigo-400"> AI-Generated Code</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-400">
            SENTINEL provides automated security scanning, license compliance,
            and quality assessment for AI-generated code. Ship with confidence
            knowing every commit meets your organization&apos;s standards.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              Get Started
            </a>
            <a
              href="/pricing"
              className="rounded-md border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
            >
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-white">
            Comprehensive AI Code Governance
          </h2>
          <p className="mt-4 text-center text-slate-400">
            Everything you need to secure and certify AI-generated code at scale.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-slate-800 bg-slate-900 p-6 hover:border-slate-700 transition-colors"
              >
                <div className="mb-4 text-3xl">
                  {ICON_MAP[feature.icon] ?? ""}
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold text-white">
            Ready to secure your AI-generated code?
          </h2>
          <p className="mt-4 text-slate-400">
            Start scanning in minutes. No credit card required.
          </p>
          <a
            href="/dashboard"
            className="mt-8 inline-block rounded-md bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            Get Started
          </a>
        </div>
      </section>
    </div>
  );
}
