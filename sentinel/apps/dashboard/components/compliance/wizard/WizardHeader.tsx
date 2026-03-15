"use client";

import Link from "next/link";
import type { Wizard } from "@/lib/wizard-types";

interface WizardHeaderProps {
  wizard: Wizard;
  onGenerateDocuments: () => void;
  onDelete: () => void;
}

export function WizardHeader({ wizard, onGenerateDocuments, onDelete }: WizardHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-surface-1 px-6 py-4">
      <div className="flex items-center gap-4">
        <Link
          href="/compliance/wizards"
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Back
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-text-primary">{wizard.name}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
              EU AI Act
            </span>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
              wizard.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
              wizard.status === "generating" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
              wizard.status === "archived" ? "bg-zinc-500/10 text-zinc-400" :
              "bg-blue-500/10 text-blue-400"
            }`}>
              {wizard.status}
            </span>
            <span className="text-xs text-text-tertiary">
              {Math.round(wizard.progress * 100)}% complete
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onGenerateDocuments}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2/80 transition-colors"
        >
          Generate Documents
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
