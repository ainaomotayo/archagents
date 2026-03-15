export interface ProvisionResult {
  success: boolean;
  hookIds: string[];
  errors: string[];
}

export interface WebhookInfo {
  id: string;
  eventType: string;
  url: string;
  active: boolean;
}

interface AzureDevOpsConfig {
  organizationUrl: string;
  projectName: string;
  pat: string;
}

export async function provisionAzureDevOpsHooks(
  config: AzureDevOpsConfig,
  callbackUrl: string,
): Promise<ProvisionResult> {
  const authHeader = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;
  const baseUrl = `${config.organizationUrl}/_apis/hooks/subscriptions?api-version=7.0`;

  const eventTypes = [
    "git.push",
    "git.pullrequest.created",
    "git.pullrequest.updated",
  ];

  const hookIds: string[] = [];
  const errors: string[] = [];

  for (const eventType of eventTypes) {
    try {
      const resp = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publisherId: "tfs",
          eventType,
          consumerId: "webHooks",
          consumerActionId: "httpRequest",
          publisherInputs: {
            projectId: config.projectName,
            repository: "",
          },
          consumerInputs: {
            url: callbackUrl,
          },
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        errors.push(`${eventType}: ${resp.status} ${text}`);
        continue;
      }

      const data = (await resp.json()) as { id: string };
      hookIds.push(data.id);
    } catch (err: any) {
      errors.push(`${eventType}: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    hookIds,
    errors,
  };
}

export async function listAzureDevOpsHooks(
  config: AzureDevOpsConfig,
): Promise<WebhookInfo[]> {
  const authHeader = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;
  const url = `${config.organizationUrl}/_apis/hooks/subscriptions?api-version=7.0`;

  const resp = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!resp.ok) return [];

  const data = (await resp.json()) as { value?: Array<any> };
  return (data.value ?? [])
    .filter((s: any) => s.consumerId === "webHooks")
    .map((s: any) => ({
      id: s.id,
      eventType: s.eventType,
      url: s.consumerInputs?.url ?? "",
      active: s.status === "enabled",
    }));
}
