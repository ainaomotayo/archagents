import Link from "next/link";
import { IconChevronLeft } from "@/components/icons";
import { getWorkflowConfig } from "@/lib/api";
import { WorkflowClient } from "./workflow-client";

export default async function WorkflowSettingsPage() {
  const config = await getWorkflowConfig();

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">
          Workflow Configuration
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Customize the remediation pipeline stages for your organization.
        </p>
      </div>
      <div className="animate-fade-up max-w-2xl rounded-xl border border-border bg-surface-1 p-6" style={{ animationDelay: "0.05s" }}>
        <WorkflowClient initialSkipStages={config.skipStages} />
      </div>
    </div>
  );
}
