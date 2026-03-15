"use client";

import type { AttestationType, AttestationStatus } from "./attestation-types";

interface AttestationFilterBarProps {
  typeFilter: AttestationType | "all";
  statusFilter: AttestationStatus | "all";
  frameworkFilter: string;
  search: string;
  frameworks: string[];
  onTypeChange: (type: AttestationType | "all") => void;
  onStatusChange: (status: AttestationStatus | "all") => void;
  onFrameworkChange: (framework: string) => void;
  onSearchChange: (search: string) => void;
}

const TYPE_OPTIONS: { value: AttestationType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "manual", label: "Manual" },
  { value: "scan_approval", label: "Scan Approval" },
];

const STATUS_OPTIONS: { value: AttestationStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending Review" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "superseded", label: "Superseded" },
];

export function AttestationFilterBar({
  typeFilter,
  statusFilter,
  frameworkFilter,
  search,
  frameworks,
  onTypeChange,
  onStatusChange,
  onFrameworkChange,
  onSearchChange,
}: AttestationFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5" role="group" aria-label="Type filter">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onTypeChange(opt.value)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
              typeFilter === opt.value
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as AttestationStatus | "all")}
        className="rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-[12px] text-text-secondary focus-ring"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        value={frameworkFilter}
        onChange={(e) => onFrameworkChange(e.target.value)}
        className="rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-[12px] text-text-secondary focus-ring"
      >
        <option value="all">All Frameworks</option>
        {frameworks.map((fw) => (
          <option key={fw} value={fw}>
            {fw}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus-ring"
      />
    </div>
  );
}
