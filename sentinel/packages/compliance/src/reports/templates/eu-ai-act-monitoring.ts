import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { EuAiActMonitoringReport, type MonitoringPlanData } from "../EuAiActMonitoring.js";
import type { BrandingContext } from "../branding.js";

export const euAiActMonitoringTemplate: ReportTemplate<MonitoringPlanData> = {
  type: "eu_ai_act_post_market_monitoring",
  displayName: "EU AI Act - Post-Market Monitoring Plan",
  description: "Post-market monitoring plan required under Article 72 of the EU AI Act",
  gather: async (_ctx: GatherContext): Promise<MonitoringPlanData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: MonitoringPlanData, branding: BrandingContext) => {
    return createElement(EuAiActMonitoringReport, { data, branding }) as any;
  },
};
