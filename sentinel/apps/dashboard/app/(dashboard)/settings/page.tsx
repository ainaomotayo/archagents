import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { IconGlobe, IconUser, IconShield, IconActivity, IconBell } from "@/components/icons";

const SETTINGS_SECTIONS = [
  {
    title: "Webhooks",
    description: "Configure webhook endpoints for scan events and alerts.",
    href: "/settings/webhooks",
    Icon: IconGlobe,
  },
  {
    title: "Team Members",
    description: "Manage users, roles, and access permissions.",
    href: "/settings/webhooks",
    Icon: IconUser,
    badge: "Coming soon",
  },
  {
    title: "API Tokens",
    description: "Create and manage API tokens for CI/CD integration.",
    href: "/settings/webhooks",
    Icon: IconShield,
    badge: "Coming soon",
  },
  {
    title: "Notifications",
    description: "Configure email and Slack notification preferences.",
    href: "/settings/webhooks",
    Icon: IconBell,
    badge: "Coming soon",
  },
  {
    title: "Audit & Compliance",
    description: "Data retention, export settings, and compliance configuration.",
    href: "/audit",
    Icon: IconActivity,
  },
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your organization's configuration and integrations."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {SETTINGS_SECTIONS.map((section, i) => (
          <Link
            key={section.title}
            href={section.href}
            className="animate-fade-up group rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2 focus-ring"
            style={{ animationDelay: `${0.05 * i}s` }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-surface-3">
                <section.Icon className="h-5 w-5 text-text-tertiary group-hover:text-accent transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                    {section.title}
                  </h2>
                  {"badge" in section && section.badge && (
                    <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-tertiary">
                      {section.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                  {section.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
