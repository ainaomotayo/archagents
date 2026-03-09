import Link from "next/link";
import { MOCK_POLICIES } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { IconPlus } from "@/components/icons";

export default function PoliciesPage() {
  const policies = MOCK_POLICIES;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description="Manage scanning and compliance policies for your organization."
        action={
          <Link
            href="/dashboard/policies/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 focus-ring"
          >
            <IconPlus className="h-4 w-4" />
            New Policy
          </Link>
        }
      />

      <div className="animate-fade-up overflow-hidden rounded-xl border border-border bg-surface-1" style={{ animationDelay: "0.05s" }}>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Name</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Rules</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Updated</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {policies.map((policy) => (
              <tr key={policy.id} className="table-row-hover transition-colors">
                <td className="px-5 py-3.5 font-medium text-text-primary">
                  {policy.name}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                      policy.enabled
                        ? "bg-status-pass/15 text-status-pass border-status-pass/30"
                        : "bg-surface-3 text-text-tertiary border-border"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${policy.enabled ? "bg-status-pass" : "bg-text-tertiary"}`} />
                    {policy.enabled ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-text-secondary">
                  {policy.ruleCount} rules
                </td>
                <td className="px-5 py-3.5 text-xs text-text-tertiary">
                  {new Date(policy.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/dashboard/policies/${policy.id}`}
                    className="text-[13px] font-medium text-accent hover:brightness-110 focus-ring rounded"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
