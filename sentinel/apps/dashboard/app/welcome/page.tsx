import { IconShield, IconBarChart, IconSearch, IconFileText, IconActivity, IconShieldCheck } from "@/components/icons";

const FEATURES = [
  {
    title: "Security Scanning",
    description:
      "Automated detection of vulnerabilities, injection risks, and insecure patterns in AI-generated code.",
    Icon: IconShield,
  },
  {
    title: "License Compliance",
    description:
      "Verify that AI-generated code doesn't introduce license conflicts or IP contamination.",
    Icon: IconFileText,
  },
  {
    title: "Quality Assessment",
    description:
      "Evaluate code quality, maintainability, and adherence to best practices before merge.",
    Icon: IconBarChart,
  },
  {
    title: "Policy Enforcement",
    description:
      "Define and enforce organizational policies with configurable rules and approval gates.",
    Icon: IconSearch,
  },
  {
    title: "AI Detection",
    description:
      "Identify AI-generated code segments and track provenance across your codebase.",
    Icon: IconActivity,
  },
  {
    title: "Compliance Certification",
    description:
      "Generate audit-ready compliance certificates with full traceability and evidence chains.",
    Icon: IconShieldCheck,
  },
] as const;

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-28 text-center">
        {/* Background grid */}
        <div className="absolute inset-0 grid-pattern opacity-40" />
        {/* Radial glow */}
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-3xl" />

        <div className="relative mx-auto max-w-3xl">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border-accent bg-accent-subtle px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Now in Beta</span>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-text-primary sm:text-6xl leading-[1.1]">
            Trust Every Line of
            <span className="text-accent"> AI-Generated Code</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-text-secondary max-w-2xl mx-auto">
            SENTINEL provides automated security scanning, license compliance,
            and quality assessment for AI-generated code. Ship with confidence
            knowing every commit meets your organization&apos;s standards.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="rounded-xl bg-accent px-8 py-3.5 text-[14px] font-semibold text-text-inverse shadow-lg shadow-accent/20 transition-all hover:brightness-110 hover:shadow-accent/30"
            >
              Get Started
            </a>
            <a
              href="/pricing"
              className="rounded-xl border border-border px-8 py-3.5 text-[14px] font-semibold text-text-secondary transition-all hover:border-border-accent hover:text-text-primary"
            >
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary">
            Comprehensive AI Code Governance
          </h2>
          <p className="mt-4 text-center text-text-secondary">
            Everything you need to secure and certify AI-generated code at scale.
          </p>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-surface-1 p-6 transition-all duration-200 hover:border-border-accent hover:bg-surface-2"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle border border-border-accent">
                  <feature.Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="text-[15px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
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
          <h2 className="text-3xl font-bold tracking-tight text-text-primary">
            Ready to secure your AI-generated code?
          </h2>
          <p className="mt-4 text-text-secondary">
            Start scanning in minutes. No credit card required.
          </p>
          <a
            href="/dashboard"
            className="mt-8 inline-block rounded-xl bg-accent px-10 py-3.5 text-[14px] font-semibold text-text-inverse shadow-lg shadow-accent/20 transition-all hover:brightness-110"
          >
            Get Started
          </a>
        </div>
      </section>
    </div>
  );
}
