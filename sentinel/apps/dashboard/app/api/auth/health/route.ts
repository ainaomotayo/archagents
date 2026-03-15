import { NextResponse } from "next/server";
import { providerHealth } from "@/lib/auth";

export async function GET() {
  return NextResponse.json(providerHealth.getAll());
}
