import { getPolicyById } from "@/lib/api";
import { PolicyEditorClient } from "./editor-client";
import type { GroupNode } from "@/components/policy-builder";

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

export default async function PolicyEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let policyName = "New Policy";
  let initialYaml = DEFAULT_POLICY;
  let detectedFormat: "tree" | "yaml" = "yaml";
  let initialTreeRules: GroupNode | undefined;

  if (id !== "new") {
    const existing = await getPolicyById(id);
    if (existing) {
      policyName = (existing as any).name ?? "Policy";
      initialYaml = (existing as any).rules ?? DEFAULT_POLICY;
      const format = (existing as any).format;
      const treeRules = (existing as any).treeRules;
      if (format === "tree" || treeRules) {
        detectedFormat = "tree";
        initialTreeRules = treeRules;
      }
    }
  }

  return (
    <PolicyEditorClient
      policyId={id}
      policyName={policyName}
      initialYaml={initialYaml}
      detectedFormat={detectedFormat}
      initialTreeRules={initialTreeRules}
    />
  );
}
