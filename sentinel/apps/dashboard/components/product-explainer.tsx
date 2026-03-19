import type { ReactNode } from "react";
import { IconSearch, IconShieldCheck, IconBarChart } from "@/components/icons";

interface FeatureCard {
  icon: ReactNode;
  title: string;
  description: string;
}

const CARDS: FeatureCard[] = [
  {
    icon: <IconSearch className="h-5 w-5" />,
    title: "Scan",
    description:
      "Every push triggers security, dependency, AI-usage, and policy checks across your codebase.",
  },
  {
    icon: <IconShieldCheck className="h-5 w-5" />,
    title: "Certify",
    description:
      "Clean scans earn tamper-proof certificates with risk scores attached to each commit.",
  },
  {
    icon: <IconBarChart className="h-5 w-5" />,
    title: "Govern",
    description:
      "Track SOC2, SLSA, and custom frameworks. Enforce approval gates before merging.",
  },
];

export function ProductExplainer() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {CARDS.map((card) => (
        <div
          key={card.title}
          className="rounded-xl border border-border bg-surface-1 p-5 group hover:border-border-accent hover:bg-surface-2 transition-all"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
            {card.icon}
          </div>
          <h3 className="text-[14px] font-semibold text-text-primary mb-1.5">{card.title}</h3>
          <p className="text-[12px] leading-relaxed text-text-tertiary">{card.description}</p>
        </div>
      ))}
    </div>
  );
}
