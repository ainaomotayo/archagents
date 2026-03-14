"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { validateTree } from "@sentinel/policy-engine";
import type { ValidationIssue } from "@sentinel/policy-engine";
import { useTree } from "./tree-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationContextValue {
  issues: ValidationIssue[];
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ValidationContext = createContext<ValidationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ValidationProvider({ children }: { children: ReactNode }) {
  const { tree } = useTree();

  const value = useMemo<ValidationContextValue>(() => {
    const issues = validateTree(tree);
    const errorCount = issues.filter((i) => i.level === "error").length;
    const warningCount = issues.filter((i) => i.level === "warning").length;
    return {
      issues,
      hasErrors: errorCount > 0,
      errorCount,
      warningCount,
    };
  }, [tree]);

  return <ValidationContext value={value}>{children}</ValidationContext>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useValidation(): ValidationContextValue {
  const ctx = useContext(ValidationContext);
  if (!ctx) {
    throw new Error("useValidation must be used within a <ValidationProvider>");
  }
  return ctx;
}
