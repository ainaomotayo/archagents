import type { FrameworkScore } from "./types";

interface SummaryCardsProps {
  frameworks: FrameworkScore[];
}

export function SummaryCards({ frameworks }: SummaryCardsProps) {
  const avgScore = frameworks.length > 0
    ? frameworks.reduce((sum, fw) => sum + fw.score, 0) / frameworks.length
    : 0;

  const totalControls = frameworks.reduce(
    (sum, fw) => sum + fw.controlScores.length,
    0,
  );

  const metControls = frameworks.reduce(
    (sum, fw) =>
      sum + fw.controlScores.filter((c) => c.score >= 0.80).length,
    0,
  );

  const unmetControls = totalControls - metControls;

  const cards = [
    { label: "Score", value: `${Math.round(avgScore * 100)}%` },
    { label: "Met", value: String(metControls) },
    { label: "Unmet", value: String(unmetControls) },
    { label: "Frameworks", value: `${frameworks.length} active` },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-surface-1 px-4 py-3"
        >
          <p className="text-[11px] font-medium text-text-tertiary">
            {card.label}
          </p>
          <p className="mt-1 text-lg font-bold text-text-primary">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
