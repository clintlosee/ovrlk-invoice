import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { auditLog, business, member, user } from "../src/db/schema";
import { takeEmails } from "../src/lib/email";
import { handleAuthRequest } from "../src/server/auth-http";
import { registerOwner } from "../src/server/register-owner";
import { cookieHeader } from "./helpers";

const origin = "http://localhost:3333";

function post(path: string, body: unknown, cookie?: string) {
  return handleAuthRequest(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("auth", () => {
  afterEach(() => {
    process.env.ALLOW_SIGN_UP = "false";
    process.env.AUTH_RATE_LIMIT_MAX = "";
  });

  it("rejects registration on the server while sign-up is closed", async () => {
    const response = await post("/sign-up/email", {
      name: "Closed",
      email: "closed@example.com",
      password: "password-password",
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    const rows = await getDb()
      .select()
      .from(user)
      .where(eq(user.email, "closed@example.com"));
    expect(rows).toEqual([]);
    const rejected = await registerOwner(
      {
        name: "Closed",
        businessName: "Closed Co",
        email: "closed@example.com",
        password: "password-password",
        timeZone: "America/Denver",
      },
      new Headers({ origin }),
      "closed-ip",
    );
    expect(rejected).toEqual({ ok: false, message: "Sign-up is closed." });
  });

  it("opens registration only when the flag is on and requires email OTP to sign in", async () => {
    process.env.ALLOW_SIGN_UP = "true";
    const created = await registerOwner(
      {
        name: "Ada Owner",
        businessName: "Ada Prints",
        email: "ada@example.com",
        password: "password-password",
        timeZone: "America/Denver",
      },
      new Headers({ origin }),
      "ada-ip",
    );
    expect(created).toEqual({ ok: true });
    const owner = await getDb()
      .select()
      .from(user)
      .where(eq(user.email, "ada@example.com"));
    expect(owner[0]?.twoFactorEnabled).toBe(true);
    const membership = await getDb()
      .select()
      .from(member)
      .where(eq(member.userId, owner[0]?.id ?? ""));
    expect(membership[0]?.role).toBe("owner");
    const company = await getDb()
      .select()
      .from(business)
      .where(eq(business.id, membership[0]?.businessId ?? ""));
    expect(company[0]?.name).toBe("Ada Prints");
    expect(company[0]?.currency).toBe("USD");

    process.env.ALLOW_SIGN_UP = "false";
    const closedAgain = await post("/sign-up/email", {
      name: "Late",
      email: "late@example.com",
      password: "password-password",
    });
    expect(closedAgain.status).toBe(403);

    const wrong = await post("/sign-in/email", {
      email: "ada@example.com",
      password: "not-the-password",
    });
    expect(wrong.status).toBe(401);
    const failures = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "auth.sign_in_failed"));
    expect(failures.length).toBeGreaterThan(0);

    const signed = await post("/sign-in/email", {
      email: "ada@example.com",
      password: "password-password",
    });
    expect(signed.status).toBe(200);
    const challenge = (await signed.json()) as { twoFactorRedirect?: boolean };
    expect(challenge.twoFactorRedirect).toBe(true);
    const challengeCookie = cookieHeader(signed);

    const sent = await post("/two-factor/send-otp", {}, challengeCookie);
    expect(sent.status).toBe(200);
    const code = takeEmails().find(
      (message) => message.to === "ada@example.com",
    )?.code;
    expect(code).toMatch(/^\d{6}$/);

    const verified = await post(
      "/two-factor/verify-otp",
      { code },
      `${challengeCookie}; ${cookieHeader(sent)}`,
    );
    expect(verified.status).toBe(200);
    const sessionCookie = verified.headers
      .getSetCookie()
      .find((cookie) => /session/i.test(cookie));
    expect(sessionCookie?.toLowerCase()).toContain("httponly");
    expect(sessionCookie?.toLowerCase()).not.toContain("secure");
    const signIns = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "auth.sign_in"));
    expect(signIns.some((row) => row.businessId === company[0]?.id)).toBe(true);

    const passkeyBypass = await post("/passkey/verify-authentication", {
      response: {},
    });
    expect(passkeyBypass.status).toBe(403);

    const disable = await post(
      "/two-factor/disable",
      { password: "password-password" },
      cookieHeader(verified),
    );
    expect(disable.status).toBe(403);
    const still = await getDb()
      .select()
      .from(user)
      .where(eq(user.email, "ada@example.com"));
    expect(still[0]?.twoFactorEnabled).toBe(true);
  });

  it("rate limits repeated sign-in attempts", async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "1";
    const headers = { "x-forwarded-for": "203.0.113.10" };
    const first = await handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json", origin },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "password-password",
        }),
      }),
    );
    const second = await handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json", origin },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "password-password",
        }),
      }),
    );
    expect(first.status).not.toBe(429);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
  });
});
