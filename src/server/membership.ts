import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { member, OWNER_ROLE } from "../db/schema";
import { getAuth } from "../lib/auth";

/**
 * The one lookup outside `forBusiness`. The Business id comes from the
 * signed-in Owner's membership, never from the request body.
 */
export async function signedInBusiness() {
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
  return { session, businessId: owner.businessId };
}
