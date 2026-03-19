import { NextRequest } from "next/server";
import { proxyPatch, proxyDelete } from "../../_proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  const bodyStr = await req.text();
  return proxyPatch(`/v1/report-schedules/${id}`, bodyStr);
}

export async function DELETE(_req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  return proxyDelete(`/v1/report-schedules/${id}`);
}
