"use client";

import { useMemo } from "react";
import { compileToYaml } from "@sentinel/policy-engine";
import { useTree } from "../contexts/tree-context";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function YamlPreview() {
  const { tree } = useTree();

  const yaml = useMemo(() => {
    try {
      return compileToYaml(tree);
    } catch {
      return "# Error compiling YAML";
    }
  }, [tree]);

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
        YAML Preview
      </h3>
      <div className="rounded-xl border border-border bg-surface-0 overflow-auto max-h-[300px]">
        <pre className="font-mono text-[13px] leading-6 text-text-primary p-4">
          {yaml}
        </pre>
      </div>
    </div>
  );
}
