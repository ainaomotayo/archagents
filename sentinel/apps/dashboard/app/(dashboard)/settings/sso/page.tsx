"use client";
import { useState, useEffect } from "react";

interface SsoConfig {
  id: string;
  provider: string;
  displayName: string;
  issuerUrl?: string;
  enabled: boolean;
  enforced: boolean;
}

export default function SsoSettingsPage() {
  const [configs, setConfigs] = useState<SsoConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ provider: "oidc", displayName: "", clientId: "", clientSecret: "", issuerUrl: "", enforced: false });

  useEffect(() => {
    fetch("/api/v1/sso-configs").then((r) => r.json()).then((d) => setConfigs(d.ssoConfigs ?? []));
  }, []);

  const handleSave = async () => {
    const res = await fetch("/api/v1/sso-configs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      setConfigs([...configs, { ...created, enabled: true, enforced: form.enforced }]);
      setShowForm(false);
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await fetch(`/api/v1/sso-configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setConfigs(configs.map((c) => c.id === id ? { ...c, enabled: !enabled } : c));
  };

  const deleteConfig = async (id: string) => {
    await fetch(`/api/v1/sso-configs/${id}`, { method: "DELETE" });
    setConfigs(configs.filter((c) => c.id !== id));
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 800 }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>SSO Configuration</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem" }}>Configure Single Sign-On providers for your organization.</p>

      {configs.map((c) => (
        <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>{c.displayName}</strong> <span style={{ color: "#9ca3af" }}>({c.provider})</span>
            {c.enforced && <span style={{ marginLeft: 8, color: "#dc2626", fontSize: "0.75rem" }}>ENFORCED</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => toggleEnabled(c.id, c.enabled)} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #d1d5db", cursor: "pointer" }}>
              {c.enabled ? "Disable" : "Enable"}
            </button>
            <button onClick={() => deleteConfig(c.id)} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #fca5a5", color: "#dc2626", cursor: "pointer" }}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{ padding: "8px 16px", borderRadius: 6, background: "#2563eb", color: "#fff", cursor: "pointer", border: "none" }}>
          + Add SSO Provider
        </button>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "1.5rem", marginTop: "1rem" }}>
          <div style={{ display: "grid", gap: "1rem" }}>
            <label>Provider
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }}>
                <option value="oidc">OIDC (Okta, Auth0, Azure AD)</option>
                <option value="saml">SAML</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </label>
            <label>Display Name
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Acme Corp SSO" style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
            </label>
            <label>Client ID
              <input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
            </label>
            <label>Client Secret
              <input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
            </label>
            {form.provider === "oidc" && (
              <label>Issuer URL
                <input value={form.issuerUrl} onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })} placeholder="https://acme.okta.com" style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
              </label>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.enforced} onChange={(e) => setForm({ ...form, enforced: e.target.checked })} />
              Enforce SSO (block all other login methods for this org)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} style={{ padding: "8px 16px", borderRadius: 6, background: "#2563eb", color: "#fff", cursor: "pointer", border: "none" }}>Save</button>
              <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", borderRadius: 6, background: "#f3f4f6", cursor: "pointer", border: "1px solid #d1d5db" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
