import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API_BASE = process.env.SENTINEL_API_URL ?? "http://localhost:8080";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if ((session.user as any).role) headers["X-Sentinel-Role"] = (session.user as any).role;
  if ((session.user as any).orgId) headers["X-Sentinel-Org-Id"] = (session.user as any).orgId;
  if ((session.user as any).id) headers["X-Sentinel-User-Id"] = (session.user as any).id;

  const res = await fetch(`${API_BASE}/v1/reports/${id}/download`, {
    headers,
    redirect: "manual",
  });

  if (res.status === 302) {
    const location = res.headers.get("Location");
    if (location) {
      return NextResponse.redirect(location);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  }

  // Fallback: stream the response body directly
  const blob = await res.blob();
  return new NextResponse(blob, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? `attachment; filename="report-${id}.pdf"`,
    },
  });
}
