interface ClassificationSummary {
  files: number;
  loc: number;
  percentage: number;
}

interface ProvenanceBarProps {
  classifications: {
    human: ClassificationSummary;
    aiGenerated: ClassificationSummary;
    aiAssisted: ClassificationSummary;
    mixed: ClassificationSummary;
    unknown: ClassificationSummary;
  };
}

const colorMap: Record<string, string> = {
  human: "bg-emerald-500",
  aiGenerated: "bg-red-500",
  aiAssisted: "bg-amber-500",
  mixed: "bg-purple-500",
  unknown: "bg-gray-400",
};

const labelMap: Record<string, string> = {
  human: "Human",
  aiGenerated: "AI-Generated",
  aiAssisted: "AI-Assisted",
  mixed: "Mixed",
  unknown: "Unknown",
};

export function ProvenanceBar({ classifications }: ProvenanceBarProps) {
  const entries = Object.entries(classifications) as [string, ClassificationSummary][];
  const total = entries.reduce((sum, [, v]) => sum + v.files, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Provenance distribution">
        {entries
          .filter(([, v]) => v.files > 0)
          .map(([key, v]) => (
            <div
              key={key}
              className={`${colorMap[key]} transition-all`}
              style={{ width: `${(v.files / total) * 100}%` }}
              title={`${labelMap[key]}: ${v.files} files (${(v.percentage * 100).toFixed(0)}%)`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-text-tertiary">
        {entries
          .filter(([, v]) => v.files > 0)
          .map(([key, v]) => (
            <span key={key} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${colorMap[key]}`} />
              {labelMap[key]}: {v.files}
            </span>
          ))}
      </div>
    </div>
  );
}
