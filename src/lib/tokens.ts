import crypto from "crypto";

const SECRET = process.env.TOKEN_SIGNING_SECRET ?? "insecure-dev-secret";

export type TokenPurpose =
  | "missing_info"
  | "snooze_followup"
  | "stop_followup";

export interface TokenPayload {
  purpose: TokenPurpose;
  sampleId: string;
  exp: number; // epoch ms
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Create a signed, URL-safe token (HMAC-SHA256). Default expiry 7 days. */
export function signToken(
  purpose: TokenPurpose,
  sampleId: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000,
): string {
  const payload: TokenPayload = {
    purpose,
    sampleId,
    exp: Date.now() + ttlMs,
  };
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify and decode a token. Returns null if invalid, tampered, or expired. */
export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = base64url(
    crypto.createHmac("sha256", SECRET).update(body).digest(),
  );
  // Constant-time comparison.
  const a = fromBase64url(sig);
  const b = fromBase64url(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(body).toString()) as TokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function magicLink(
  purpose: TokenPurpose,
  sampleId: string,
  path: string,
  ttlMs?: number,
): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const token = signToken(purpose, sampleId, ttlMs);
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

/** Absolute app URL for links in emails. */
export function appUrl(path: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}
