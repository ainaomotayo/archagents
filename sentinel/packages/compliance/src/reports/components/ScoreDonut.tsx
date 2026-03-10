import { Svg, Circle, Text as SvgText } from "@react-pdf/renderer";

interface ScoreDonutProps {
  score: number;
  size?: number;
}

export function ScoreDonut({ score, size = 80 }: ScoreDonutProps) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * score;
  const color = score >= 0.95 ? "#22c55e" : score >= 0.80 ? "#eab308" : score >= 0.60 ? "#f97316" : "#ef4444";

  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      <Circle cx="40" cy="40" r={radius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
      <Circle cx="40" cy="40" r={radius} stroke={color} strokeWidth="8" fill="none"
        strokeDasharray={`${filled} ${circumference - filled}`} strokeLinecap="round"
        transform="rotate(-90 40 40)" />
      <SvgText x="40" y="44" textAnchor="middle" fill="#111827">
        {Math.round(score * 100)}%
      </SvgText>
    </Svg>
  );
}
