export interface SsoAuditEvent {
  action: string;
  actorType: string;
  actorId: string;
  actorName: string;
  actorIp?: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
}

export function buildSsoAuditEvent(
  action: string,
  params: { provider: string; email: string; ip?: string; orgId: string; reason?: string; role?: string },
): SsoAuditEvent {
  return {
    action,
    actorType: "user",
    actorId: params.email,
    actorName: params.email,
    actorIp: params.ip,
    resourceType: "sso_session",
    resourceId: params.orgId,
    detail: {
      provider: params.provider,
      email: params.email,
      ...(params.reason && { reason: params.reason }),
      ...(params.role && { role: params.role }),
    },
  };
}

export async function emitSsoAuditEvent(
  action: string,
  params: { provider: string; email: string; ip?: string; orgId: string; reason?: string; role?: string },
): Promise<void> {
  try {
    const apiUrl = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
    const event = buildSsoAuditEvent(action, params);
    await fetch(`${apiUrl}/v1/audit-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId: params.orgId, ...event }),
    });
  } catch {
    // Fail-open: audit failure should not block auth
  }
}
