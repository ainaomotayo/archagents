/**
 * SSE endpoint for real-time scan status updates.
 *
 * GET /api/scans/:id/stream
 *
 * Returns a Server-Sent Events stream that pushes ScanStatusEvent payloads.
 * In production this would subscribe to a Redis pub/sub channel (or similar)
 * keyed by scan ID.  For the MVP we emit mock progress events so the
 * front-end integration can be tested end-to-end.
 */

import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const runtime = "edge"; // keep the connection open without serverless timeout

interface MockStep {
  status: "pending" | "scanning" | "completed" | "failed";
  progress: number;
  agentsCompleted: number;
  agentsTotal: number;
}

function buildMockSteps(): MockStep[] {
  const total = 5;
  const steps: MockStep[] = [
    { status: "pending", progress: 0, agentsCompleted: 0, agentsTotal: total },
  ];

  for (let i = 1; i <= total; i++) {
    steps.push({
      status: "scanning",
      progress: Math.round((i / total) * 100),
      agentsCompleted: i,
      agentsTotal: total,
    });
  }

  steps.push({
    status: "completed",
    progress: 100,
    agentsCompleted: total,
    agentsTotal: total,
  });

  return steps;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: scanId } = await params;

  const steps = buildMockSteps();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      for (const step of steps) {
        // Respect client disconnect
        if (request.signal.aborted) {
          controller.close();
          return;
        }

        const payload = JSON.stringify({
          scanId,
          status: step.status,
          progress: step.progress,
          agentsCompleted: step.agentsCompleted,
          agentsTotal: step.agentsTotal,
          updatedAt: new Date().toISOString(),
        });

        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));

        // Simulate work between updates (500ms per step)
        await new Promise((resolve) => setTimeout(resolve, 500));
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
