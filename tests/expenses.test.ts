import { readdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/client";
import { expense } from "../src/db/schema";
import { EXPENSE_CATEGORY_SEEDS } from "../src/lib/expense-categories";
import { acceptUpload } from "../src/lib/files";
import { cents } from "../src/lib/money";
import { issueSignedGet, saveLogo, saveReceipt } from "../src/server/files";
import { storageConfigured } from "../src/server/storage";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

const objects = vi.hoisted(
  () => new Map<string, { body: Uint8Array; contentType: string }>(),
);

vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    input: { Key: string; Body: Uint8Array; ContentType: string };
    constructor(input: { Key: string; Body: Uint8Array; ContentType: string }) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: { Key: string };
    constructor(input: { Key: string }) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: { Key: string };
    constructor(input: { Key: string }) {
      this.input = input;
    }
  }
  class S3Client {
    async send(command: {
      constructor: { name: string };
      input: { Key: string; Body?: Uint8Array; ContentType?: string };
    }) {
      const key = command.input.Key;
      const name = command.constructor.name;
      if (name === "PutObjectCommand") {
        objects.set(key, {
          body: command.input.Body ?? new Uint8Array(),
          contentType: command.input.ContentType ?? "",
        });
        return {};
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(key);
        return {};
      }
      if (name === "GetObjectCommand") {
        const found = objects.get(key);
        if (!found) {
          const error = new Error("missing");
          error.name = "NoSuchKey";
          throw error;
        }
        return {
          ContentType: found.contentType,
          Body: { transformToByteArray: async () => found.body },
        };
      }
      throw new Error(`unexpected ${name}`);
    }
  }
  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async (_client: unknown, command: { input: { Key: string } }) =>
    `https://files.test/${command.input.Key}?expires=300`,
}));

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const PDF = new TextEncoder().encode("%PDF-1.4\n");

function enableR2() {
  process.env.R2_ACCOUNT_ID = "acctexample";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "receipts";
}

afterEach(() => {
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET;
  objects.clear();
});

