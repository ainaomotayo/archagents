import { describe, it, expect, vi } from "vitest";
import { buildNotificationRuleRoutes } from "./notification-rules.js";

function makeDeps() {
  const db = {
    notificationRule: {
      create: vi.fn().mockResolvedValue({
        id: "rule-1", orgId: "org-1", name: "Slack Critical", topics: ["finding.critical"],
        channelType: "slack", channelConfig: { webhookUrl: "https://hooks.slack.com/xxx" }, enabled: true,
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: "rule-1", name: "Slack Critical", channelType: "slack", enabled: true },
      ]),
      findUnique: vi.fn().mockResolvedValue({ id: "rule-1" }),
      delete: vi.fn().mockResolvedValue({ id: "rule-1" }),
    },
  };
  return { db };
}

describe("buildNotificationRuleRoutes", () => {
  it("createRule stores rule with channel config", async () => {
    const { db } = makeDeps();
    const routes = buildNotificationRuleRoutes({ db: db as any });
    const result = await routes.createRule({
      orgId: "org-1",
      body: { name: "Slack Critical", topics: ["finding.critical"], channelType: "slack", channelConfig: { webhookUrl: "https://hooks.slack.com/xxx" } },
      createdBy: "admin",
    });
    expect(db.notificationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: "org-1", name: "Slack Critical", topics: ["finding.critical"], channelType: "slack" }),
    });
    expect(result.id).toBe("rule-1");
  });

  it("listRules returns rules for org", async () => {
    const { db } = makeDeps();
    const routes = buildNotificationRuleRoutes({ db: db as any });
    const result = await routes.listRules("org-1");
    expect(db.notificationRule.findMany).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("deleteRule removes rule", async () => {
    const { db } = makeDeps();
    const routes = buildNotificationRuleRoutes({ db: db as any });
    await routes.deleteRule("rule-1");
    expect(db.notificationRule.delete).toHaveBeenCalledWith({ where: { id: "rule-1" } });
  });
});
