import { NextResponse } from "next/server";
import { getConfiguredProviders } from "@/lib/auth";

export async function GET() {
  const providers = getConfiguredProviders();
  return NextResponse.json(
    providers.map((p: any) => ({ id: p.id, name: p.name ?? p.id }))
  );
}
