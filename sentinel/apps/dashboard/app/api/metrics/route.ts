import { NextResponse } from "next/server";

let requestCount = 0;
const startTime = Date.now();

export async function GET() {
  requestCount++;
  const uptimeSeconds = (Date.now() - startTime) / 1000;

  const lines = [
    "# HELP sentinel_dashboard_up Dashboard health indicator",
    "# TYPE sentinel_dashboard_up gauge",
    "sentinel_dashboard_up 1",
    "# HELP sentinel_dashboard_uptime_seconds Dashboard uptime in seconds",
    "# TYPE sentinel_dashboard_uptime_seconds gauge",
    `sentinel_dashboard_uptime_seconds ${uptimeSeconds.toFixed(1)}`,
    "# HELP sentinel_dashboard_http_requests_total Total requests to dashboard metrics",
    "# TYPE sentinel_dashboard_http_requests_total counter",
    `sentinel_dashboard_http_requests_total ${requestCount}`,
    "",
  ];

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
