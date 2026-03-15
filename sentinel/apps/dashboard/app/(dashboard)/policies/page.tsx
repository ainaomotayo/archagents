import Link from "next/link";
import { getPolicies } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { IconPlus, IconShield } from "@/components/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PoliciesPage() {
  const policies = await getPolicies();

  const activeCount = policies.filter((p) => p.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description={`${activeCount} active / ${policies.length} total policies`}
        action={
          <Link
            href="/policies/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 focus-ring"
          >
            <IconPlus className="h-4 w-4" />
            New Policy
          </Link>
        }
      />

      {policies.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
          <div className="text-center">
            <IconShield className="mx-auto h-8 w-8 text-text-tertiary" />
            <p className="mt-3 text-[14px] font-semibold text-text-primary">
              No policies configured
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              Create your first policy to start governing AI-generated code.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {policies.map((policy, i) => (
            <div
              key={policy.id}
              className="animate-fade-up group rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2"
              style={{ animationDelay: `${0.04 * i}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-surface-3">
                    <IconShield className="h-4 w-4 text-text-tertiary group-hover:text-accent transition-colors" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                      {policy.name}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      Updated {formatDate(policy.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  {(policy as any).format === "tree" || (policy as any).treeRules ? (
                    <span className="rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-semibold">Visual</span>
                  ) : (
                    <span className="rounded-full bg-surface-1 text-text-tertiary px-2 py-0.5 text-[10px] font-semibold">YAML</span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                      policy.enabled
                        ? "bg-status-pass/15 text-status-pass border-status-pass/30"
                        : "bg-surface-3 text-text-tertiary border-border"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        policy.enabled ? "bg-status-pass" : "bg-text-tertiary"
                      }`}
                    />
                    {policy.enabled ? "Active" : "Disabled"}
                  </span>

                  <div className="h-6 w-px bg-border" />

                  <div className="text-right">
                    <p className="text-lg font-bold text-text-primary">
                      {policy.ruleCount}
                    </p>
                    <p className="text-[9px] uppercase tracking-wider text-text-tertiary">
                      rules
                    </p>
                  </div>

                  <div className="h-6 w-px bg-border" />

                  <Link
                    href={`/policies/${policy.id}`}
                    className="text-[13px] font-medium text-accent hover:brightness-110 focus-ring rounded"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
