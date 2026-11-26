import { existsSync } from "node:fs";
import { getDb } from "../src/db/client";
import { business } from "../src/db/schema";
import { todayInTimeZone } from "../src/lib/invoice";
import { forBusiness } from "../src/server/tenancy";

if (existsSync(".env")) process.loadEnvFile(".env");

const db = getDb();
const rows = await db
  .select({ id: business.id, timeZone: business.timeZone })
  .from(business);
let created = 0;
for (const row of rows) {
  created += await forBusiness(db, row.id).recurringExpenses.postDue(
    todayInTimeZone(row.timeZone),
  );
}
console.log(`Created ${created} Expenses.`);
