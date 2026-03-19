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
import { updatePolicy, createPolicy } from "./actions";

interface PolicyEditorClientProps {
  policyId: string;
  policyName: string;
  initialYaml: string;
  detectedFormat: "tree" | "yaml";
  initialTreeRules?: GroupNode;
}

export function PolicyEditorClient({
  policyId,
  policyName,
  initialYaml,
  detectedFormat,
  initialTreeRules,
}: PolicyEditorClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const yamlRef = useRef(initialYaml);
  const treeRef = useRef<GroupNode | null>(initialTreeRules ?? null);
  const [messages, setMessages] = useState<ValidationMessage[]>(() =>
    validatePolicy(initialYaml),
  );
  const [treeValid, setTreeValid] = useState(
    detectedFormat === "tree" ? (initialTreeRules?.children?.length ?? 0) > 0 : true,
  );
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isNew = policyId === "new";

  const handleChange = useCallback((value: string) => {
    yamlRef.current = value;
    setMessages(validatePolicy(value));
    setSaved(false);
    setSaveError(null);
  }, []);

  const handleTreeChange = useCallback((tree: GroupNode) => {
    treeRef.current = tree;
    setTreeValid(tree.children.length > 0);
    setSaved(false);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(() => {
    if (detectedFormat === "yaml") {
      const errors = messages.filter((m) => m.level === "error");
      if (errors.length > 0) return;
      startTransition(async () => {
        try {
          const payload = { name: policyName, rules: yamlRef.current, format: "yaml" as const };
          if (isNew) {
            const result = await createPolicy(payload);
            setSaved(true);
            if (result && (result as any).id) {
              setTimeout(() => router.push(`/policies/${(result as any).id}`), 1000);
            }
          } else {
            await updatePolicy(policyId, payload);
            setSaved(true);
          }
          setSaveError(null);
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
          if (isNew) {
            const result = await createPolicy(payload);
            setSaved(true);
            if (result && (result as any).id) {
              setTimeout(() => router.push(`/policies/${(result as any).id}`), 1000);
            }
          } else {
            await updatePolicy(policyId, payload);
            setSaved(true);
          }
          setSaveError(null);
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : "Save failed");
        }
      });
    }
  }, [detectedFormat, messages, isNew, policyName, policyId, router]);

  const yamlErrorCount = messages.filter((m) => m.level === "error").length;
  const hasErrors = detectedFormat === "yaml" ? yamlErrorCount > 0 : !treeValid;

  const validationDisplay =
    detectedFormat === "yaml" ? (
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
          <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">{policyName}</h1>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            {detectedFormat === "tree"
              ? "Edit the policy using the visual builder."
              : "Edit the policy YAML below. Validation runs in real-time."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[12px] font-medium">
            {validationDisplay}
          </span>
          {detectedFormat === "yaml" && (
            <span
              className="rounded-lg px-3 py-2 text-[12px] font-medium text-text-tertiary border border-border cursor-not-allowed opacity-50"
              title="Coming in Phase 2"
            >
              Convert to Visual
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={hasErrors || isPending}
            aria-label={saved ? "Policy saved" : "Save policy"}
            className={`rounded-lg px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-ring ${
              saved ? "bg-status-pass" : saveError ? "bg-status-fail" : "bg-accent"
            }`}
          >
            {isPending ? "Saving..." : saved ? "\u2713 Saved" : saveError ? "Retry Save" : "Save Policy"}
          </button>
        </div>
      </div>

      {detectedFormat === "tree" ? (
        <div className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
          <PolicyBuilder
            initialTree={initialTreeRules}
            onChange={handleTreeChange}
          />
        </div>
      ) : (
        <div className="animate-fade-up grid gap-6 lg:grid-cols-3" style={{ animationDelay: "0.05s" }}>
          <div className="lg:col-span-2 rounded-lg border border-accent/20 shadow-[0_0_12px_rgba(34,211,197,0.06)]">
            <PolicyEditor initialValue={initialYaml} onChange={handleChange} />
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
