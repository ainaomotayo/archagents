import { NextRequest } from "next/server";
import { proxyGet, proxyPut } from "../_proxy";

export const runtime = "nodejs";

export async function GET() {
  return proxyGet("/v1/org/settings");
}

export async function PUT(req: NextRequest) {
  const bodyStr = await req.text();
  return proxyPut("/v1/org/settings", bodyStr);
}
