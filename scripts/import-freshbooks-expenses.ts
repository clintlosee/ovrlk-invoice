import { existsSync, readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { business, client, expense, expenseCategory } from "../src/db/schema";
import { assertIsoDate } from "../src/lib/invoice";
import { parseDollarsToCents } from "../src/lib/money";

if (existsSync(".env")) process.loadEnvFile(".env");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error(
    "Usage: tsx scripts/import-freshbooks-expenses.ts <expenses.csv>",
  );
  process.exit(1);
}

type CsvRow = Record<string, string>;

type ParsedExpense = {
  spentOn: string;
  merchant: string;
  amountCents: number;
  taxPaidCents: number;
  note: string | null;
  categoryName: string;
  categoryGroup: "schedule_c" | "cogs";
  clientName: string | null;
  key: string;
};

const parsed = parseCsv(readFileSync(csvPath, "utf8")).map(parseExpense);
const db = getDb();
await db.run(sql`PRAGMA foreign_keys = ON`);

const businesses = await db.select().from(business);
const biz = businesses[0];
if (!biz || businesses.length !== 1) {
  throw new Error("Import expects exactly one local Business");
}
if (biz.currency !== "USD") {
  throw new Error("Import expects a USD Business");
}

const now = new Date();
const existingCategories = await db
  .select()
  .from(expenseCategory)
  .where(eq(expenseCategory.businessId, biz.id));
const categoryByName = new Map(
  existingCategories.map((row) => [row.name.toLowerCase(), row]),
);
const existingClients = await db
  .select()
  .from(client)
  .where(eq(client.businessId, biz.id));
const clientByName = new Map(
  existingClients.map((row) => [row.name.toLowerCase(), row]),
);
const existingExpenses = await db
  .select({
    spentOn: expense.spentOn,
    merchant: expense.merchant,
    amountCents: expense.amountCents,
    note: expense.note,
    categoryName: expenseCategory.name,
  })
  .from(expense)
  .innerJoin(expenseCategory, eq(expense.categoryId, expenseCategory.id))
  .where(eq(expense.businessId, biz.id));
const existingCounts = new Map<string, number>();
for (const row of existingExpenses) {
  const key = expenseKey(
    row.spentOn,
    row.merchant,
    row.amountCents,
    row.note,
    row.categoryName,
  );
  existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
}

let createdCategories = 0;
let createdClients = 0;
let createdExpenses = 0;
let skippedExpenses = 0;

