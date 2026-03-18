"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/page-header";
import { IconGlobe, IconUser, IconShield, IconActivity, IconBell, IconPlus, IconWrench, IconGithub, IconCalendarEvent } from "@/components/icons";

/* ─── Team Members Panel ─── */
function TeamMembersPanel() {
  const { data: session } = useSession();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSent, setInviteSent] = useState(false);

  const currentUser = {
    name: session?.user?.name ?? "Admin",
    email: session?.user?.email ?? "admin@acme.corp",
    role: session?.user?.role ?? "admin",
  };

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSent(true);
    setInviteEmail("");
    setTimeout(() => {
      setInviteSent(false);
      setShowInvite(false);
    }, 2000);
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Current user */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-muted text-[11px] font-bold text-text-inverse">
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-[13px] font-medium text-text-primary">{currentUser.name}</p>
            <p className="text-[11px] text-text-tertiary">{currentUser.email}</p>
          </div>
        </div>
        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
          {currentUser.role}
        </span>
      </div>

      {/* Invite form */}
      {showInvite ? (
        <form onSubmit={handleInvite} className="flex items-center gap-2">
          <input
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface-0/50 px-3 py-2 text-[12px] text-text-primary placeholder-text-tertiary outline-none transition-colors focus:border-border-accent"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-text-inverse transition-colors hover:bg-accent/90"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => setShowInvite(false)}
            className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </form>
      ) : inviteSent ? (
        <p className="text-[12px] font-medium text-status-pass">Invitation sent</p>
      ) : (
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:border-border-accent hover:bg-surface-2 hover:text-text-primary"
        >
          <IconPlus className="h-3.5 w-3.5" />
          Invite Member
        </button>
      )}
    </div>
  );
}

/* ─── API Tokens Panel ─── */
interface StoredToken {
  id: string;
  name: string;
  maskedValue: string;
  createdAt: string;
}

function APITokensPanel() {
  const [tokens, setTokens] = useState<StoredToken[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [tokenName, setTokenName] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sentinel_api_tokens");
      if (stored) setTokens(JSON.parse(stored));
    } catch {}
  }, []);

  function persistTokens(updated: StoredToken[]) {
    setTokens(updated);
    localStorage.setItem("sentinel_api_tokens", JSON.stringify(updated));
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const name = tokenName.trim() || "Untitled";
    const rand = Math.random().toString(36).substring(2, 6);
    const newToken: StoredToken = {
      id: crypto.randomUUID(),
      name,
      maskedValue: `sntnl_****${rand}`,
      createdAt: new Date().toISOString(),
    };
    persistTokens([...tokens, newToken]);
    setTokenName("");
    setShowCreate(false);
  }

  function handleDelete(id: string) {
    persistTokens(tokens.filter((t) => t.id !== id));
  }

  return (
    <div className="mt-4 space-y-3">
      {tokens.length > 0 && (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3"
            >
              <div>
                <p className="text-[13px] font-medium text-text-primary">{token.name}</p>
                <p className="font-mono text-[11px] text-text-tertiary">{token.maskedValue}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text-tertiary">
                  {new Date(token.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleDelete(token.id)}
                  className="text-[11px] text-status-fail/70 transition-colors hover:text-status-fail"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <form onSubmit={handleGenerate} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Token name (e.g. CI/CD)"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface-0/50 px-3 py-2 text-[12px] text-text-primary placeholder-text-tertiary outline-none transition-colors focus:border-border-accent"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-text-inverse transition-colors hover:bg-accent/90"
          >
            Generate
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:border-border-accent hover:bg-surface-2 hover:text-text-primary"
        >
          <IconPlus className="h-3.5 w-3.5" />
          Generate Token
        </button>
      )}
    </div>
  );
}

/* ─── Notifications Panel ─── */
const NOTIFICATION_PREFS = [
  { key: "scan_completed", label: "Scan completed" },
  { key: "critical_finding", label: "Critical finding detected" },
  { key: "cert_expiring", label: "Certificate expiring" },
] as const;

