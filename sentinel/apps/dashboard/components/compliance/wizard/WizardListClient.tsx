"use client";

import { useState } from "react";
import Link from "next/link";
import type { Wizard } from "@/lib/wizard-types";

interface WizardListClientProps {
  wizards: Wizard[];
}

export function WizardListClient({ wizards: initial }: WizardListClientProps) {
  const [wizards] = useState(initial);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Compliance Wizards</h1>
          <p className="text-sm text-text-secondary">Step-by-step EU AI Act compliance guidance</p>
        </div>
        <Link
          href="/compliance/wizards/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          Create Wizard
        </Link>
      </div>

      {wizards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-1 py-16">
          <div className="text-4xl mb-4">
            <svg className="h-10 w-10 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-text-primary mb-2">No compliance wizards yet</h2>
          <p className="text-sm text-text-secondary mb-6">Create a wizard to start your EU AI Act compliance journey</p>
          <Link
            href="/compliance/wizards/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            Create Your First Wizard
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Framework</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {wizards.map((w) => (
                <tr key={w.id} className="hover:bg-surface-2/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-text-primary">{w.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                      EU AI Act
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${Math.round(w.progress * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-secondary">{Math.round(w.progress * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      w.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                      w.status === "generating" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
                      w.status === "archived" ? "bg-zinc-500/10 text-zinc-400" :
                      "bg-blue-500/10 text-blue-400"
                    }`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/compliance/wizards/${w.id}`} className="text-accent hover:underline text-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
