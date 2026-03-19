import { NextRequest } from "next/server";
import { proxyDelete } from "../../../_proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  return proxyDelete(`/v1/notifications/rules/${id}`);
}
