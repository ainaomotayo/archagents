"use client";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { IconShield, IconPlus } from "@/components/icons";

const PROVIDER_OPTIONS = [
  { value: "okta", label: "Okta" },
  { value: "azure-ad", label: "Microsoft Entra ID (Azure AD)" },
  { value: "google-workspace", label: "Google Workspace" },
  { value: "ping-federate", label: "PingFederate" },
  { value: "generic-oidc", label: "Generic OIDC" },
  { value: "generic-saml", label: "Generic SAML" },
];

const inputCls = "w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2";

interface SsoConfig {
  id: string;
  provider: string;
  providerType?: string;
  displayName: string;
  issuerUrl?: string;
  enabled: boolean;
  enforced: boolean;
  settings?: Record<string, any>;
  lastTestResult?: { success: boolean; latencyMs?: number; error?: string; testedAt?: string };
}

interface TestResult {
  loading: boolean;
  success?: boolean;
  latencyMs?: number;
  error?: string;
}


export default function SsoSettingsPage() {
  const [configs, setConfigs] = useState<SsoConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    providerType: "okta" as string,
    displayName: "",
    clientId: "",
    clientSecret: "",
    issuerUrl: "",
    tenantId: "",
    metadataUrl: "",
    domainRestriction: "",
    samlMetadata: "",
    enforced: false,
    jitEnabled: true,
  });
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const loadConfigs = () => {
    fetch("/api/sso-configs")
      .then((r) => r.json())
      .then((d) => setConfigs(d.ssoConfigs ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const resetForm = () => {
    setForm({
      providerType: "okta",
      displayName: "",
      clientId: "",
      clientSecret: "",
      issuerUrl: "",
      tenantId: "",
      metadataUrl: "",
      domainRestriction: "",
      samlMetadata: "",
      enforced: false,
      jitEnabled: true,
    });
  };

  const handleSave = async () => {
    const body = {
      provider: form.providerType.includes("saml") ? "saml" : "oidc",
      providerType: form.providerType,
      displayName: form.displayName,
      clientId: form.clientId,
      clientSecret: form.clientSecret || undefined,
      issuerUrl: form.issuerUrl || undefined,
      tenantId: form.tenantId || undefined,
      metadataUrl: form.metadataUrl || undefined,
      domainRestriction: form.domainRestriction || undefined,
      samlMetadata: form.samlMetadata || undefined,
      enforced: form.enforced,
      settings: { jitEnabled: form.jitEnabled },
    };
    const res = await fetch("/api/sso-configs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      loadConfigs();
      setShowForm(false);
      resetForm();
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await fetch(`/api/sso-configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setConfigs(configs.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c)));
  };

  const deleteConfig = async (id: string) => {
    await fetch(`/api/sso-configs/${id}`, { method: "DELETE" });
    setConfigs(configs.filter((c) => c.id !== id));
  };

  const testConnection = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/sso-configs/${id}/test-connection`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResults((prev) => ({
          ...prev,
          [id]: { loading: false, success: true, latencyMs: data.latencyMs },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [id]: { loading: false, success: false, error: data.error || "Connection failed" },
        }));
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { loading: false, success: false, error: "Network error" },
      }));
    }
  };

  const needsClientSecret = (type: string) =>
    ["okta", "azure-ad", "google-workspace", "generic-oidc"].includes(type);

  const needsIssuerUrl = (type: string) => ["okta", "generic-oidc"].includes(type);

  const needsTenantId = (type: string) => type === "azure-ad";

  const needsDomainRestriction = (type: string) => type === "google-workspace";

  const needsMetadataUrl = (type: string) => ["ping-federate", "generic-saml"].includes(type);

  const needsSamlMetadata = (type: string) => type === "generic-saml";

  const providerLabel = (type?: string) => {
    const opt = PROVIDER_OPTIONS.find((o) => o.value === type);
    return opt ? opt.label : type ?? "Unknown";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="SSO Configuration"
        description="Configure Single Sign-On providers for your organization."
        action={
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <IconPlus className="h-4 w-4" />
              Add Provider
            </button>
          ) : undefined
        }
      />

      {/* Existing configs */}
      <div className="space-y-3">
        {configs.map((c) => {
          const tr = testResults[c.id];
          const lastTest = c.lastTestResult;
          return (
            <div key={c.id} className="rounded-xl border border-border bg-surface-1 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3">
                    <IconShield className="h-4 w-4 text-text-tertiary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-text-primary">{c.displayName}</h3>
                      <span className="text-[11px] text-text-tertiary">({providerLabel(c.providerType ?? c.provider)})</span>
                      {c.enforced && (
                        <span className="rounded-md bg-status-fail/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-status-fail">Enforced</span>
                      )}
                      {c.settings?.jitEnabled && (
                        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">JIT</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => testConnection(c.id)}
                    disabled={tr?.loading}
                    className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:border-border-accent hover:text-text-primary transition-colors disabled:opacity-50"
                  >
                    {tr?.loading ? "Testing…" : "Test"}
                  </button>
                  <button
                    onClick={() => toggleEnabled(c.id, c.enabled)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      c.enabled
                        ? "bg-status-pass/15 text-status-pass border-status-pass/30"
                        : "bg-surface-3 text-text-tertiary border-border"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.enabled ? "bg-status-pass" : "bg-text-tertiary"}`} />
                    {c.enabled ? "Active" : "Disabled"}
                  </button>
                  <button
                    onClick={() => deleteConfig(c.id)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-medium text-status-fail/70 hover:text-status-fail hover:bg-status-fail/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {tr && !tr.loading && (
                <div className={`rounded-lg border px-3 py-2 text-[12px] font-medium ${tr.success ? "border-status-pass/30 bg-status-pass/10 text-status-pass" : "border-status-fail/30 bg-status-fail/10 text-status-fail"}`}>
                  {tr.success ? `Connected (${tr.latencyMs}ms)` : `Failed: ${tr.error}`}
                </div>
              )}
              {lastTest && !tr && (
                <p className="text-[11px] text-text-tertiary">
                  Last tested:{" "}
                  <span className={lastTest.success ? "text-status-pass" : "text-status-fail"}>
                    {lastTest.success ? `Connected (${lastTest.latencyMs}ms)` : `Failed: ${lastTest.error}`}
                  </span>
                  {lastTest.testedAt && ` · ${new Date(lastTest.testedAt).toLocaleString()}`}
                </p>
              )}

              <RoleMappingEditor configId={c.id} settings={c.settings ?? {}} onSave={() => loadConfigs()} />
            </div>
          );
        })}

        {configs.length === 0 && !showForm && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-12 text-center">
            <IconShield className="mx-auto mb-3 h-8 w-8 text-text-tertiary/50" />
            <p className="text-[13px] text-text-tertiary">No SSO providers configured.</p>
          </div>
        )}
      </div>

      <SessionPolicyEditor />

      {/* Add provider form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-surface-1 p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-1 rounded-full bg-accent" />
            <h2 className="text-[15px] font-semibold text-text-primary">New SSO Provider</h2>
          </div>

          <div className="grid gap-4">
            <div>
              <label className={labelCls}>Provider Type</label>
              <select
                value={form.providerType}
                onChange={(e) => setForm({ ...form, providerType: e.target.value })}
                className={inputCls}
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Display Name</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="e.g., Acme Corp SSO"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Client ID</label>
              <input
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className={inputCls}
              />
            </div>

            {needsClientSecret(form.providerType) && (
              <div>
                <label className={labelCls}>Client Secret</label>
                <input
                  type="password"
                  value={form.clientSecret}
                  onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                  className={inputCls}
                />
              </div>
            )}

            {needsIssuerUrl(form.providerType) && (
              <div>
                <label className={labelCls}>Issuer URL</label>
                <input
                  value={form.issuerUrl}
                  onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
                  placeholder="https://acme.okta.com"
                  className={inputCls}
                />
              </div>
            )}

            {needsTenantId(form.providerType) && (
              <div>
                <label className={labelCls}>Tenant ID</label>
                <input
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputCls}
                />
              </div>
            )}

            {needsDomainRestriction(form.providerType) && (
              <div>
                <label className={labelCls}>Domain Restriction <span className="font-normal normal-case tracking-normal text-text-tertiary">(optional)</span></label>
                <input
                  value={form.domainRestriction}
                  onChange={(e) => setForm({ ...form, domainRestriction: e.target.value })}
                  placeholder="acme.com"
                  className={inputCls}
                />
              </div>
            )}

            {needsMetadataUrl(form.providerType) && (
              <div>
                <label className={labelCls}>Metadata URL</label>
                <input
                  value={form.metadataUrl}
                  onChange={(e) => setForm({ ...form, metadataUrl: e.target.value })}
                  placeholder="https://idp.example.com/metadata"
                  className={inputCls}
                />
              </div>
            )}

            {needsSamlMetadata(form.providerType) && (
              <div>
                <label className={labelCls}>SAML Metadata XML</label>
                <textarea
                  value={form.samlMetadata}
                  onChange={(e) => setForm({ ...form, samlMetadata: e.target.value })}
                  placeholder="<EntityDescriptor ...>"
                  rows={5}
                  className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 font-mono text-[12px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors resize-none"
                />
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enforced}
                  onChange={(e) => setForm({ ...form, enforced: e.target.checked })}
                  className="rounded accent-accent h-4 w-4"
                />
                <span className="text-[13px] text-text-primary">Enforce SSO (block all other login methods for this org)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.jitEnabled}
                  onChange={(e) => setForm({ ...form, jitEnabled: e.target.checked })}
                  className="rounded accent-accent h-4 w-4"
                />
                <span className="text-[13px] text-text-primary">Enable Just-in-Time provisioning</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <button
              onClick={handleSave}
              className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Save
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionPolicyEditor() {
  const [policy, setPolicy] = useState({
    maxSessionDurationMinutes: 480,
    idleTimeoutMinutes: 60,
    maxConcurrentSessions: 5,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/org-settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.sessionPolicy) {
          setPolicy({
            maxSessionDurationMinutes: d.sessionPolicy.maxSessionDurationMinutes ?? 480,
            idleTimeoutMinutes: d.sessionPolicy.idleTimeoutMinutes ?? 60,
            maxConcurrentSessions: d.sessionPolicy.maxConcurrentSessions ?? 5,
          });
        }
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaved(false);
    const res = await fetch("/api/org-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionPolicy: policy }),
    });
    if (res.ok) setSaved(true);
  };

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
      <div>
        <h2 className="text-[14px] font-semibold text-text-primary">Session Policy</h2>
        <p className="mt-1 text-[12px] text-text-secondary">Configure session lifecycle enforcement for SSO users.</p>
      </div>
      <div className="grid gap-4 max-w-sm">
        <div>
          <label className={labelCls}>Max Session Duration (minutes)</label>
          <input
            type="number" min={15} max={1440}
            value={policy.maxSessionDurationMinutes}
            onChange={(e) => setPolicy({ ...policy, maxSessionDurationMinutes: parseInt(e.target.value) || 480 })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Idle Timeout (minutes)</label>
          <input
            type="number" min={5} max={480}
            value={policy.idleTimeoutMinutes}
            onChange={(e) => setPolicy({ ...policy, idleTimeoutMinutes: parseInt(e.target.value) || 60 })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Max Concurrent Sessions</label>
          <input
            type="number" min={1} max={50}
            value={policy.maxConcurrentSessions}
            onChange={(e) => setPolicy({ ...policy, maxConcurrentSessions: parseInt(e.target.value) || 5 })}
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={save}
            className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Save Policy
          </button>
          {saved && <span className="text-[12px] font-medium text-status-pass">Saved</span>}
        </div>
      </div>
    </div>
  );
}

function RoleMappingEditor({
  configId,
  settings,
  onSave,
}: {
  configId: string;
  settings: Record<string, any>;
  onSave: () => void;
}) {
  const [mappings, setMappings] = useState<Array<{ group: string; role: string }>>(
    Object.entries(settings?.roleMapping ?? {}).map(([group, role]) => ({
      group,
      role: role as string,
    }))
  );
  const [defaultRole, setDefaultRole] = useState(settings?.defaultRole ?? "viewer");
  const [newGroup, setNewGroup] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const roles = ["admin", "manager", "developer", "viewer"];

  const save = async () => {
    const roleMapping = Object.fromEntries(mappings.map((m) => [m.group, m.role]));
    await fetch(`/api/sso-configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, roleMapping, defaultRole } }),
    });
    onSave();
  };

  return (
    <div className="mt-3 border-t border-border pt-4 space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        Role Mapping (IdP Group → Sentinel Role)
      </h4>
      {mappings.length === 0 && (
        <p className="text-[12px] text-text-tertiary">No role mappings configured. Users will get the default role.</p>
      )}
      {mappings.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={m.group}
            readOnly
            className="flex-1 rounded-md border border-border bg-surface-0/50 px-3 py-1.5 text-[12px] text-text-secondary"
          />
          <span className="text-[12px] text-text-tertiary">→</span>
          <select
            value={m.role}
            onChange={(e) => {
              const n = [...mappings];
              n[i] = { ...n[i], role: e.target.value };
              setMappings(n);
            }}
            className="rounded-md border border-border bg-surface-0/50 px-2 py-1.5 text-[12px] text-text-primary outline-none"
          >
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={() => setMappings(mappings.filter((_, j) => j !== i))}
            className="text-[11px] text-status-fail/70 hover:text-status-fail transition-colors"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          placeholder="IdP group name"
          className="flex-1 rounded-md border border-border bg-surface-0/50 px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          className="rounded-md border border-border bg-surface-0/50 px-2 py-1.5 text-[12px] text-text-primary outline-none"
        >
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={() => {
            if (newGroup.trim()) {
              setMappings([...mappings, { group: newGroup.trim(), role: newRole }]);
              setNewGroup("");
            }
          }}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-text-inverse hover:brightness-110 transition-all"
        >
          Add
        </button>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-[12px] text-text-secondary">Default role for unmapped users:</span>
        <select
          value={defaultRole}
          onChange={(e) => setDefaultRole(e.target.value)}
          className="rounded-md border border-border bg-surface-0/50 px-2 py-1.5 text-[12px] text-text-primary outline-none"
        >
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <button
        onClick={save}
        className="rounded-lg bg-status-pass/10 border border-status-pass/30 px-3 py-1.5 text-[12px] font-semibold text-status-pass hover:bg-status-pass/20 transition-colors"
      >
        Save Role Mappings
      </button>
    </div>
  );
}
