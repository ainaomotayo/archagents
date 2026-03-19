"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { IconPlus, IconGithub, IconGlobe, IconGrid, IconCpu } from "@/components/icons";
import {
  getVCSInstallations,
  createVCSInstallation,
  updateVCSInstallation,
  deleteVCSInstallation,
} from "@/lib/api";

/* ─── Types ─── */

type VcsProvider = "github" | "gitlab" | "bitbucket" | "azure_devops";

interface VcsInstallation {
  id: string;
  provider: VcsProvider;
  installationId: string;
  owner: string;
  active: boolean;
  webhookSecret: string;
  createdAt: string;
  azureDevOpsExt?: {
    organizationUrl: string;
    projectName: string;
  };
}

/* ─── Constants ─── */

const PROVIDER_META: Record<VcsProvider, { label: string; color: string }> = {
  github: { label: "GitHub", color: "bg-[#24292e]" },
  gitlab: { label: "GitLab", color: "bg-[#fc6d26]" },
  bitbucket: { label: "Bitbucket", color: "bg-[#0052cc]" },
  azure_devops: { label: "Azure DevOps", color: "bg-[#0078d4]" },
};

/* ─── Provider Icon ─── */

const PROVIDER_ICONS: Record<VcsProvider, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  github: IconGithub,
  gitlab: IconGlobe,
  bitbucket: IconGrid,
  azure_devops: IconCpu,
};

