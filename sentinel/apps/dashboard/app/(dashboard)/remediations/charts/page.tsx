import Link from "next/link";
import { IconChevronLeft } from "@/components/icons";
import {
  getBurndownData,
  getVelocityData,
  getAgingData,
  getSlaData,
} from "@/lib/api";
import { ChartsGrid } from "./charts-grid";

export default async function RemediationChartsPage() {
  const [burndown, velocity, aging, sla] = await Promise.all([
    getBurndownData(undefined, undefined, 30),
    getVelocityData(undefined, undefined, 30),
    getAgingData(),
    getSlaData(undefined, undefined, 30),
  ]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link
          href="/remediations"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Remediations
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">
          Remediation Analytics
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Burndown, velocity, aging, and SLA compliance charts
        </p>
      </div>
      <div className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <ChartsGrid
          initialBurndown={burndown}
          initialVelocity={velocity}
          initialAging={aging}
          initialSla={sla}
        />
      </div>
    </div>
  );
}
