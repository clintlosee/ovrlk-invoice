import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { passkey, twoFactor } from "../db/schema";
import { getAuth } from "../lib/auth";
import { signedInBusiness } from "./membership";
import { forBusiness } from "./tenancy";

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await getAuth().api.getSession({
      headers: getRequestHeaders(),
    });
    if (!session) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  },
);

export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const current = await signedInBusiness();
  if (!current) return null;
  const record = await forBusiness(getDb(), current.businessId).business.get();
  if (!record) return null;
  const factors = await ownFactors(current.session.user.id);
  return {
    businessName: record.name,
    currency: record.currency,
    timeZone: record.timeZone,
    totpEnabled: factors.totpEnabled,
    passkeyCount: factors.passkeyCount,
  };
});

async function ownFactors(userId: string) {
  const db = getDb();
  const totp = await db
    .select()
    .from(twoFactor)
    .where(eq(twoFactor.userId, userId))
    .limit(1);
  const keys = await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, userId));
  return {
    totpEnabled: totp[0]?.verified === true,
    passkeyCount: keys.length,
  };
}

export const getSecurity = createServerFn({ method: "GET" }).handler(
  async () => {
    const current = await signedInBusiness();
    if (!current) return null;
    const factors = await ownFactors(current.session.user.id);
    const keys = await getDb()
      .select({
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt,
      })
      .from(passkey)
      .where(eq(passkey.userId, current.session.user.id));
    return {
      ...factors,
      passkeys: keys.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      })),
    };
  },
);
