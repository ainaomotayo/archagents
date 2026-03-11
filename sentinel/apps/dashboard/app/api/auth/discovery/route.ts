import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";

/**
 * Proxy the discovery API call to the backend.
 * This avoids CORS issues and keeps the API URL server-side.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json(
      { error: "email query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const url = `${API_URL}/v1/auth/discovery?email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { providers: [], enforced: false },
        { status: 200 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // Fail-open: return empty so the login page falls back to all providers
    return NextResponse.json({ providers: [], enforced: false });
  }
}
