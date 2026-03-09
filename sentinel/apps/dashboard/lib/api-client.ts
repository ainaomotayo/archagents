/**
 * Server-side API client for fetching data from the SENTINEL API.
 * Uses HMAC signing for authentication.
 */

const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
const API_SECRET = process.env.SENTINEL_SECRET ?? "";

export async function apiGet<T>(path: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(path, API_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  const body = "";
  // Dynamic import to avoid bundling issues in edge runtime
  const { signRequest } = await import("@sentinel/auth");
  const signature = signRequest(body, API_SECRET);

  const res = await fetch(url.toString(), {
    headers: {
      "X-Sentinel-Signature": signature,
      "X-Sentinel-API-Key": "dashboard",
    },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, data: unknown): Promise<T> {
  const url = new URL(path, API_URL);
  const bodyStr = JSON.stringify(data);
  const { signRequest } = await import("@sentinel/auth");
  const signature = signRequest(bodyStr, API_SECRET);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentinel-Signature": signature,
      "X-Sentinel-API-Key": "dashboard",
    },
    body: bodyStr,
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
