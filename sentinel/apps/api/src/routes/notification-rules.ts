interface RuleDeps {
  db: any;
}

interface CreateRuleInput {
  orgId: string;
  body: { name: string; topics: string[]; condition?: Record<string, unknown>; channelType: string; channelConfig: Record<string, unknown> };
  createdBy?: string;
}

export function buildNotificationRuleRoutes(deps: RuleDeps) {
  async function createRule(input: CreateRuleInput) {
    const { orgId, body, createdBy } = input;
    return deps.db.notificationRule.create({
      data: { orgId, name: body.name, topics: body.topics, condition: body.condition ?? null, channelType: body.channelType, channelConfig: body.channelConfig, createdBy: createdBy ?? null },
    });
  }

  async function listRules(orgId: string) {
    return deps.db.notificationRule.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
  }

  async function deleteRule(id: string) {
    return deps.db.notificationRule.delete({ where: { id } });
  }

  return { createRule, listRules, deleteRule };
}
