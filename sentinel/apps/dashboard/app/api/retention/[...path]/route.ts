import { NextRequest } from "next/server";
import { requireSession, buildProxyHeaders, backendUrl } from "../../_proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, ctx: Context): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;

  const { path } = await ctx.params;
  const backendPath = `/v1/retention/${path.join("/")}`;
  const url = new URL(backendUrl(backendPath));

  // Forward query params
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const method = req.method;
  let bodyStr = "";
  if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
    bodyStr = await req.text();
  }

  const headers = await buildProxyHeaders(bodyStr);
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: bodyStr || undefined,
  });

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return new Response(null, { status: res.status });
  }
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
