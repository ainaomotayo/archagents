interface SignalBarProps {
  name: string;
  weight: number;
  probability: number;
  contribution: number;
  overallScore: number;
}

function barColor(contribution: number): string {
  if (contribution > 0.2) return "bg-status-error";
  if (contribution > 0.1) return "bg-status-warn";
  return "bg-text-tertiary";
}

export function SignalBar({
  name,
  weight,
  probability,
  contribution,
  overallScore,
}: SignalBarProps) {
  const pct = overallScore > 0 ? (contribution / overallScore) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-right text-[11px] font-medium text-text-secondary">
        {name}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-surface-3">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${barColor(contribution)}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-40 text-[10px] tabular-nums text-text-tertiary">
        {(weight * 100).toFixed(0)}% &times; {probability.toFixed(2)} = {(contribution * 100).toFixed(0)}%
      </span>
    </div>
  );
}
