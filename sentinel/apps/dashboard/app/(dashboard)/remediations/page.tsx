import { getRemediations, getRemediationStats } from "@/lib/api";
import { RemediationQueue } from "@/components/remediations/remediation-queue";

export default async function RemediationsPage() {
  const [items, stats] = await Promise.all([getRemediations(), getRemediationStats()]);

  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-[20px] font-semibold text-text-primary">Remediations</h1>
        <p className="text-[13px] text-text-tertiary">Track and manage compliance and security remediation tasks</p>
      </div>
      <RemediationQueue initialItems={items} initialStats={stats} />
    </div>
  );
}
