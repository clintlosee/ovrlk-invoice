import { createHash, randomBytes } from "node:crypto";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function createInvoiceToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvoiceToken(token) };
}

export function hashInvoiceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isInvoiceToken(token: string): boolean {
  return TOKEN.test(token);
}
