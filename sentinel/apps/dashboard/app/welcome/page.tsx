import {
  IconShield,
  IconBarChart,
  IconSearch,
  IconFileText,
  IconActivity,
  IconShieldCheck,
} from "@/components/icons";

const FEATURES = [
  {
    title: "Security Scanning",
    description:
      "Automated detection of vulnerabilities, injection risks, and insecure patterns in AI-generated code.",
    Icon: IconShield,
    accent: "from-status-fail/20 to-transparent",
  },
  {
    title: "License Compliance",
    description:
      "Verify that AI-generated code doesn't introduce license conflicts or IP contamination.",
    Icon: IconFileText,
    accent: "from-status-info/20 to-transparent",
  },
  {
    title: "Quality Assessment",
    description:
      "Evaluate code quality, maintainability, and adherence to best practices before merge.",
    Icon: IconBarChart,
    accent: "from-status-pass/20 to-transparent",
  },
  {
    title: "Policy Enforcement",
    description:
      "Define and enforce organizational policies with configurable rules and approval gates.",
    Icon: IconSearch,
    accent: "from-status-warn/20 to-transparent",
  },
  {
    title: "AI Detection",
    description:
      "Identify AI-generated code segments and track provenance across your codebase.",
    Icon: IconActivity,
    accent: "from-status-running/20 to-transparent",
  },
  {
    title: "Compliance Certification",
    description:
      "Generate audit-ready compliance certificates with full traceability and evidence chains.",
    Icon: IconShieldCheck,
    accent: "from-accent/20 to-transparent",
  },
] as const;

const STATS = [
  { value: "10M+", label: "Lines scanned" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "<2s", label: "Avg scan time" },
  { value: "SOC 2", label: "Certified" },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 text-center sm:py-32">
        {/* Background effects */}
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-[120px]" />
        <div className="absolute left-1/4 top-1/3 h-[300px] w-[300px] rounded-full bg-status-running/5 blur-[100px]" />

        <div className="relative mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-accent bg-accent-subtle px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Now in Beta
            </span>
          </div>
          <h1 className="text-[clamp(2.5rem,5vw,3.75rem)] font-extrabold leading-[1.08] tracking-tight text-text-primary">
            Trust Every Line of
            <br />
            <span className="bg-gradient-to-r from-accent via-status-pass to-accent bg-clip-text text-transparent">
              AI-Generated Code
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-7 text-text-secondary">
            SENTINEL provides automated security scanning, license compliance,
            and quality assessment for AI-generated code. Ship with confidence
            knowing every commit meets your organization&apos;s standards.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/login"
              className="group rounded-xl bg-accent px-8 py-3.5 text-[14px] font-semibold text-text-inverse shadow-lg shadow-accent/20 transition-all hover:brightness-110 hover:shadow-accent/30 hover:shadow-xl active:scale-[0.98]"
            >
              Get Started Free
            </a>
            <a
              href="/welcome/pricing"
              className="rounded-xl border border-border px-8 py-3.5 text-[14px] font-semibold text-text-secondary transition-all hover:border-border-accent hover:text-text-primary"
            >
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <section className="border-y border-border bg-surface-1/50 px-6 py-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                {stat.value}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary">
            Comprehensive AI Code Governance
          </h2>
          <p className="mt-4 text-center text-text-secondary">
            Everything you need to secure and certify AI-generated code at
            scale.
          </p>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-6 transition-all duration-200 hover:border-border-accent hover:bg-surface-2"
              >
                {/* Subtle corner glow */}
                <div
                  className={`absolute -left-8 -top-8 h-24 w-24 rounded-full bg-gradient-radial ${feature.accent} opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative">
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden px-6 py-20 text-center">
        <div className="absolute inset-0 bg-gradient-to-t from-accent/5 to-transparent" />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-text-primary">
            Ready to secure your AI-generated code?
          </h2>
          <p className="mt-4 text-text-secondary">
            Start scanning in minutes. No credit card required.
          </p>
          <a
            href="/login"
            className="mt-8 inline-block rounded-xl bg-accent px-10 py-3.5 text-[14px] font-semibold text-text-inverse shadow-lg shadow-accent/20 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Get Started Free
          </a>
        </div>
      </section>
    </div>
  );
}
