import { NextRequest } from "next/server";
import { proxyGet, proxyPost } from "../../_proxy";

export const runtime = "nodejs";

export async function GET() {
  return proxyGet("/v1/notifications/rules");
}

export async function POST(req: NextRequest) {
  const bodyStr = await req.text();
  return proxyPost("/v1/notifications/rules", bodyStr);
}
