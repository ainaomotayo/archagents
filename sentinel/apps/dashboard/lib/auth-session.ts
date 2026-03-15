type FetchFn = typeof globalThis.fetch;

export interface CreateSessionParams {
  userId: string;
  orgId: string;
  provider: string;
  ipAddress?: string;
  deviceInfo?: string;
}

export interface SessionValidation {
  valid: boolean;
  reason?: "revoked" | "expired" | "idle_timeout" | "not_found";
}

export async function createServerSession(
  params: CreateSessionParams,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<string | null> {
  try {
    const apiUrl = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
    const res = await fetchFn(`${apiUrl}/v1/auth/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sessionId ?? null;
  } catch {
    return null; // Fail-open
  }
}

export async function validateServerSession(
  sessionId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<SessionValidation> {
  try {
    const apiUrl = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
    const res = await fetchFn(`${apiUrl}/v1/auth/sessions/${encodeURIComponent(sessionId)}/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return { valid: true }; // Fail-open on API error
    return await res.json();
  } catch {
    return { valid: true }; // Fail-open
  }
}
