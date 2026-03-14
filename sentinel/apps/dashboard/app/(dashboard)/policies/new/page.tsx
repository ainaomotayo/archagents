"use client";

import { useState, useCallback, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PolicyEditor } from "@/components/policy-editor";
import {
  PolicyValidator,
  validatePolicy,
  type ValidationMessage,
} from "@/components/policy-validator";
import { PolicyBuilder } from "@/components/policy-builder";
import type { GroupNode } from "@/components/policy-builder";
import { IconChevronLeft } from "@/components/icons";
import { createPolicy } from "../[id]/actions";

const DEFAULT_POLICY = `version: "1.0"
rules:
  - id: example-rule
    severity: medium
    enabled: true
    description: "Describe what this rule checks"
    threshold: 0
`;

export default function NewPolicyPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const yamlRef = useRef(DEFAULT_POLICY);
  const treeRef = useRef<GroupNode | null>(null);
  const [policyName, setPolicyName] = useState("New Policy");
  const [activeTab, setActiveTab] = useState<"visual" | "yaml">("visual");
  const [messages, setMessages] = useState<ValidationMessage[]>(() =>
    validatePolicy(DEFAULT_POLICY),
  );
  const [treeValid, setTreeValid] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleYamlChange = useCallback((value: string) => {
    yamlRef.current = value;
    setMessages(validatePolicy(value));
    setSaved(false);
    setSaveError(null);
  }, []);

  const handleTreeChange = useCallback((tree: GroupNode) => {
    treeRef.current = tree;
    // A tree with at least one child is considered valid
    setTreeValid(tree.children.length > 0);
    setSaved(false);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(() => {
    if (activeTab === "yaml") {
      const errors = messages.filter((m) => m.level === "error");
      if (errors.length > 0) return;
      startTransition(async () => {
        try {
          const payload = { name: policyName, rules: yamlRef.current, format: "yaml" as const };
          const result = await createPolicy(payload);
          setSaved(true);
          setSaveError(null);
          if (result && (result as any).id) {
            setTimeout(() => router.push(`/policies/${(result as any).id}`), 1000);
          } else {
            setTimeout(() => router.push("/policies"), 1000);
          }
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : "Save failed");
        }
      });
    } else {
      startTransition(async () => {
        try {
          const payload = {
            name: policyName,
            treeRules: treeRef.current,
            format: "tree" as const,
          };
          const result = await createPolicy(payload);
          setSaved(true);
          setSaveError(null);
          if (result && (result as any).id) {
            setTimeout(() => router.push(`/policies/${(result as any).id}`), 1000);
          } else {
            setTimeout(() => router.push("/policies"), 1000);
          }
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : "Save failed");
        }
      });
    }
  }, [activeTab, messages, policyName, router]);

  const yamlErrorCount = messages.filter((m) => m.level === "error").length;
  const hasErrors = activeTab === "yaml" ? yamlErrorCount > 0 : !treeValid;
  const errorDisplay =
    activeTab === "yaml" ? (
      yamlErrorCount > 0 ? (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-status-fail" />
          <span className="text-status-fail">
            {yamlErrorCount} {yamlErrorCount === 1 ? "error" : "errors"}
          </span>
        </>
      ) : (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-status-pass" />
          <span className="text-status-pass">Valid</span>
        </>
      )
    ) : treeValid ? (
      <>
        <span className="inline-block h-2 w-2 rounded-full bg-status-pass" />
        <span className="text-status-pass">Valid</span>
      </>
    ) : (
      <>
        <span className="inline-block h-2 w-2 rounded-full bg-status-warn" />
        <span className="text-text-tertiary">Add rules to save</span>
      </>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="animate-fade-up">
          <Link
            href="/policies"
            className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Policies
          </Link>
          <div className="mt-3">
            <input
              type="text"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              className="text-xl font-bold tracking-tight text-text-primary bg-transparent border-none outline-none focus:ring-1 focus:ring-accent rounded px-1 -ml-1"
              placeholder="Policy name"
            />
          </div>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            Create a new policy using the visual builder or YAML editor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[12px] font-medium">
            {errorDisplay}
          </span>
          <button
            onClick={handleSave}
            disabled={hasErrors || isPending}
            aria-label={saved ? "Policy created" : "Create policy"}
            className={`rounded-lg px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-ring ${
              saved ? "bg-status-pass" : saveError ? "bg-status-fail" : "bg-accent"
            }`}
          >
            {isPending ? "Creating..." : saved ? "\u2713 Created" : saveError ? "Retry" : "Create Policy"}
          </button>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="animate-fade-up flex items-center gap-4" style={{ animationDelay: "0.03s" }}>
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-surface-1">
          <button
            onClick={() => setActiveTab("visual")}
            className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
              activeTab === "visual"
                ? "bg-accent text-text-inverse shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => setActiveTab("yaml")}
            className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
              activeTab === "yaml"
                ? "bg-accent text-text-inverse shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            YAML
          </button>
        </div>
      </div>

      {/* Editor area */}
      {activeTab === "visual" ? (
        <div className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
          <PolicyBuilder onChange={handleTreeChange} />
        </div>
      ) : (
        <div className="animate-fade-up grid gap-6 lg:grid-cols-3" style={{ animationDelay: "0.05s" }}>
          <div className="lg:col-span-2 rounded-lg border border-accent/20 shadow-[0_0_12px_rgba(34,211,197,0.06)]">
            <PolicyEditor initialValue={DEFAULT_POLICY} onChange={handleYamlChange} />
          </div>
          <div>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
              Validation
            </h2>
            <PolicyValidator messages={messages} />
          </div>
        </div>
      )}
    </div>
  );
}
