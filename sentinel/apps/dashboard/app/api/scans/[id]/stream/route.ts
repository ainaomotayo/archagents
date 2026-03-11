/**
 * SSE endpoint for real-time scan events.
 *
 * GET /api/scans/:id/stream
 *
 * Proxies to the SENTINEL API's `/v1/scans/:id/stream` endpoint.
 * When the API is unreachable, falls back to a mock progress stream
 * so the front-end integration can be tested standalone.
 *
 * Supports `lastEventId` query parameter for SSE reconnection.
 */

import { NextRequest } from "next/server";

export const runtime = "edge";

const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";

// ---------------------------------------------------------------------------
// Mock fallback (development / standalone)
// ---------------------------------------------------------------------------

interface MockStep {
  event: string;
  data: Record<string, unknown>;
}

function buildMockSteps(scanId: string): MockStep[] {
  const agents = ["security", "dependency", "quality", "policy", "llm-review"];
  const steps: MockStep[] = [];

  for (const agent of agents) {
    steps.push({
      event: "agent.started",
      data: { agent, scanId },
    });
  }

  for (let i = 0; i < agents.length; i++) {
    steps.push({
      event: "agent.completed",
      data: { agent: agents[i], scanId },
    });
    steps.push({
      event: "scan.progress",
      data: {
        scanId,
        progress: Math.round(((i + 1) / agents.length) * 100),
        agentsCompleted: i + 1,
        agentsTotal: agents.length,
      },
    });
  }

  steps.push({
    event: "finding.new",
    data: { title: "SQL Injection", severity: "high", file: "auth.py", scanner: "security" },
  });

  steps.push({
    event: "scan.completed",
    data: { scanId, totalFindings: 1, updatedAt: new Date().toISOString() },
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: scanId } = await params;
  const lastEventId = request.nextUrl.searchParams.get("lastEventId") ?? "";

  // Try to proxy from the real API
  const apiStreamUrl = `${API_URL}/v1/scans/${encodeURIComponent(scanId)}/stream`;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
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
      // Pipe through the SSE stream from the API
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

  // Fallback: mock SSE stream for development
  const steps = buildMockSteps(scanId);
  let eventCounter = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      for (const step of steps) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }

        eventCounter++;
        const id = `mock-${eventCounter}`;
        const payload = JSON.stringify(step.data);
        const sseFrame = `event: ${step.event}\nid: ${id}\ndata: ${payload}\n\n`;
        controller.enqueue(encoder.encode(sseFrame));

        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      controller.close();
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
