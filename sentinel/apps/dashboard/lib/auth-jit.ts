type FetchFn = typeof globalThis.fetch;

interface JitClaims {
  email: string;
  name?: string;
  sub: string;
  groups?: string[];
}

interface JitResult {
  action: "created" | "updated" | "skipped";
  userId: string;
  role: string;
}

export async function tryJitProvision(
  claims: JitClaims,
  provider: string,
  orgId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<JitResult | null> {
  try {
    const apiUrl = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
    const res = await fetchFn(`${apiUrl}/v1/auth/jit-provision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claims, provider, orgId }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null; // Fail-open
  }
}
