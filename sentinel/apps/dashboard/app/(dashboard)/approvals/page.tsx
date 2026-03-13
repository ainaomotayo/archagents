import { getApprovalGates, getApprovalStats } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ApprovalQueue } from "@/components/approvals/approval-queue";

export default async function ApprovalsPage() {
  const [gates, stats] = await Promise.all([
    getApprovalGates(),
    getApprovalStats(),
  ]);

  const actionableCount = gates.filter(
    (g) => g.status === "pending" || g.status === "escalated",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description={`${actionableCount} gates awaiting review${stats.escalated > 0 ? ` · ${stats.escalated} escalated` : ""}`}
      />
      <ApprovalQueue initialGates={gates} initialStats={stats} />
    </div>
  );
}