function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    scan_completed: true,
    critical_finding: true,
    cert_expiring: false,
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sentinel_notification_prefs");
      if (stored) setPrefs(JSON.parse(stored));
    } catch {}
  }, []);

  function toggle(key: string) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    localStorage.setItem("sentinel_notification_prefs", JSON.stringify(updated));
  }

  return (
    <div className="mt-4 space-y-2">
      {NOTIFICATION_PREFS.map((pref) => (
        <div
          key={pref.key}
          className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3"
        >
          <span className="text-[13px] text-text-primary">{pref.label}</span>
          <button
            onClick={() => toggle(pref.key)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              prefs[pref.key] ? "bg-accent" : "bg-surface-3"
            }`}
            role="switch"
            aria-checked={prefs[pref.key]}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                prefs[pref.key] ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Expandable Section Card ─── */
function SectionCard({
  title,
  description,
  Icon,
  animationDelay,
  children,
}: {
  title: string;
  description: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  animationDelay: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="animate-fade-up group rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2"
      style={{ animationDelay }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-4 text-left"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-surface-3">
          <Icon className="h-5 w-5 text-text-tertiary group-hover:text-accent transition-colors" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
            {title}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
            {description}
          </p>
        </div>
        <svg
          className={`mt-1 h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && children}
    </div>
  );
}

/* ─── Link Section Card (unchanged style for Webhooks / Audit) ─── */
function LinkSectionCard({
  title,
  description,
  href,
  Icon,
  animationDelay,
}: {
  title: string;
  description: string;
  href: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  animationDelay: string;
}) {
  return (
    <Link
      href={href}
      className="animate-fade-up group rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 focus-ring hover:border-border-accent hover:bg-surface-2"
      style={{ animationDelay }}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-surface-3">
          <Icon className="h-5 w-5 text-text-tertiary group-hover:text-accent transition-colors" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
            {title}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}

/* ─── Settings Page ─── */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your organization's configuration and integrations."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <LinkSectionCard
          title="VCS Providers"
          description="Connect GitHub, GitLab, Bitbucket, or Azure DevOps repositories."
          href="/settings/vcs"
          Icon={IconGithub}
          animationDelay="0s"
        />

        <LinkSectionCard
          title="Webhooks"
          description="Configure webhook endpoints for scan events and alerts."
          href="/settings/webhooks"
          Icon={IconGlobe}
          animationDelay="0.05s"
        />

        <SectionCard
          title="Team Members"
          description="Manage users, roles, and access permissions."
          Icon={IconUser}
          animationDelay="0.1s"
        >
          <TeamMembersPanel />
        </SectionCard>

        <SectionCard
          title="API Tokens"
          description="Create and manage API tokens for CI/CD integration."
          Icon={IconShield}
          animationDelay="0.15s"
        >
          <APITokensPanel />
        </SectionCard>

        <SectionCard
          title="Notifications"
          description="Configure email and Slack notification preferences."
          Icon={IconBell}
          animationDelay="0.2s"
        >
          <NotificationsPanel />
        </SectionCard>

        <LinkSectionCard
          title="Single Sign-On"
          description="Configure OIDC, SAML, and other SSO providers for your organization."
          href="/settings/sso"
          Icon={IconShield}
          animationDelay="0.25s"
        />

        <LinkSectionCard
          title="Workflow Pipeline"
          description="Configure remediation workflow stages and pipeline behavior."
          href="/settings/workflow"
          Icon={IconWrench}
          animationDelay="0.3s"
        />

        <LinkSectionCard
          title="Report Schedules"
          description="Configure automated report delivery and digest schedules."
          href="/settings/report-schedules"
          Icon={IconCalendarEvent}
          animationDelay="0.3s"
        />

        <LinkSectionCard
          title="Data Retention"
          description="Configure retention policies, archive destinations, and review cleanup history."
          href="/settings/retention"
          Icon={IconActivity}
          animationDelay="0.32s"
        />

        <LinkSectionCard
          title="Audit & Compliance"
          description="Data retention, export settings, and compliance configuration."
          href="/audit"
          Icon={IconActivity}
          animationDelay="0.35s"
        />
      </div>
    </div>
  );
}