describe("expenses", () => {
  it("boots when R2 is unset and rejects a file that is not an image or PDF", () => {
    expect(storageConfigured()).toBe(false);
    expect(acceptUpload(PNG, "image/png", "receipt")).toBe("image/png");
    expect(acceptUpload(PDF, "application/pdf", "receipt")).toBe(
      "application/pdf",
    );
    expect(() => acceptUpload(PDF, "application/pdf", "logo")).toThrow(/JPEG/);
    expect(() =>
      acceptUpload(Uint8Array.from([0x4d, 0x5a]), "", "receipt"),
    ).toThrow(/image or PDF/);
    expect(() => acceptUpload(PNG, "image/jpeg", "receipt")).toThrow(
      /image or PDF/,
    );
  });

  it("seeds Schedule C and Cost of Goods Sold, and the migration backfills them", async () => {
    const owner = await insertOwner("exp-seed@example.com", "Seed Prints");
    const categories = await forBusiness(
      getDb(),
      owner.businessId,
    ).categories.list();
    expect(categories).toHaveLength(EXPENSE_CATEGORY_SEEDS.length);
    expect(
      categories.find((row) => row.systemKey === "merchant_fees"),
    ).toMatchObject({
      name: "Merchant fees",
      categoryGroup: "schedule_c",
      archived: false,
    });
    expect(
      categories.find((row) => row.systemKey === "cogs_print"),
    ).toMatchObject({
      name: "Print costs",
      categoryGroup: "cogs",
    });
    const sql = readdirSync("drizzle")
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(`drizzle/${name}`, "utf8"))
      .join("\n");
    for (const seed of EXPENSE_CATEGORY_SEEDS) {
      expect(sql).toContain(`'${seed.systemKey}'`);
      expect(sql).toContain(`'${seed.name}'`);
    }
  });

  it("keeps another Business out of expenses, categories, receipts, and logos", async () => {
    enableR2();
    const db = getDb();
    const alpha = await insertOwner("exp-a@example.com", "Alpha Expenses");
    const beta = await insertOwner("exp-b@example.com", "Beta Expenses");
    const a = forBusiness(db, alpha.businessId);
    const b = forBusiness(db, beta.businessId);
    const client = await a.clients.create({
      name: "Alpha Client",
      email: "client@example.com",
      phone: null,
      address: null,
      taxExempt: false,
      note: null,
    });
    const supplies = (await a.categories.list()).find(
      (row) => row.systemKey === "supplies",
    );
    if (!supplies) throw new Error("supplies");
    const created = await a.expenses.create({
      spentOn: "2026-04-02",
      merchant: "Paper Co",
      amountCents: cents(2500),
      categoryId: supplies.id,
      clientId: client.id,
      taxPaidCents: cents(150),
      note: "Ream",
      actorUserId: alpha.userId,
    });
    expect(
      await b.expenses.list({ from: null, to: null, categoryId: null }),
    ).toEqual([]);
    expect(await b.expenses.get(created.id)).toBeNull();
    expect(
      await b.expenses.update(created.id, {
        spentOn: "2026-04-03",
        merchant: "Stolen",
        amountCents: cents(1),
        categoryId: supplies.id,
        clientId: null,
        taxPaidCents: 0,
        note: null,
        actorUserId: beta.userId,
      }),
    ).toBeNull();
    expect(await b.expenses.remove(created.id, beta.userId)).toBeNull();
    expect(await b.categories.rename(supplies.id, "Stolen")).toBeNull();
    const betaSupplies = (await b.categories.list()).find(
      (row) => row.systemKey === "supplies",
    );
    expect(betaSupplies?.id).not.toBe(supplies.id);
    await expect(
      a.expenses.create({
        spentOn: "2026-04-04",
        merchant: "Nope",
        amountCents: cents(100),
        categoryId: betaSupplies?.id ?? "",
        clientId: null,
        taxPaidCents: 0,
        note: null,
        actorUserId: alpha.userId,
      }),
    ).rejects.toThrow(/Category/);

    const march = await a.expenses.create({
      spentOn: "2026-03-01",
      merchant: "Ink",
      amountCents: cents(400),
      categoryId: supplies.id,
      clientId: null,
      taxPaidCents: 0,
      note: null,
      actorUserId: alpha.userId,
    });
    const ranged = await a.expenses.list({
      from: "2026-04-01",
      to: "2026-04-30",
      categoryId: supplies.id,
    });
    expect(ranged.map((row) => row.id)).toEqual([created.id]);
    expect(ranged[0]?.clientName).toBe("Alpha Client");
    expect(march.id).not.toBe(created.id);

    await saveReceipt(alpha.businessId, created.id, PNG, "image/png");
    const withReceipt = await a.expenses.get(created.id);
    const key = withReceipt?.receiptKey;
    if (!key) throw new Error("receipt");
    expect(objects.has(key)).toBe(true);
    const url = await issueSignedGet(alpha.businessId, key);
    expect(url).toContain(`${alpha.businessId}/receipts/`);
    expect(url).toContain("expires=300");
    await expect(issueSignedGet(beta.businessId, key)).rejects.toThrow(
      /belong/,
    );
    await saveReceipt(alpha.businessId, created.id, PDF, "application/pdf");
    expect(objects.has(key)).toBe(false);
    const replaced = await a.expenses.get(created.id);
    expect(replaced?.receiptKey).not.toBe(key);
    expect(replaced?.receiptContentType).toBe("application/pdf");
    const removed = await a.expenses.remove(created.id, alpha.userId);
    const { discardObject } = await import("../src/server/storage");
    await discardObject(removed?.receiptKey ?? null);
    expect(objects.has(replaced?.receiptKey ?? "")).toBe(false);
    expect(
      await db.select().from(expense).where(eq(expense.id, created.id)),
    ).toEqual([]);

    await saveLogo(alpha.businessId, PNG, "image/png");
    const logoKey = (await a.business.get())?.logoKey;
    if (!logoKey) throw new Error("logo");
    await expect(issueSignedGet(beta.businessId, logoKey)).rejects.toThrow(
      /belong/,
    );
    expect((await b.business.get())?.logoKey).toBeNull();
    const { readLogo } = await import("../src/server/files");
    expect(await readLogo(beta.businessId)).toBeNull();
    expect((await readLogo(alpha.businessId))?.contentType).toBe("image/png");
  });

  it("stores a Recurring mark and can clear it", async () => {
    const owner = await insertOwner("exp-recur@example.com", "Recur Prints");
    const scope = forBusiness(getDb(), owner.businessId);
    const insurance = (await scope.categories.list()).find(
      (row) => row.systemKey === "insurance",
    );
    if (!insurance) throw new Error("insurance");
    const created = await scope.expenses.create({
      spentOn: "2026-06-01",
      merchant: "State Farm",
      amountCents: cents(2117),
      categoryId: insurance.id,
      clientId: null,
      taxPaidCents: 0,
      note: "Monthly premium",
      recurring: true,
      actorUserId: owner.userId,
    });
    expect(created.recurring).toBe(true);
    const listed = await scope.expenses.list({
      from: null,
      to: null,
      categoryId: null,
    });
    expect(listed.find((row) => row.id === created.id)?.recurring).toBe(true);
    const cleared = await scope.expenses.update(created.id, {
      spentOn: "2026-06-01",
      merchant: "State Farm",
      amountCents: cents(2117),
      categoryId: insurance.id,
      clientId: null,
      taxPaidCents: 0,
      note: "Monthly premium",
      recurring: false,
      actorUserId: owner.userId,
    });
    expect(cleared?.recurring).toBe(false);
    expect(created.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("archives a Category that is in use and keeps Merchant fees", async () => {
    const owner = await insertOwner("exp-arch@example.com", "Archive Prints");
    const scope = forBusiness(getDb(), owner.businessId);
    const supplies = (await scope.categories.list()).find(
      (row) => row.systemKey === "supplies",
    );
    const fees = (await scope.categories.list()).find(
      (row) => row.systemKey === "merchant_fees",
    );
    if (!supplies || !fees) throw new Error("categories");
    await scope.expenses.create({
      spentOn: "2026-05-01",
      merchant: "Desk",
      amountCents: cents(800),
      categoryId: supplies.id,
      clientId: null,
      taxPaidCents: 0,
      note: null,
      actorUserId: owner.userId,
    });
    expect(
      (await scope.categories.setArchived(supplies.id, true))?.archived,
    ).toBe(true);
    expect(
      (await scope.expenses.list({ from: null, to: null, categoryId: null }))[0]
        ?.categoryId,
    ).toBe(supplies.id);
    await expect(
      scope.expenses.create({
        spentOn: "2026-05-02",
        merchant: "More",
        amountCents: cents(100),
        categoryId: supplies.id,
        clientId: null,
        taxPaidCents: 0,
        note: null,
        actorUserId: owner.userId,
      }),
    ).rejects.toThrow(/Category/);
    await expect(scope.categories.setArchived(fees.id, true)).rejects.toThrow(
      /Merchant fees/,
    );
    expect((await scope.categories.rename(fees.id, "Card fees"))?.name).toBe(
      "Card fees",
    );
    const added = await scope.categories.create("Booth", "cogs");
    expect(added.categoryGroup).toBe("cogs");
    await expect(
      scope.categories.create("booth", "schedule_c"),
    ).rejects.toThrow(/already used/);
  });
});
