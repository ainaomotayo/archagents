/**
 * GET /api/org
 *
 * Returns the current organisation's name for display in the dashboard header.
 * Proxies to the SENTINEL API's /v1/org endpoint using the server session.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
const API_SECRET = process.env.SENTINEL_SECRET ?? "";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { signRequest } = await import("@sentinel/auth");
    return {
      "X-Sentinel-Signature": signRequest("", API_SECRET),
      "X-Sentinel-API-Key": "dashboard",
    };
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authHeaders = await getAuthHeaders();
    const sessionHeaders: Record<string, string> = {};
    if ((session.user as any)?.role) {
      sessionHeaders["X-Sentinel-Role"] = (session.user as any).role;
    }

    const res = await fetch(`${API_URL}/v1/org/settings`, {
      headers: {
        Accept: "application/json",
        ...authHeaders,
        ...sessionHeaders,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return Response.json({ name: data.name ?? "My Organization" });
    }
  } catch {
    // API unreachable — fall through to default
  }

  return Response.json({ name: "My Organization" });
}
