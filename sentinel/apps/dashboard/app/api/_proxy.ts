/**
 * Shared proxy helper for Next.js API routes that need to forward requests
 * to the SENTINEL backend with HMAC auth.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
const API_SECRET = process.env.SENTINEL_SECRET ?? "";

export async function buildProxyHeaders(bodyStr = ""): Promise<Record<string, string>> {
  try {
    const { signRequest } = await import("@sentinel/auth");
    const session = await getServerSession(authOptions);
    const orgId = process.env.SENTINEL_ORG_ID ?? "00000000-0000-0000-0000-000000000001";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Sentinel-Signature": signRequest(bodyStr, API_SECRET),
      "X-Sentinel-API-Key": "dashboard",
      "X-Sentinel-Org-Id": orgId,
    };
    if (session?.user) {
      if ((session.user as any).role) headers["X-Sentinel-Role"] = (session.user as any).role;
    }
    return headers;
  } catch {
    return { "Content-Type": "application/json" };
  }
}

export async function requireSession(): Promise<Response | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return null;
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export function backendUrl(path: string): string {
  return `${API_URL}${path}`;
}

export async function proxyGet(path: string): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;
  const headers = await buildProxyHeaders();
  const res = await fetch(backendUrl(path), { headers });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function proxyPost(path: string, bodyStr: string): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;
  const headers = await buildProxyHeaders(bodyStr);
  const res = await fetch(backendUrl(path), { method: "POST", headers, body: bodyStr });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function proxyPut(path: string, bodyStr: string): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;
  const headers = await buildProxyHeaders(bodyStr);
  const res = await fetch(backendUrl(path), { method: "PUT", headers, body: bodyStr });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function proxyPatch(path: string, bodyStr: string): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;
  const headers = await buildProxyHeaders(bodyStr);
  const res = await fetch(backendUrl(path), { method: "PATCH", headers, body: bodyStr });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function proxyDelete(path: string): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;
  const headers = await buildProxyHeaders();
  const res = await fetch(backendUrl(path), { method: "DELETE", headers });
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return new Response(null, { status: res.status });
  }
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
