"use client";

import { useState, useCallback } from "react";
import { PolicyEditor } from "@/components/policy-editor";
import {
  PolicyValidator,
  validatePolicy,
  type ValidationMessage,
} from "@/components/policy-validator";
import { MOCK_POLICIES } from "@/lib/mock-data";

const DEFAULT_POLICY = `version: "1.0"
rules:
  - id: secret-detection
    severity: critical
    enabled: true
    description: "Detect hard-coded secrets and API keys"
    threshold: 0

  - id: ai-code-review
    severity: high
    enabled: true
    description: "Flag AI-generated code without review markers"
    threshold: 5

  - id: dependency-audit
    severity: medium
    enabled: true
    description: "Check for vulnerable dependencies"
    threshold: 10

  - id: pii-scanner
    severity: high
    enabled: true
    description: "Identify PII exposure in source code"
    threshold: 0
`;

export default function PolicyEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // In a real app, we'd use `use(params)` or a loader; for the MVP we
  // resolve synchronously since mock data is static.
  const resolvedParams =
    typeof (params as unknown as { id: string }).id === "string"
      ? (params as unknown as { id: string })
      : { id: "new" };

  const existing = MOCK_POLICIES.find((p) => p.id === resolvedParams.id);
  const policyName = existing?.name ?? "New Policy";
  const initialYaml = existing?.yaml ?? DEFAULT_POLICY;

  const [messages, setMessages] = useState<ValidationMessage[]>(() =>
    validatePolicy(initialYaml),
  );
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((value: string) => {
    setMessages(validatePolicy(value));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    const errors = messages.filter((m) => m.level === "error");
    if (errors.length > 0) return;
    setSaved(true);
    // In a real app, persist via API call
  }, [messages]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{policyName}</h1>
          <p className="mt-1 text-slate-400">
            Edit the policy YAML below. Validation runs in real-time.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={messages.some((m) => m.level === "error")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saved ? "Saved" : "Save Policy"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PolicyEditor initialValue={initialYaml} onChange={handleChange} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-400">
            Validation
          </h2>
          <PolicyValidator messages={messages} />
        </div>
      </div>
    </div>
  );
}
