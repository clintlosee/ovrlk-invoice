import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { member, user } from "../db/schema";
import { getAuth } from "../lib/auth";
import { isProduction } from "../lib/config";
import { clientIp, limitAuthRequest } from "./rate-limit";
import { withSecurityHeaders } from "./security-headers";
import { recordAudit } from "./tenancy";

function authPath(request: Request): string {
  return new URL(request.url).pathname.replace(/\/api\/auth/, "") || "/";
}

function headerOptions() {
  return { dev: !isProduction(), https: isProduction() };
}

async function businessForUser(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const rows = await getDb()
    .select()
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return rows[0]?.businessId ?? null;
}

async function userIdForEmail(
  email: string | undefined,
): Promise<string | null> {
  if (!email) return null;
  const rows = await getDb()
    .select()
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const limited = await limitAuthRequest(request);
  if (limited) {
    await recordAuthEvent(request, limited, await readJsonBody(request));
    return withSecurityHeaders(limited, headerOptions());
  }
  const body = await readJsonBody(request);
  const response = await getAuth().handler(request);
  await recordAuthEvent(request, response, body);
  return withSecurityHeaders(response, headerOptions());
}

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("json")) return null;
  try {
    const value = (await request.clone().json()) as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function recordAuthEvent(
  request: Request,
  response: Response,
  body: Record<string, unknown> | null,
): Promise<void> {
  const path = authPath(request);
  let payload: Record<string, unknown> | null = null;
  try {
    const value = (await response.clone().json()) as unknown;
    if (value && typeof value === "object")
      payload = value as Record<string, unknown>;
  } catch {
    payload = null;
  }
  const email =
    typeof body?.email === "string" ? body.email.toLowerCase() : undefined;
  const payloadUser = payload?.user;
  const userIdFromPayload =
    payloadUser && typeof payloadUser === "object" && "id" in payloadUser
      ? String((payloadUser as { id: unknown }).id)
      : null;
  const actorUserId = userIdFromPayload ?? (await userIdForEmail(email));
  const businessId = await businessForUser(actorUserId);
  const action = actionFor(path, response.status, payload);
  if (!action) return;
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 256) ?? null;
  await recordAudit(getDb(), {
    action,
    businessId,
    actorUserId,
    ip,
    userAgent,
    metadata: email ? { email } : null,
  });
}

function actionFor(
  path: string,
  status: number,
  payload: Record<string, unknown> | null,
): string | null {
  if (status === 429) return "auth.rate_limited";
  if (
    path === "/sign-in/email" &&
    status === 200 &&
    payload?.twoFactorRedirect === true
  ) {
    return "auth.password_accepted";
  }
  if (path === "/sign-in/email" && (status === 401 || status === 403))
    return "auth.sign_in_failed";
  if (path === "/sign-up/email" && status === 403)
    return "auth.sign_up_rejected";
  if (path === "/sign-up/email" && status === 200) return "auth.sign_up";
  if (path === "/two-factor/send-otp" && status === 200) return "auth.otp_sent";
  if (path === "/two-factor/verify-otp" && status === 200)
    return "auth.sign_in";
  if (path === "/two-factor/verify-totp" && status === 200)
    return "auth.totp_verified";
  if (path === "/two-factor/passkey-verify" && status === 200)
    return "auth.sign_in";
  if (path === "/two-factor/enable" && status === 200)
    return "auth.totp_enrollment_started";
  if (path === "/sign-out" && status === 200) return "auth.sign_out";
  if (path === "/passkey/verify-registration" && status === 200)
    return "auth.passkey_registered";
  if (path === "/passkey/delete-passkey" && status === 200)
    return "auth.passkey_removed";
  if (path === "/two-factor/disable") return "auth.otp_disable_rejected";
  return null;
}
