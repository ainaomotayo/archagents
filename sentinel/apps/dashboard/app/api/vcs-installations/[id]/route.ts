import { NextRequest } from "next/server";
import { proxyPut, proxyDelete } from "../../_proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  const bodyStr = await req.text();
  return proxyPut(`/v1/vcs-installations/${id}`, bodyStr);
}

export async function DELETE(_req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  return proxyDelete(`/v1/vcs-installations/${id}`);
}