await db.transaction(async (tx) => {
  for (const entry of parsed) {
    const already = existingCounts.get(entry.key) ?? 0;
    if (already > 0) {
      existingCounts.set(entry.key, already - 1);
      skippedExpenses += 1;
      continue;
    }

    let category = categoryByName.get(entry.categoryName.toLowerCase());
    if (category && category.categoryGroup !== entry.categoryGroup) {
      throw new Error(
        `${entry.categoryName} is already a ${category.categoryGroup} Category`,
      );
    }
    if (!category) {
      const id = crypto.randomUUID();
      await tx.insert(expenseCategory).values({
        id,
        businessId: biz.id,
        name: entry.categoryName,
        categoryGroup: entry.categoryGroup,
        systemKey: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      category = {
        id,
        businessId: biz.id,
        name: entry.categoryName,
        categoryGroup: entry.categoryGroup,
        systemKey: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      categoryByName.set(entry.categoryName.toLowerCase(), category);
      createdCategories += 1;
    }

    let clientId: string | null = null;
    if (entry.clientName) {
      let selected = clientByName.get(entry.clientName.toLowerCase());
      if (!selected) {
        const id = crypto.randomUUID();
        const email = placeholderEmail(entry.clientName);
        await tx.insert(client).values({
          id,
          businessId: biz.id,
          name: entry.clientName,
          email,
          phone: null,
          address: null,
          taxExempt: false,
          note: "Imported from FreshBooks. The expense export has no email, so this address is a placeholder.",
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        selected = {
          id,
          businessId: biz.id,
          name: entry.clientName,
          email,
          phone: null,
          address: null,
          taxExempt: false,
          note: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        clientByName.set(entry.clientName.toLowerCase(), selected);
        createdClients += 1;
      }
      clientId = selected.id;
    }

    const spentAt = new Date(`${entry.spentOn}T12:00:00.000Z`);
    await tx.insert(expense).values({
      id: crypto.randomUUID(),
      businessId: biz.id,
      spentOn: entry.spentOn,
      merchant: entry.merchant,
      amountCents: entry.amountCents,
      categoryId: category.id,
      clientId,
      taxPaidCents: entry.taxPaidCents,
      note: entry.note,
      recurring: false,
      receiptKey: null,
      receiptContentType: null,
      paymentId: null,
      createdAt: spentAt,
      updatedAt: spentAt,
    });
    createdExpenses += 1;
  }
});

console.log(
  JSON.stringify(
    {
      business: biz.name,
      createdCategories,
      createdClients,
      createdExpenses,
      skippedExpenses,
    },
    null,
    2,
  ),
);

function parseExpense(row: CsvRow): ParsedExpense {
  const spentOn = assertIsoDate(row.Date?.trim() ?? "");
  const merchant = row.Merchant?.trim() ?? "";
  if (!merchant || merchant.length > 200) {
    throw new Error(`Expense on ${spentOn} needs a merchant`);
  }
  if (row.Currency?.trim() !== "USD") {
    throw new Error(`Expense on ${spentOn} for ${merchant} is not USD`);
  }
  const amountCents = parseDollarsToCents(row.Amount?.trim() ?? "");
  if (amountCents <= 0) {
    throw new Error(`Expense on ${spentOn} for ${merchant} needs an amount`);
  }
  const taxPaidCents =
    parseDollarsToCents(row["Tax 1 Amount"]?.trim() || "0") +
    parseDollarsToCents(row["Tax 2 Amount"]?.trim() || "0");
  if (taxPaidCents > amountCents) {
    throw new Error(
      `Expense on ${spentOn} for ${merchant} has tax greater than the amount`,
    );
  }
  const categoryName = row.Subcategory?.trim() ?? "";
  if (!categoryName || categoryName.length > 80) {
    throw new Error(
      `Expense on ${spentOn} for ${merchant} needs a subcategory`,
    );
  }
  const note = noteFor(row);
  if (note && note.length > 2000) {
    throw new Error(
      `Expense on ${spentOn} for ${merchant} has a note that is too long`,
    );
  }
  return {
    spentOn,
    merchant,
    amountCents,
    taxPaidCents,
    note,
    categoryName,
    categoryGroup: categoryGroup(
      row["Account Sub Type"]?.trim() ?? "",
      merchant,
    ),
    clientName: row.Client?.trim() || null,
    key: expenseKey(spentOn, merchant, amountCents, note, categoryName),
  };
}

function categoryGroup(accountSubType: string, merchant: string) {
  if (accountSubType === "Operating Expense") return "schedule_c" as const;
  if (accountSubType === "Cost of Goods Sold") return "cogs" as const;
  throw new Error(`${merchant} has account type ${accountSubType}`);
}

function noteFor(row: CsvRow): string | null {
  const description = row.Description?.trim() ?? "";
  const source = row.Source?.trim() ?? "";
  const paidFrom =
    source && source !== "Clint Losee" ? `Paid from ${source}.` : "";
  const note = [description, paidFrom].filter(Boolean).join("\n");
  return note || null;
}

function expenseKey(
  spentOn: string,
  merchant: string,
  amountCents: number,
  note: string | null,
  categoryName: string,
) {
  return [spentOn, merchant, amountCents, note ?? "", categoryName].join(
    "\u001f",
  );
}

function placeholderEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}@example.com`;
}

function parseCsv(csv: string): CsvRow[] {
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      table.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    table.push(row);
  }
  const header = table[0];
  if (!header) throw new Error("CSV is empty");
  return table
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) =>
      Object.fromEntries(
        header.map((name, index) => [name, cells[index] ?? ""]),
      ),
    );
}
