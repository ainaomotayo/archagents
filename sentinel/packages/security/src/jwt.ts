import { createHmac } from "node:crypto";

export interface JwtPayload {
  sub: string;
  org: string;
  role: string;
  iat: number;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

function sign(input: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(input);
  return hmac.digest("base64url");
}

export function createSessionToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(`${header}.${body}`, secret);

  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
): { valid: boolean; payload?: JwtPayload; error?: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid token format" };
  }

  const [header, body, signature] = parts;

  // Verify signature
  const expectedSignature = sign(`${header}.${body}`, secret);
  if (signature !== expectedSignature) {
    return { valid: false, error: "Invalid signature" };
  }

  // Decode payload
  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch {
    return { valid: false, error: "Invalid payload" };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { valid: false, error: "Token expired" };
  }

  return { valid: true, payload };
}

export function refreshToken(
  token: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string | null {
  const result = verifySessionToken(token, secret);
  if (!result.valid || !result.payload) {
    return null;
  }

  const { sub, org, role } = result.payload;
  return createSessionToken({ sub, org, role }, secret, ttlSeconds);
}
