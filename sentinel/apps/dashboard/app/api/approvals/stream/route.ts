/**
 * SSE endpoint for real-time approval events.
 *
 * GET /api/approvals/stream
 *
 * Proxies to the SENTINEL API's `/v1/approvals/stream` endpoint.
 * Falls back to a mock event stream for standalone development.
 * Supports `lastEventId` query parameter for SSE reconnection.
 * Supports `poll=true` query parameter for polling fallback.
 */

import { NextRequest } from "next/server";

export const runtime = "edge";

const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
const API_SECRET = process.env.SENTINEL_SECRET ?? "";

async function getAuthHeaders(body: string): Promise<Record<string, string>> {
  try {
    const { signRequest } = await import("@sentinel/auth");
    return {
      "X-Sentinel-Signature": signRequest(body, API_SECRET),
      "X-Sentinel-API-Key": "dashboard",
    };
  } catch {
    return {};
  }
}

function buildMockPollResponse() {
  return Response.json({ gates: [], total: 0 });
}

export async function GET(request: NextRequest) {
  const isPoll = request.nextUrl.searchParams.get("poll") === "true";
  const lastEventId = request.nextUrl.searchParams.get("lastEventId") ?? "";

  const authHeaders = await getAuthHeaders("");

  // Polling mode: return current state as JSON
  if (isPoll) {
    try {
      const res = await fetch(`${API_URL}/v1/approvals?limit=50`, {
        headers: {
          Accept: "application/json",
          ...authHeaders,
        },
      });
      if (res.ok) {
        const data = await res.json();
        return Response.json(data);
      }
    } catch {
      // Fall through to mock
    }
    return buildMockPollResponse();
  }

  // SSE mode: proxy stream from API
  const apiStreamUrl = `${API_URL}/v1/approvals/stream`;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...authHeaders,
  };
  if (lastEventId) {
    headers["Last-Event-ID"] = lastEventId;
  }

  try {
    const apiRes = await fetch(apiStreamUrl, {
      headers,
      signal: request.signal,
    });

    if (apiRes.ok && apiRes.body) {
      return new Response(apiRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  } catch {
    // API unreachable — fall through to mock
  }

  // Fallback: mock SSE stream with heartbeat
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let counter = 0;

      // Send initial heartbeat
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      // Keep connection alive with periodic heartbeats
      const interval = setInterval(() => {
        if (request.signal.aborted) {
          clearInterval(interval);
          controller.close();
          return;
        }
        counter++;
        controller.enqueue(encoder.encode(`: heartbeat ${counter}\n\n`));
      }, 30_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
