import { NextRequest } from "next/server";
import { proxyPost } from "../../../_proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  return proxyPost(`/v1/sso-configs/${id}/test-connection`, "{}");
}
