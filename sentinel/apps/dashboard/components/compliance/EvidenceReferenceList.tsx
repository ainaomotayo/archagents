"use client";

import { useState } from "react";
import type { EvidenceType } from "./attestation-types";
import { EvidenceReferenceForm } from "./EvidenceReferenceForm";

export interface EvidenceItem {
  type: EvidenceType;
  title: string;
  refId: string | null;
  url: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
}

interface EvidenceReferenceListProps {
  evidence: EvidenceItem[];
  onChange: (evidence: EvidenceItem[]) => void;
}

function EvidenceIcon({ type }: { type: EvidenceType }) {
  const cls = "h-3.5 w-3.5 text-text-tertiary";
  switch (type) {
    case "url":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "ticket":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "snapshot":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

export function EvidenceReferenceList({ evidence, onChange }: EvidenceReferenceListProps) {
  const [showForm, setShowForm] = useState(false);

  const handleAdd = (item: EvidenceItem) => {
    onChange([...evidence, item]);
    setShowForm(false);
  };

  const handleRemove = (index: number) => {
    if (evidence[index].type === "snapshot") return;
    onChange(evidence.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-text-secondary">
          Evidence References
        </label>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-[11px] font-medium text-accent hover:brightness-110 transition-colors"
        >
          + Add
        </button>
      </div>

      {evidence.length > 0 && (
        <div className="space-y-1.5">
          {evidence.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <EvidenceIcon type={item.type} />
                <span className="text-[12px] text-text-primary">{item.title}</span>
                {item.url && (
                  <span className="text-[10px] text-text-tertiary truncate max-w-[200px]">
                    {item.url}
                  </span>
                )}
                {item.refId && (
                  <span className="text-[10px] text-text-tertiary">{item.refId}</span>
                )}
              </div>
              {item.type !== "snapshot" ? (
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="text-[11px] text-text-tertiary hover:text-status-fail transition-colors"
                >
                  x
                </button>
              ) : (
                <span className="text-[10px] text-status-pass">auto</span>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <EvidenceReferenceForm
          onAdd={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
