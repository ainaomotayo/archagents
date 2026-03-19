"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/page-header";
import { IconGlobe, IconUser, IconShield, IconActivity, IconBell, IconPlus, IconWrench, IconGithub, IconCalendarEvent } from "@/components/icons";

/* ─── Team Members Panel ─── */
interface Member {
  id: string;
  userId?: string;
  email?: string;
  role: string;
  user?: { name?: string; email?: string };
}

function TeamMembersPanel() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    fetch("/api/memberships")
      .then((r) => r.ok ? r.json() : { members: [] })
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {});
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    try {
      const res = await fetch("/api/memberships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        const d = await res.json();
        setMembers((prev) => [...prev, d.membership ?? d]);
        setInviteEmail("");
        setShowInvite(false);
      } else {
        const d = await res.json().catch(() => ({}));
        setInviteError(d.error ?? "Invite failed");
      }
    } catch {
      setInviteError("Network error");
    } finally {
      setInviting(false);
    }
  }

  const currentUser = {
    name: session?.user?.name ?? "Admin",
    email: session?.user?.email ?? "admin@sentinel.local",
    role: (session?.user as any)?.role ?? "admin",
  };

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

      {/* Other members */}
      {members.filter((m) => m.user?.email !== currentUser.email && m.email !== currentUser.email).map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-text-secondary">
              {(m.user?.name ?? m.user?.email ?? m.email ?? "?").charAt(0).toUpperCase()}
            </div>
            <div>
              {m.user?.name && <p className="text-[13px] font-medium text-text-primary">{m.user.name}</p>}
              <p className="text-[11px] text-text-tertiary">{m.user?.email ?? m.email ?? ""}</p>
            </div>
          </div>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-secondary">
            {m.role}
          </span>
        </div>
      ))}

      {/* Invite form */}
      {showInvite ? (
        <form onSubmit={handleInvite} className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-0/50 px-3 py-2 text-[12px] text-text-primary placeholder-text-tertiary outline-none transition-colors focus:border-border-accent"
              autoFocus
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-border bg-surface-0/50 px-2 py-2 text-[12px] text-text-primary outline-none"
            >
              {["viewer", "developer", "manager", "admin"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-text-inverse transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {inviting ? "Sending..." : "Send"}
            </button>
            <button
              type="button"
              onClick={() => { setShowInvite(false); setInviteError(""); }}
              className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
          {inviteError && <p className="text-[11px] text-status-fail">{inviteError}</p>}
        </form>
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
interface ApiToken {
  id: string;
  name: string;
  keyPrefix?: string;
  maskedKey?: string;
  createdAt: string;
  expiresAt?: string | null;
  // Only present immediately after creation
  plaintext?: string;
}

function APITokensPanel() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    fetch("/api/api-keys")
      .then((r) => r.ok ? r.json() : { apiKeys: [] })
      .then((d) => setTokens(d.apiKeys ?? d ?? []))
      .catch(() => {});
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const name = tokenName.trim() || "Untitled";
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const d = await res.json();
        const key = d.apiKey ?? d;
        setTokens((prev) => [...prev, key]);
        if (d.plaintext || d.key) setNewToken(d.plaintext ?? d.key);
        setTokenName("");
        setShowCreate(false);
      } else {
        const d = await res.json().catch(() => ({}));
        setCreateError(d.error ?? "Failed to create token");
      }
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setTokens((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="mt-4 space-y-3">
      {newToken && (
        <div className="rounded-lg border border-status-pass/30 bg-status-pass/10 px-4 py-3">
          <p className="text-[12px] font-medium text-status-pass mb-1">Token created — copy it now, it won't be shown again:</p>
          <code className="block font-mono text-[11px] text-text-primary break-all">{newToken}</code>
          <button onClick={() => setNewToken(null)} className="mt-2 text-[11px] text-text-tertiary hover:text-text-secondary">
            Dismiss
          </button>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3"
            >
              <div>
                <p className="text-[13px] font-medium text-text-primary">{token.name}</p>
                <p className="font-mono text-[11px] text-text-tertiary">
                  {token.keyPrefix ? `${token.keyPrefix}****` : token.maskedKey ?? "sntnl_****"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text-tertiary">
                  {new Date(token.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleRevoke(token.id)}
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
        <form onSubmit={handleGenerate} className="space-y-2">
          <div className="flex items-center gap-2">
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
              disabled={creating}
              className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-text-inverse transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(""); }}
              className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
          {createError && <p className="text-[11px] text-status-fail">{createError}</p>}
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
const NOTIFICATION_DEFS = [
  { event: "scan.completed", label: "Scan completed" },
  { event: "finding.critical", label: "Critical finding detected" },
  { event: "certificate.expiring", label: "Certificate expiring" },
] as const;

interface NotifRule { id: string; event: string; channel: string; enabled: boolean; }

function NotificationsPanel() {
  const [rules, setRules] = useState<NotifRule[]>([]);

  useEffect(() => {
    fetch("/api/notifications/rules")
      .then((r) => r.ok ? r.json() : { rules: [] })
      .then((d) => setRules(d.rules ?? []))
      .catch(() => {});
  }, []);

  function isEnabled(event: string): boolean {
    return rules.some((r) => r.event === event && r.enabled !== false);
  }

  async function toggle(event: string) {
    const existing = rules.find((r) => r.event === event);
    if (existing) {
      await fetch(`/api/notifications/rules/${existing.id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== existing.id));
    } else {
      const res = await fetch("/api/notifications/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event, channel: "email", enabled: true }),
      });
      if (res.ok) {
        const d = await res.json();
        setRules((prev) => [...prev, d.rule ?? d]);
      }
    }
  }

  return (
    <div className="mt-4 space-y-2">
      {NOTIFICATION_DEFS.map((def) => {
        const enabled = isEnabled(def.event);
        return (
          <div
            key={def.event}
            className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3"
          >
            <span className="text-[13px] text-text-primary">{def.label}</span>
            <button
              onClick={() => toggle(def.event)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                enabled ? "bg-accent" : "bg-surface-3"
              }`}
              role="switch"
              aria-checked={enabled}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        );
      })}
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