function ProviderIcon({ provider, className }: { provider: VcsProvider; className?: string }) {
  const meta = PROVIDER_META[provider];
  const Icon = PROVIDER_ICONS[provider];
  return (
    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.color} ${className ?? ""}`}>
      <Icon className="h-4 w-4 text-white" />
    </div>
  );
}

/* ─── Page ─── */

export default function VcsProvidersPage() {
  const [installations, setInstallations] = useState<VcsInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form state
  const [formProvider, setFormProvider] = useState<VcsProvider>("github");
  const [formOwner, setFormOwner] = useState("");
  const [formWebhookSecret, setFormWebhookSecret] = useState("");

  // GitHub fields
  const [formGhAppId, setFormGhAppId] = useState("");
  const [formGhPrivateKey, setFormGhPrivateKey] = useState("");
  const [formGhInstallationId, setFormGhInstallationId] = useState("");

  // GitLab fields
  const [formGlUrl, setFormGlUrl] = useState("https://gitlab.com");
  const [formGlAccessToken, setFormGlAccessToken] = useState("");
  const [formGlTokenType, setFormGlTokenType] = useState("project");

  // Bitbucket fields
  const [formBbWorkspace, setFormBbWorkspace] = useState("");
  const [formBbClientKey, setFormBbClientKey] = useState("");
  const [formBbSharedSecret, setFormBbSharedSecret] = useState("");

  // Azure DevOps fields
  const [formAzOrgUrl, setFormAzOrgUrl] = useState("");
  const [formAzProjectName, setFormAzProjectName] = useState("");
  const [formAzPat, setFormAzPat] = useState("");

  // Load from API on mount
  useEffect(() => {
    setLoading(true);
    getVCSInstallations()
      .then((data) => setInstallations(data as VcsInstallation[]))
      .catch(() => setFeedback({ type: "error", message: "Failed to load integrations." }))
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = async (inst: VcsInstallation) => {
    const updated = await updateVCSInstallation(inst.id, { active: !inst.active });
    if (updated) {
      setInstallations((prev) =>
        prev.map((i) => (i.id === inst.id ? { ...i, active: !inst.active } : i)),
      );
    } else {
      setFeedback({ type: "error", message: "Failed to update integration." });
    }
  };

  const deleteInstallation = async (id: string, owner: string) => {
    if (!window.confirm(`Remove the "${owner}" VCS connection? This cannot be undone.`)) return;
    await deleteVCSInstallation(id);
    setInstallations((prev) => prev.filter((i) => i.id !== id));
  };

  const resetForm = () => {
    setFormProvider("github");
    setFormOwner("");
    setFormWebhookSecret("");
    setFormGhAppId("");
    setFormGhPrivateKey("");
    setFormGhInstallationId("");
    setFormGlUrl("https://gitlab.com");
    setFormGlAccessToken("");
    setFormGlTokenType("project");
    setFormBbWorkspace("");
    setFormBbClientKey("");
    setFormBbSharedSecret("");
    setFormAzOrgUrl("");
    setFormAzProjectName("");
    setFormAzPat("");
  };

  const handleSave = async () => {
    if (!formOwner.trim()) {
      setFeedback({ type: "error", message: "Owner is required." });
      return;
    }
    if (!formWebhookSecret.trim()) {
      setFeedback({ type: "error", message: "Webhook secret is required." });
      return;
    }

    // Provider-specific validation and payload assembly
    let installationId = "";
    let providerConfig: Record<string, string> = {};

    switch (formProvider) {
      case "github":
        if (!formGhAppId.trim() || !formGhPrivateKey.trim() || !formGhInstallationId.trim()) {
          setFeedback({ type: "error", message: "All GitHub fields (App ID, Private Key, Installation ID) are required." });
          return;
        }
        installationId = formGhInstallationId.trim();
        providerConfig = {
          appId: formGhAppId.trim(),
          privateKey: formGhPrivateKey.trim(),
          numericInstallId: formGhInstallationId.trim(),
        };
        break;
      case "gitlab":
        if (!formGlUrl.trim() || !formGlAccessToken.trim()) {
          setFeedback({ type: "error", message: "GitLab URL and Access Token are required." });
          return;
        }
        installationId = `gl-${Date.now()}`;
        providerConfig = {
          gitlabUrl: formGlUrl.trim(),
          accessToken: formGlAccessToken.trim(),
          tokenType: formGlTokenType,
        };
        break;
      case "bitbucket":
        if (!formBbWorkspace.trim() || !formBbClientKey.trim() || !formBbSharedSecret.trim()) {
          setFeedback({ type: "error", message: "All Bitbucket fields (Workspace, Client Key, Shared Secret) are required." });
          return;
        }
        installationId = `bb-${formBbWorkspace.trim()}`;
        providerConfig = {
          workspace: formBbWorkspace.trim(),
          clientKey: formBbClientKey.trim(),
          sharedSecret: formBbSharedSecret.trim(),
        };
        break;
      case "azure_devops":
        if (!formAzOrgUrl.trim() || !formAzProjectName.trim() || !formAzPat.trim()) {
          setFeedback({ type: "error", message: "All Azure DevOps fields (Organization URL, Project Name, PAT) are required." });
          return;
        }
        installationId = `az-${Date.now()}`;
        providerConfig = {
          organizationUrl: formAzOrgUrl.trim(),
          projectName: formAzProjectName.trim(),
          pat: formAzPat.trim(),
        };
        break;
    }

    const payload = {
      provider: formProvider,
      installationId,
      owner: formOwner.trim(),
      webhookSecret: formWebhookSecret.trim(),
      ...providerConfig,
    };

    setSaving(true);
    try {
      const saved = await createVCSInstallation(payload);
      if (saved) {
        setInstallations((prev) => [saved as VcsInstallation, ...prev]);
        resetForm();
        setShowForm(false);
        setFeedback({
          type: "success",
          message: `${PROVIDER_META[formProvider].label} provider "${formOwner.trim()}" added successfully.`,
        });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({ type: "error", message: "Failed to save integration. Please try again." });
      }
    } catch {
      setFeedback({ type: "error", message: "Failed to save integration. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  /* ─── Provider-specific form fields ─── */

  function renderProviderFields() {
    const inputClass =
      "w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors";
    const labelClass =
      "block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2";

    switch (formProvider) {
      case "github":
        return (
          <>
            <div>
              <label className={labelClass}>App ID</label>
              <input
                type="text"
                placeholder="e.g., 123456"
                value={formGhAppId}
                onChange={(e) => setFormGhAppId(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Private Key</label>
              <textarea
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                value={formGhPrivateKey}
                onChange={(e) => setFormGhPrivateKey(e.target.value)}
                rows={3}
                className={`${inputClass} font-mono resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Installation ID</label>
              <input
                type="text"
                placeholder="e.g., 12345678"
                value={formGhInstallationId}
                onChange={(e) => setFormGhInstallationId(e.target.value)}
                className={inputClass}
              />
            </div>
          </>
        );
      case "gitlab":
        return (
          <>
            <div>
              <label className={labelClass}>GitLab URL</label>
              <input
                type="url"
                placeholder="https://gitlab.com"
                value={formGlUrl}
                onChange={(e) => setFormGlUrl(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Access Token</label>
              <input
                type="password"
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                value={formGlAccessToken}
                onChange={(e) => setFormGlAccessToken(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Token Type</label>
              <select
                value={formGlTokenType}
                onChange={(e) => setFormGlTokenType(e.target.value)}
                className={inputClass}
              >
                <option value="project">Project Access Token</option>
                <option value="group">Group Access Token</option>
                <option value="personal">Personal Access Token</option>
              </select>
            </div>
          </>
        );
      case "bitbucket":
        return (
          <>
            <div>
              <label className={labelClass}>Workspace</label>
              <input
                type="text"
                placeholder="e.g., acme-corp"
                value={formBbWorkspace}
                onChange={(e) => setFormBbWorkspace(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Client Key</label>
              <input
                type="text"
                placeholder="Client key from Bitbucket app"
                value={formBbClientKey}
                onChange={(e) => setFormBbClientKey(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Shared Secret</label>
              <input
                type="password"
                placeholder="Shared secret from Bitbucket app"
                value={formBbSharedSecret}
                onChange={(e) => setFormBbSharedSecret(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </>
        );
      case "azure_devops":
        return (
          <>
            <div>
              <label className={labelClass}>Organization URL</label>
              <input
                type="url"
                placeholder="https://dev.azure.com/your-org"
                value={formAzOrgUrl}
                onChange={(e) => setFormAzOrgUrl(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Project Name</label>
              <input
                type="text"
                placeholder="e.g., sentinel-demo"
                value={formAzProjectName}
                onChange={(e) => setFormAzProjectName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Personal Access Token (PAT)</label>
              <input
                type="password"
                placeholder="Azure DevOps PAT"
                value={formAzPat}
                onChange={(e) => setFormAzPat(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </>
        );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect your version control system to enable automated scanning."
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98] focus-ring"
          >
            <IconPlus className="h-4 w-4" />
            {showForm ? "Cancel" : "Add Provider"}
          </button>
        }
      />

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`animate-fade-up rounded-lg border px-4 py-3 text-[13px] font-medium ${
            feedback.type === "success"
              ? "border-status-pass/30 bg-status-pass/10 text-status-pass"
              : "border-status-fail/30 bg-status-fail/10 text-status-fail"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* New provider form */}
      {showForm && (
        <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-6 space-y-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-5 w-1 rounded-full bg-accent" />
            <h2 className="text-[15px] font-semibold text-text-primary">
              New VCS Provider
            </h2>
          </div>

          {/* Provider selector */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Provider
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PROVIDER_META) as VcsProvider[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setFormProvider(key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
                    formProvider === key
                      ? "border-accent bg-accent/10 text-text-primary"
                      : "border-border bg-surface-2 text-text-secondary hover:border-border-accent"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${PROVIDER_META[key].color}`}
                  />
                  {PROVIDER_META[key].label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider-specific fields */}
          {renderProviderFields()}

          {/* Common fields */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Owner
            </label>
            <input
              type="text"
              placeholder="e.g., acme-corp"
              value={formOwner}
              onChange={(e) => setFormOwner(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Webhook Secret
            </label>
            <input
              type="password"
              placeholder="A strong shared secret for webhook verification"
              value={formWebhookSecret}
              onChange={(e) => setFormWebhookSecret(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="border-t border-border pt-5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-status-pass px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98] focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Provider"}
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-10 text-center">
          <p className="text-[13px] text-text-tertiary">Loading integrations…</p>
        </div>
      )}

      {/* Installation list */}
      {!loading && (
      <div className="space-y-3">
        {installations.map((inst, i) => {
          const meta = PROVIDER_META[inst.provider as VcsProvider] ?? {
            label: inst.provider,
            color: "bg-surface-3",
          };
          return (
            <div
              key={inst.id}
              className="card-shine animate-fade-up rounded-xl border border-border bg-surface-1 p-5 transition-all hover:border-border-accent"
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={inst.provider as VcsProvider} />
                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      {meta.label}
                      <span className="ml-2 font-normal text-text-tertiary">
                        {inst.owner}
                      </span>
                    </h3>
                    <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">
                      ID: {inst.installationId}
                      {inst.azureDevOpsExt && (
                        <span className="ml-2">
                          {inst.azureDevOpsExt.organizationUrl}/{inst.azureDevOpsExt.projectName}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleActive(inst)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      inst.active
                        ? "bg-status-pass/15 text-status-pass border-status-pass/30"
                        : "bg-surface-3 text-text-tertiary border-border"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        inst.active ? "bg-status-pass" : "bg-text-tertiary"
                      }`}
                    />
                    {inst.active ? "Active" : "Disabled"}
                  </button>
                  <div className="rounded-md transition-colors hover:bg-status-fail/10">
                    <button
                      onClick={() => deleteInstallation(inst.id, inst.owner)}
                      className="text-[11px] font-medium text-status-fail hover:brightness-110 focus-ring rounded px-2 py-1"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent/60" />
                  {meta.label}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent/60" />
                  Added{" "}
                  {new Date(inst.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          );
        })}

        {installations.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
            <div className="flex justify-center mb-3">
              <IconGithub className="h-8 w-8 text-text-tertiary/50" />
            </div>
            <p className="text-[13px] text-text-tertiary">
              No VCS providers configured. Click &quot;Add Provider&quot; to get started.
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
