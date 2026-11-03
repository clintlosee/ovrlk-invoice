import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { getDb } from "../db/client";
import { requestLimit } from "../db/schema";

export type RateRule = { windowMs: number; max: number };

export type RateResult = { allowed: boolean; retryAfterMs: number };

/**
 * One statement so two overlapping requests cannot share a stale counter.
 * ponytail: single-row upsert. Enough while public Invoice Links are per IP;
 * move to a shared counter only if one key is hit harder than SQLite serializes.
 */
export async function consumeRateLimit(
  db: AppDb,
  key: string,
  rule: RateRule,
  now = Date.now(),
): Promise<RateResult> {
  const rows = await db
    .insert(requestLimit)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: requestLimit.key,
      set: {
        count: sql`CASE WHEN ${now} - ${requestLimit.windowStart} >= ${rule.windowMs} THEN 1 ELSE ${requestLimit.count} + 1 END`,
        windowStart: sql`CASE WHEN ${now} - ${requestLimit.windowStart} >= ${rule.windowMs} THEN ${now} ELSE ${requestLimit.windowStart} END`,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) return { allowed: false, retryAfterMs: rule.windowMs };
  const allowed = row.count <= rule.max;
  const retryAfterMs = allowed
    ? 0
    : Math.max(0, rule.windowMs - (now - row.windowStart));
  return { allowed, retryAfterMs };
}

export function clientIp(request: Request): string {
  // ponytail: leftmost X-Forwarded-For. Render sets it. If a client can spoof
  // the header in front of the proxy, use the hop the proxy appends.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

function maxFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const fiveMinutes = 5 * 60 * 1000;

export async function limitAuthRequest(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/api\/auth/, "") || "/";
  const ip = clientIp(request);
  let key: string | null = null;
  let rule: RateRule | null = null;
  if (path === "/sign-in/email" || path === "/sign-up/email") {
    key = `auth:${ip}`;
    rule = {
      windowMs: fiveMinutes,
      max: maxFromEnv("AUTH_RATE_LIMIT_MAX", 10),
    };
  } else if (
    path.startsWith("/two-factor/") ||
    path === "/passkey/verify-authentication"
  ) {
    key = `otp:${ip}`;
    rule = { windowMs: fiveMinutes, max: maxFromEnv("OTP_RATE_LIMIT_MAX", 8) };
  }
  if (!key || !rule) return null;
  const result = await consumeRateLimit(getDb(), key, rule);
  if (result.allowed) return null;
  return new Response(JSON.stringify({ message: "Too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(Math.ceil(result.retryAfterMs / 1000)),
      "cache-control": "no-store",
    },
  });
}

/** Invoice Link routes under /p/ call this. The request middleware does too. */
export async function consumePublicRateLimit(
  ip: string,
  now = Date.now(),
): Promise<RateResult> {
  return consumeRateLimit(
    getDb(),
    `public:${ip}`,
    {
      windowMs: 60_000,
      max: maxFromEnv("PUBLIC_RATE_LIMIT_MAX", 60),
    },
    now,
  );
}

const publicLimitCounted = new AsyncLocalStorage<true>();

export function publicRateLimitCounted(): boolean {
  return publicLimitCounted.getStore() === true;
}

/** Middleware counts the request, then runs the handler in this scope so the route does not count it again. */
export function runPublicRateLimitCounted<T>(fn: () => T): T {
  return publicLimitCounted.run(true, fn);
}
