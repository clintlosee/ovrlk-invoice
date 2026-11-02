import { getDb } from "../src/db/client";
import { user } from "../src/db/schema";
import { provisionOwner } from "../src/server/provision";

export async function insertOwner(email: string, businessName = email) {
  const db = getDb();
  const userId = crypto.randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: email,
    email,
    emailVerified: true,
    twoFactorEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
  const created = await provisionOwner({
    userId,
    businessName,
    timeZone: "America/Denver",
  });
  return { userId, businessId: created.businessId };
}

export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}
