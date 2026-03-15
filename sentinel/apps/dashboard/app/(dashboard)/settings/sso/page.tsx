"use client";
import { useState, useEffect } from "react";

const PROVIDER_OPTIONS = [
  { value: "okta", label: "Okta" },
  { value: "azure-ad", label: "Microsoft Entra ID (Azure AD)" },
  { value: "google-workspace", label: "Google Workspace" },
  { value: "ping-federate", label: "PingFederate" },
  { value: "generic-oidc", label: "Generic OIDC" },
  { value: "generic-saml", label: "Generic SAML" },
];

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

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  marginTop: 4,
};

const selectStyle = inputStyle;

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 100,
  fontFamily: "monospace",
  fontSize: "0.875rem",
};

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
    fetch("/api/v1/sso-configs")
      .then((r) => r.json())
      .then((d) => setConfigs(d.ssoConfigs ?? []));
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
    const res = await fetch("/api/v1/sso-configs", {
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
    await fetch(`/api/v1/sso-configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setConfigs(configs.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c)));
  };

  const deleteConfig = async (id: string) => {
    await fetch(`/api/v1/sso-configs/${id}`, { method: "DELETE" });
    setConfigs(configs.filter((c) => c.id !== id));
  };

  const testConnection = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/v1/sso-configs/${id}/test-connection`, { method: "POST" });
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
    <div style={{ padding: "2rem", maxWidth: 800 }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>SSO Configuration</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem" }}>
        Configure Single Sign-On providers for your organization.
      </p>

      {configs.map((c) => {
        const tr = testResults[c.id];
        const lastTest = c.lastTestResult;
        return (
          <div
            key={c.id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{c.displayName}</strong>{" "}
                <span style={{ color: "#9ca3af" }}>({providerLabel(c.providerType ?? c.provider)})</span>
                {c.enforced && (
                  <span style={{ marginLeft: 8, color: "#dc2626", fontSize: "0.75rem" }}>ENFORCED</span>
                )}
                {c.settings?.jitEnabled && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: "#7c3aed",
                      fontSize: "0.75rem",
                      background: "#ede9fe",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    JIT
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => testConnection(c.id)}
                  disabled={tr?.loading}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    cursor: tr?.loading ? "wait" : "pointer",
                    background: "#f9fafb",
                  }}
                >
                  {tr?.loading ? "Testing..." : "Test Connection"}
                </button>
                <button
                  onClick={() => toggleEnabled(c.id, c.enabled)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    cursor: "pointer",
                  }}
                >
                  {c.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => deleteConfig(c.id)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    border: "1px solid #fca5a5",
                    color: "#dc2626",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Test connection result */}
            {tr && !tr.loading && (
              <div style={{ marginTop: 8 }}>
                {tr.success ? (
                  <span
                    style={{
                      display: "inline-block",
                      background: "#dcfce7",
                      color: "#166534",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: "0.8rem",
                    }}
                  >
                    Connected ({tr.latencyMs}ms)
                  </span>
                ) : (
                  <span
                    style={{
                      display: "inline-block",
                      background: "#fee2e2",
                      color: "#991b1b",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: "0.8rem",
                    }}
                  >
                    Failed: {tr.error}
                  </span>
                )}
              </div>
            )}

            {/* Last tested status */}
            {lastTest && !tr && (
              <div style={{ marginTop: 8, fontSize: "0.75rem", color: "#6b7280" }}>
                Last tested:{" "}
                {lastTest.success ? (
                  <span style={{ color: "#166534" }}>
                    Connected ({lastTest.latencyMs}ms)
                  </span>
                ) : (
                  <span style={{ color: "#991b1b" }}>Failed: {lastTest.error}</span>
                )}
                {lastTest.testedAt && (
                  <span style={{ marginLeft: 8 }}>
                    at {new Date(lastTest.testedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            <RoleMappingEditor configId={c.id} settings={c.settings ?? {}} onSave={() => loadConfigs()} />
          </div>
        );
      })}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer",
            border: "none",
          }}
        >
          + Add SSO Provider
        </button>
      ) : (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "1.5rem",
            marginTop: "1rem",
          }}
        >
          <div style={{ display: "grid", gap: "1rem" }}>
            <label>
              Provider Type
              <select
                value={form.providerType}
                onChange={(e) => setForm({ ...form, providerType: e.target.value })}
                style={selectStyle}
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Display Name
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Acme Corp SSO"
                style={inputStyle}
              />
            </label>

            <label>
              Client ID
              <input
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                style={inputStyle}
              />
            </label>

            {needsClientSecret(form.providerType) && (
              <label>
                Client Secret
                <input
                  type="password"
                  value={form.clientSecret}
                  onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                  style={inputStyle}
                />
              </label>
            )}

            {needsIssuerUrl(form.providerType) && (
              <label>
                Issuer URL
                <input
                  value={form.issuerUrl}
                  onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
                  placeholder="https://acme.okta.com"
                  style={inputStyle}
                />
              </label>
            )}

            {needsTenantId(form.providerType) && (
              <label>
                Tenant ID
                <input
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  style={inputStyle}
                />
              </label>
            )}

            {needsDomainRestriction(form.providerType) && (
              <label>
                Domain Restriction{" "}
                <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>(optional)</span>
                <input
                  value={form.domainRestriction}
                  onChange={(e) => setForm({ ...form, domainRestriction: e.target.value })}
                  placeholder="acme.com"
                  style={inputStyle}
                />
              </label>
            )}

            {needsMetadataUrl(form.providerType) && (
              <label>
                Metadata URL
                <input
                  value={form.metadataUrl}
                  onChange={(e) => setForm({ ...form, metadataUrl: e.target.value })}
                  placeholder="https://idp.example.com/metadata"
                  style={inputStyle}
                />
              </label>
            )}

            {needsSamlMetadata(form.providerType) && (
              <label>
                SAML Metadata XML
                <textarea
                  value={form.samlMetadata}
                  onChange={(e) => setForm({ ...form, samlMetadata: e.target.value })}
                  placeholder="<EntityDescriptor ...>"
                  style={textareaStyle}
                />
              </label>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.enforced}
                onChange={(e) => setForm({ ...form, enforced: e.target.checked })}
              />
              Enforce SSO (block all other login methods for this org)
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.jitEnabled}
                onChange={(e) => setForm({ ...form, jitEnabled: e.target.checked })}
              />
              Enable Just-in-Time provisioning
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSave}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  background: "#2563eb",
                  color: "#fff",
                  cursor: "pointer",
                  border: "none",
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  background: "#f3f4f6",
                  cursor: "pointer",
                  border: "1px solid #d1d5db",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
    await fetch(`/api/v1/sso-configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, roleMapping, defaultRole } }),
    });
    onSave();
  };

  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      <h4 className="font-medium text-sm text-gray-700">
        Role Mapping (IdP Group &rarr; Sentinel Role)
      </h4>
      {mappings.length === 0 && (
        <p className="text-sm text-gray-400">
          No role mappings configured. Users will get the default role.
        </p>
      )}
      {mappings.map((m, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            value={m.group}
            readOnly
            className="border border-gray-300 px-2 py-1 rounded text-sm flex-1 bg-gray-50"
          />
          <span className="text-gray-400 text-sm">&rarr;</span>
          <select
            value={m.role}
            onChange={(e) => {
              const n = [...mappings];
              n[i] = { ...n[i], role: e.target.value };
              setMappings(n);
            }}
            className="border border-gray-300 px-2 py-1 rounded text-sm"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            onClick={() => setMappings(mappings.filter((_, j) => j !== i))}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          placeholder="IdP group name"
          className="border border-gray-300 px-2 py-1 rounded text-sm flex-1"
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          className="border border-gray-300 px-2 py-1 rounded text-sm"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (newGroup.trim()) {
              setMappings([...mappings, { group: newGroup.trim(), role: newRole }]);
              setNewGroup("");
            }
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
        >
          Add
        </button>
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-600">Default role for unmapped users:</span>
        <select
          value={defaultRole}
          onChange={(e) => setDefaultRole(e.target.value)}
          className="border border-gray-300 px-2 py-1 rounded text-sm"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={save}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
      >
        Save Role Mappings
      </button>
    </div>
  );
}
