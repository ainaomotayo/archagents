import { getRemediations, getRemediationStats } from "@/lib/api";
import { MOCK_ITEMS, MOCK_STATS } from "@/lib/remediation-mock-data";
import { RemediationQueue } from "@/components/remediations/remediation-queue";

export default async function RemediationsPage() {
  let items, stats;
  try {
    [items, stats] = await Promise.all([getRemediations(), getRemediationStats()]);
  } catch {
    items = MOCK_ITEMS;
    stats = MOCK_STATS;
  }

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
