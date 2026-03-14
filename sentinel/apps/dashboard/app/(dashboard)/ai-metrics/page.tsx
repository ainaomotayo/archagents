import { PageHeader } from "@/components/page-header";
import {
  getAIMetricsStats,
  getAIMetricsTrend,
  getAIMetricsProjects,
  getAIMetricsAlerts,
  getAIMetricsConfig,
} from "@/lib/api";
import { AIMetricsClient } from "./ai-metrics-client";

export default async function AIMetricsPage() {
  const [stats, trend, projects, alerts, config] = await Promise.all([
    getAIMetricsStats(),
    getAIMetricsTrend(30),
    getAIMetricsProjects(),
    getAIMetricsAlerts(),
    getAIMetricsConfig(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Code Metrics"
        description="Org-wide AI-generated code analysis"
      />
      <AIMetricsClient
        initialStats={stats}
        initialTrend={trend}
        initialProjects={projects}
        initialAlerts={alerts}
        initialConfig={config}
      />
    </div>
  );
}
