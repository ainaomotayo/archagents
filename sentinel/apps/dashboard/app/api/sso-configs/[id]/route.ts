import { NextRequest } from "next/server";
import { proxyGet, proxyPut, proxyDelete } from "../../_proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  return proxyGet(`/v1/sso-configs/${id}`);
}

export async function PUT(req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  const bodyStr = await req.text();
  return proxyPut(`/v1/sso-configs/${id}`, bodyStr);
}

export async function DELETE(_req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  return proxyDelete(`/v1/sso-configs/${id}`);
}
