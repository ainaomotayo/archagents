"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWizard } from "@/lib/wizard-api";

const FRAMEWORKS = [
  { code: "eu_ai_act", label: "EU AI Act", description: "12 controls across 4 phases" },
  { code: "nist_ai_rmf", label: "NIST AI RMF", description: "AI Risk Management Framework" },
  { code: "iso_42001", label: "ISO 42001", description: "AI Management System Standard" },
] as const;

export default function CreateWizardPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [frameworkCode, setFrameworkCode] = useState<string>("eu_ai_act");
  const [systemName, setSystemName] = useState("");
  const [provider, setProvider] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const wizard = await createWizard(name.trim(), frameworkCode);
      if (systemName.trim() || provider.trim()) {
        const { updateWizardMetadata } = await import("@/lib/wizard-api");
        await updateWizardMetadata(wizard.id, {
          systemName: systemName.trim(),
          provider: provider.trim(),
        }).catch(() => {}); // non-critical
      }
      router.push(`/compliance/wizards/${wizard.id}`);
    } catch (err: any) {
      setError(err.message ?? "Failed to create wizard");
      setSubmitting(false);
    }
  }

  const selectedFramework = FRAMEWORKS.find((f) => f.code === frameworkCode);

  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="text-xl font-semibold text-text-primary mb-6">Create Compliance Wizard</h1>
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-border bg-surface-1 p-6">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">Wizard Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q1 2026 AI System Assessment"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">Framework *</label>
          <select
            value={frameworkCode}
            onChange={(e) => setFrameworkCode(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {FRAMEWORKS.map((f) => (
              <option key={f.code} value={f.code}>{f.label}</option>
            ))}
          </select>
          {selectedFramework && (
            <p className="mt-1 text-xs text-text-tertiary">{selectedFramework.description}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">AI System Name</label>
          <input
            type="text"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            placeholder="e.g. Customer Risk Scoring Engine"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">Provider / Organization</label>
          <input
            type="text"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="e.g. Acme Corp"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Wizard"}
          </button>
          <a href="/compliance/wizards" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
