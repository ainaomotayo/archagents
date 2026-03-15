"use client";

import { useState } from "react";
import type { EvidenceType } from "./attestation-types";

interface EvidenceReferenceFormProps {
  onAdd: (evidence: {
    type: EvidenceType;
    title: string;
    refId: string | null;
    url: string | null;
    source: string | null;
    metadata: Record<string, unknown>;
  }) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS: { value: EvidenceType; label: string }[] = [
  { value: "url", label: "URL" },
  { value: "ticket", label: "Ticket" },
  { value: "document", label: "Document" },
];

export function EvidenceReferenceForm({ onAdd, onCancel }: EvidenceReferenceFormProps) {
  const [type, setType] = useState<EvidenceType>("url");
  const [title, setTitle] = useState("");
  const [urlOrRef, setUrlOrRef] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      type,
      title: title.trim(),
      refId: type === "ticket" ? urlOrRef.trim() || null : null,
      url: type === "url" ? urlOrRef.trim() || null : null,
      source: null,
      metadata: {},
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-3">
      <div className="flex gap-2">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              type === opt.value
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus-ring"
      />
      <input
        type="text"
        placeholder={type === "ticket" ? "Reference ID (e.g., JIRA-1234)" : type === "url" ? "URL" : "Document reference"}
        value={urlOrRef}
        onChange={(e) => setUrlOrRef(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus-ring"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="rounded-lg bg-accent px-3 py-1 text-[12px] font-semibold text-text-inverse hover:brightness-110 transition-all disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
