const TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "For individual developers and small open-source projects.",
    cta: "Get Started",
    ctaHref: "/dashboard",
    highlighted: false,
    features: [
      "Up to 3 projects",
      "Basic security scanning",
      "License detection",
      "Community support",
      "Public repositories only",
      "7-day scan history",
    ],
  },
  {
    name: "Professional",
    price: "$99",
    period: "/mo",
    description: "For teams shipping AI-generated code in production.",
    cta: "Start Free Trial",
    ctaHref: "/dashboard",
    highlighted: true,
    features: [
      "Unlimited projects",
      "Advanced security scanning",
      "Full license compliance",
      "Quality assessment",
      "Policy enforcement",
      "AI detection",
      "Compliance certificates",
      "Slack & GitHub integration",
      "90-day scan history",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    price: "Contact",
    period: "",
    description: "For organizations with advanced compliance and governance needs.",
    cta: "Contact Sales",
    ctaHref: "mailto:sales@sentinel.dev",
    highlighted: false,
    features: [
      "Everything in Professional",
      "SOC 2 audit support",
      "EU AI Act compliance",
      "Custom policy rules",
      "SSO / SAML",
      "Self-hosted deployment",
      "Unlimited scan history",
      "Dedicated support",
      "SLA guarantees",
      "Custom integrations",
    ],
  },
] as const;

export default function PricingPage() {
  return (
    <div className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-text-primary sm:text-5xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 text-lg text-text-secondary">
            Choose the plan that fits your team. Scale as you grow.
          </p>
        </div>

        {/* Tier cards */}
        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-8 transition-all ${
                tier.highlighted
                  ? "border-accent bg-surface-1 shadow-xl shadow-accent/10"
                  : "border-border bg-surface-1 hover:border-border-accent"
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-text-inverse">
                  Most Popular
                </span>
              )}
              <h2 className="text-xl font-bold text-text-primary">{tier.name}</h2>
              <p className="mt-2 text-[13px] text-text-secondary">{tier.description}</p>
              <div className="mt-6">
                <span className="text-4xl font-extrabold text-text-primary">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-[13px] text-text-tertiary">{tier.period}</span>
                )}
              </div>
              <a
                href={tier.ctaHref}
                className={`mt-8 block rounded-xl px-4 py-3 text-center text-[13px] font-semibold transition-all ${
                  tier.highlighted
                    ? "bg-accent text-text-inverse shadow-lg shadow-accent/20 hover:brightness-110"
                    : "border border-border text-text-secondary hover:border-border-accent hover:text-text-primary"
                }`}
              >
                {tier.cta}
              </a>

              <ul className="mt-8 space-y-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-[13px] text-text-secondary"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                      &#10003;
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Feature comparison table */}
        <div className="mt-24">
          <h2 className="text-center text-2xl font-bold text-text-primary">
            Feature Comparison
          </h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                    Feature
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                    Starter
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-accent">
                    Professional
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {[
                  ["Security Scanning", "Basic", "Advanced", "Advanced"],
                  ["License Compliance", "Detection", "Full", "Full + Custom"],
                  ["Quality Assessment", "\u2014", "Yes", "Yes"],
                  ["Policy Enforcement", "\u2014", "Yes", "Custom Rules"],
                  ["AI Detection", "\u2014", "Yes", "Yes"],
                  ["Compliance Certificates", "\u2014", "Yes", "Yes + SOC 2"],
                  ["Integrations", "GitHub", "GitHub + Slack", "Custom"],
                  ["Support", "Community", "Priority Email", "Dedicated"],
                  ["Scan History", "7 days", "90 days", "Unlimited"],
                  ["SSO / SAML", "\u2014", "\u2014", "Yes"],
                ].map(([feature, starter, pro, enterprise]) => (
                  <tr key={feature} className="table-row-hover transition-colors">
                    <td className="py-3.5 pr-4 text-text-primary">{feature}</td>
                    <td className="px-4 py-3.5 text-center text-text-tertiary">
                      {starter}
                    </td>
                    <td className="px-4 py-3.5 text-center text-text-secondary">
                      {pro}
                    </td>
                    <td className="px-4 py-3.5 text-center text-text-tertiary">
                      {enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
