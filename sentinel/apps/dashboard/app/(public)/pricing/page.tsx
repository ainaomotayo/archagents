/**
 * Pricing page — three tiers with feature comparison.
 */

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
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Choose the plan that fits your team. Scale as you grow.
          </p>
        </div>

        {/* Tier cards */}
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-8 ${
                tier.highlighted
                  ? "border-indigo-500 bg-slate-900 shadow-lg shadow-indigo-500/10"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}
              <h2 className="text-xl font-bold text-white">{tier.name}</h2>
              <p className="mt-2 text-sm text-slate-400">{tier.description}</p>
              <div className="mt-6">
                <span className="text-4xl font-extrabold text-white">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-sm text-slate-400">{tier.period}</span>
                )}
              </div>
              <a
                href={tier.ctaHref}
                className={`mt-8 block rounded-md px-4 py-3 text-center text-sm font-semibold transition-colors ${
                  tier.highlighted
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                }`}
              >
                {tier.cta}
              </a>

              {/* Feature list */}
              <ul className="mt-8 space-y-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-slate-300"
                  >
                    <span className="mt-0.5 text-indigo-400">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Feature comparison table */}
        <div className="mt-24">
          <h2 className="text-center text-2xl font-bold text-white">
            Feature Comparison
          </h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-3 pr-4 text-left font-medium text-slate-400">
                    Feature
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-slate-400">
                    Starter
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-indigo-400">
                    Professional
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-slate-400">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[
                  ["Security Scanning", "Basic", "Advanced", "Advanced"],
                  ["License Compliance", "Detection", "Full", "Full + Custom"],
                  ["Quality Assessment", "-", "Yes", "Yes"],
                  ["Policy Enforcement", "-", "Yes", "Custom Rules"],
                  ["AI Detection", "-", "Yes", "Yes"],
                  ["Compliance Certificates", "-", "Yes", "Yes + SOC 2"],
                  ["Integrations", "GitHub", "GitHub + Slack", "Custom"],
                  ["Support", "Community", "Priority Email", "Dedicated"],
                  ["Scan History", "7 days", "90 days", "Unlimited"],
                  ["SSO / SAML", "-", "-", "Yes"],
                ].map(([feature, starter, pro, enterprise]) => (
                  <tr key={feature}>
                    <td className="py-3 pr-4 text-slate-300">{feature}</td>
                    <td className="px-4 py-3 text-center text-slate-400">
                      {starter}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-300">
                      {pro}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400">
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
