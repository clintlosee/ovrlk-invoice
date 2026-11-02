import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "../db/client";
import { account, member, OWNER_ROLE, twoFactor } from "../db/schema";
import { getAuth } from "../lib/auth";
import { recordAudit } from "./tenancy";

async function ownerContext() {
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders(),
  });
  if (!session) return null;
  const rows = await getDb()
    .select()
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.role, OWNER_ROLE)))
    .limit(1);
  const owner = rows[0];
  if (!owner) return null;
  return { userId: session.user.id, businessId: owner.businessId };
}

export const enableTotp = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const current = await ownerContext();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const result = await getAuth().api.enableTwoFactor({
        body: { password: data.password, method: "totp" },
        headers: getRequestHeaders(),
      });
      if (result.method !== "totp" || !result.totpURI) {
        return {
          ok: false as const,
          message: "Could not start authenticator setup.",
        };
      }
      const qrDataUrl = await QRCode.toDataURL(result.totpURI);
      await recordAudit(getDb(), {
        action: "auth.totp_enrollment_started",
        businessId: current.businessId,
        actorUserId: current.userId,
      });
      return {
        ok: true as const,
        qrDataUrl,
        totpURI: result.totpURI,
        backupCodes: result.backupCodes,
      };
    } catch {
      return {
        ok: false as const,
        message: "Could not start authenticator setup. Check your password.",
      };
    }
  });

export const disableTotp = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const current = await ownerContext();
    if (!current) return { ok: false as const, message: "Sign in again." };
    const rows = await getDb()
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, current.userId),
          eq(account.providerId, "credential"),
        ),
      )
      .limit(1);
    const credential = rows[0];
    if (!credential?.password)
      return { ok: false as const, message: "Wrong password." };
    const matches = await verifyPassword({
      password: data.password,
      hash: credential.password,
    });
    if (!matches) return { ok: false as const, message: "Wrong password." };
    await getDb().delete(twoFactor).where(eq(twoFactor.userId, current.userId));
    await recordAudit(getDb(), {
      action: "auth.totp_disabled",
      businessId: current.businessId,
      actorUserId: current.userId,
    });
    return { ok: true as const };
  });
