"use client";

export type TypeFilter = "all" | "compliance" | "finding";
export type StatusFilter = "all" | "open" | "in_progress" | "completed" | "accepted_risk";
export type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";

interface RemediationFiltersProps {
  type: TypeFilter;
  status: StatusFilter;
  priority: PriorityFilter;
  framework: string;
  assignee: string;
  search: string;
  onTypeChange: (v: TypeFilter) => void;
  onStatusChange: (v: StatusFilter) => void;
  onPriorityChange: (v: PriorityFilter) => void;
  onFrameworkChange: (v: string) => void;
  onAssigneeChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  frameworks: string[];
  assignees: string[];
}

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "compliance", label: "Compliance" },
  { value: "finding", label: "Finding" },
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "accepted_risk", label: "Accepted" },
];

const PRIORITY_TABS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function PillButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? "bg-accent-subtle text-accent border border-accent/30"
          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

export function RemediationFilters({
  type,
  status,
  priority,
  framework,
  assignee,
  search,
  onTypeChange,
  onStatusChange,
  onPriorityChange,
  onFrameworkChange,
  onAssigneeChange,
  onSearchChange,
  frameworks,
  assignees,
}: RemediationFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Top row: type + status pills, search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {TYPE_TABS.map(({ value, label }) => (
            <PillButton
              key={value}
              active={type === value}
              label={label}
              onClick={() => onTypeChange(value)}
            />
          ))}
          <span className="mx-1 self-center text-border">|</span>
          {STATUS_TABS.map(({ value, label }) => (
            <PillButton
              key={value}
              active={status === value}
              label={label}
              onClick={() => onStatusChange(value)}
            />
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title, description..."
          aria-label="Search remediation items"
          className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Bottom row: priority pills, framework, assignee */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {PRIORITY_TABS.map(({ value, label }) => (
            <PillButton
              key={value}
              active={priority === value}
              label={label}
              onClick={() => onPriorityChange(value)}
            />
          ))}
        </div>
        {frameworks.length > 0 && (
          <select
            value={framework}
            onChange={(e) => onFrameworkChange(e.target.value)}
            aria-label="Filter by framework"
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All frameworks</option>
            {frameworks.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        )}
        {assignees.length > 0 && (
          <select
            value={assignee}
            onChange={(e) => onAssigneeChange(e.target.value)}
            aria-label="Filter by assignee"
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All assignees</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
