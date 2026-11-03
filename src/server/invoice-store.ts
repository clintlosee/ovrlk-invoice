import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppDb } from "../db/client";
import {
  auditLog,
  business,
  client,
  invoice,
  invoiceCounter,
  invoiceLine,
  invoiceLineTax,
  invoiceLink,
  payment,
  taxRate,
} from "../db/schema";
import {
  accentOrDefault,
  amountDueCents,
  assertIsoDate,
  displayStatus,
  formatInvoiceNumber,
  INVOICE_LINK_TTL_MS,
  type InvoiceDisplayStatus,
  type InvoiceSnapshot,
  type InvoiceStatus,
  isInvoiceStatus,
  priceInvoice,
  todayInTimeZone,
} from "../lib/invoice";
import { createInvoiceToken } from "./invoice-token";
import { type PaymentView, paymentsByInvoice } from "./payment-store";

export type InvoiceLineInput = {
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  taxRateIds: string[];
};

export type InvoiceInput = {
  clientId: string;
  issueDate: string;
  dueDate: string;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  lines: InvoiceLineInput[];
};

export type InvoiceEditorLine = {
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  taxRateIds: string[];
};

export type InvoiceView = {
  id: string;
  number: number;
  numberLabel: string;
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
  clientId: string;
  voidReason: string | null;
  sentAt: Date | null;
  voidedAt: Date | null;
  firstViewedAt: Date | null;
  locked: boolean;
  amountDueCents: number;
  paidCents: number;
  payments: PaymentView[];
  document: InvoiceSnapshot;
  editorLines: InvoiceEditorLine[] | null;
};

type ResolvedTax = { id: string; name: string; rateBps: number };

const writeTail = new Map<string, Promise<unknown>>();

// ponytail: one write at a time per Business on this connection. Two processes
// still get distinct numbers from the invoice_counter upsert. Drop the queue
// if the driver grows a real pool.
function writeBusiness<T>(id: string, run: () => Promise<T>): Promise<T> {
  const previous = writeTail.get(id) ?? Promise.resolve();
  const next = previous.then(run, run);
  writeTail.set(
    id,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

const LIMITS = {
  name: 200,
  description: 2000,
  reference: 100,
  notes: 4000,
  terms: 4000,
  lines: 100,
  reason: 500,
};

export function invoiceMethods(db: AppDb, businessId: string) {
  async function businessRow() {
    const rows = await db
      .select()
      .from(business)
      .where(eq(business.id, businessId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("A signed-in Business is required");
    return row;
  }

  async function resolveTaxes(ids: string[]): Promise<ResolvedTax[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await db
      .select({
        id: taxRate.id,
        name: taxRate.name,
        rateBps: taxRate.rateBps,
      })
      .from(taxRate)
      .where(
        and(eq(taxRate.businessId, businessId), inArray(taxRate.id, unique)),
      );
    if (rows.length !== unique.length) {
      throw new Error("Tax Rate does not belong to this Business");
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    return unique.map((id) => {
      const row = byId.get(id);
      if (!row) throw new Error("Tax Rate does not belong to this Business");
      return row;
    });
  }

  function assertText(
    value: string | null,
    max: number,
    label: string,
  ): string | null {
    if (value === null) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > max) throw new Error(`${label} is too long`);
    return trimmed;
  }

  async function prepare(
    input: InvoiceInput,
    clientRule: { allowArchivedId: string | null },
  ) {
    if (input.lines.length > LIMITS.lines) {
      throw new Error("An Invoice can have at most 100 lines");
    }
    const issueDate = assertIsoDate(input.issueDate);
    const dueDate = assertIsoDate(input.dueDate);
    const clients = await db
      .select()
      .from(client)
      .where(
        and(eq(client.id, input.clientId), eq(client.businessId, businessId)),
      )
      .limit(1);
    const selected = clients[0];
    if (!selected) throw new Error("That Client does not exist");
    if (selected.archivedAt && selected.id !== clientRule.allowArchivedId) {
      throw new Error("That Client is archived");
    }
    const lines = [];
    for (const line of input.lines) {
      const name = assertText(line.name, LIMITS.name, "Line name");
      if (!name) throw new Error("Each line needs a name");
      lines.push({
        name,
        description: assertText(
          line.description,
          LIMITS.description,
          "Description",
        ),
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxes: await resolveTaxes(line.taxRateIds),
      });
    }
    const priced = priceInvoice({
      lines,
      taxExempt: selected.taxExempt,
    });
    const biz = await businessRow();
    const documentBase = {
      currency: biz.currency,
      issueDate,
      dueDate,
      reference: assertText(input.reference, LIMITS.reference, "Reference"),
      notes: assertText(input.notes, LIMITS.notes, "Notes"),
      terms: assertText(input.terms, LIMITS.terms, "Terms"),
      client: {
        name: selected.name,
        email: selected.email,
        phone: selected.phone,
        address: selected.address,
        taxExempt: selected.taxExempt,
      },
      business: {
        name: biz.name,
        address: biz.address,
        taxId: biz.taxId,
        footer: biz.footer,
        accentColor: accentOrDefault(biz.accentColor),
      },
    };
    return { selected, priced, documentBase };
  }

  async function insertLines(
    tx: Pick<AppDb, "insert">,
    invoiceId: string,
    prepared: Awaited<ReturnType<typeof prepare>>,
  ) {
    for (const [position, line] of prepared.priced.lines.entries()) {
      const lineId = crypto.randomUUID();
      await tx.insert(invoiceLine).values({
        id: lineId,
        invoiceId,
        businessId,
        position,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      });
      if (line.taxes.length === 0) continue;
      await tx.insert(invoiceLineTax).values(
        line.taxes.map((tax) => ({
          id: crypto.randomUUID(),
          lineId,
          businessId,
          taxRateId: tax.id,
          name: tax.name,
          rateBps: tax.rateBps,
          taxCents: tax.taxCents,
        })),
      );
    }
  }

  async function allocate(tx: Pick<AppDb, "insert">): Promise<number> {
    const rows = await tx
      .insert(invoiceCounter)
      .values({ businessId, lastNumber: 1 })
      .onConflictDoUpdate({
        target: invoiceCounter.businessId,
        set: { lastNumber: sql`${invoiceCounter.lastNumber} + 1` },
      })
      .returning({ lastNumber: invoiceCounter.lastNumber });
    const number = rows[0]?.lastNumber;
    if (!number || number < 1) {
      throw new Error("Could not assign an Invoice Number");
    }
    return number;
  }

  async function present(
    rows: (typeof invoice.$inferSelect)[],
  ): Promise<InvoiceView[]> {
    if (rows.length === 0) return [];
    const biz = await businessRow();
    const today = todayInTimeZone(biz.timeZone);
    const paymentMap = await paymentsByInvoice(
      db,
      businessId,
      rows.map((row) => row.id),
    );
    const drafts = rows.filter(
      (row) => row.status === "draft" || !row.snapshot,
    );
    const draftIds = drafts.map((row) => row.id);
    const lineRows =
      draftIds.length === 0
        ? []
        : await db
            .select()
            .from(invoiceLine)
            .where(
              and(
                eq(invoiceLine.businessId, businessId),
                inArray(invoiceLine.invoiceId, draftIds),
              ),
            )
            .orderBy(asc(invoiceLine.position));
    const lineIds = lineRows.map((row) => row.id);
    const taxRows =
      lineIds.length === 0
        ? []
        : await db
            .select()
            .from(invoiceLineTax)
            .where(
              and(
                eq(invoiceLineTax.businessId, businessId),
                inArray(invoiceLineTax.lineId, lineIds),
              ),
            );
    const clientIds = [...new Set(drafts.map((row) => row.clientId))];
    const clientRows =
      clientIds.length === 0
        ? []
        : await db
            .select()
            .from(client)
            .where(
              and(
                eq(client.businessId, businessId),
                inArray(client.id, clientIds),
              ),
            );
    const rateIds = [
      ...new Set(
        taxRows.flatMap((row) => (row.taxRateId ? [row.taxRateId] : [])),
      ),
    ];
    const rateRows =
      rateIds.length === 0
        ? []
        : await db
            .select()
            .from(taxRate)
            .where(
              and(
                eq(taxRate.businessId, businessId),
                inArray(taxRate.id, rateIds),
              ),
            );
    const clientById = new Map(clientRows.map((row) => [row.id, row]));
    const rateById = new Map(rateRows.map((row) => [row.id, row]));
    const linesByInvoice = new Map<string, typeof lineRows>();
    for (const line of lineRows) {
      const list = linesByInvoice.get(line.invoiceId) ?? [];
      list.push(line);
      linesByInvoice.set(line.invoiceId, list);
    }
    const taxesByLine = new Map<string, typeof taxRows>();
    for (const tax of taxRows) {
      const list = taxesByLine.get(tax.lineId) ?? [];
      list.push(tax);
      taxesByLine.set(tax.lineId, list);
    }

    return rows.map((row) => {
      if (!isInvoiceStatus(row.status)) {
        throw new Error("Invoice status is not valid");
      }
      const payments = paymentMap.get(row.id) ?? [];
      const paidCents = payments.reduce(
        (sum, item) => sum + item.amountCents,
        0,
      );
      if (row.status !== "draft" && row.snapshot) {
        const document = JSON.parse(row.snapshot) as InvoiceSnapshot;
        return {
          id: row.id,
          number: row.number,
          numberLabel: formatInvoiceNumber(row.number),
          status: row.status,
          displayStatus: displayStatus(
            row.status,
            document.dueDate,
            today,
            row.firstViewedAt != null,
          ),
          clientId: row.clientId,
          voidReason: row.voidReason,
          sentAt: row.sentAt,
          voidedAt: row.voidedAt,
          firstViewedAt: row.firstViewedAt,
          locked: true,
          amountDueCents: amountDueCents(
            row.status,
            document.totalCents,
            paidCents,
          ),
          paidCents,
          payments,
          document,
          editorLines: null,
        };
      }
      const selected = clientById.get(row.clientId);
      if (!selected) throw new Error("That Client does not exist");
      const storedLines = linesByInvoice.get(row.id) ?? [];
      const editorLines: InvoiceEditorLine[] = storedLines.map((line) => ({
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxRateIds: (taxesByLine.get(line.id) ?? []).flatMap((tax) =>
          tax.taxRateId ? [tax.taxRateId] : [],
        ),
      }));
      const priced = priceInvoice({
        taxExempt: selected.taxExempt,
        lines: storedLines.map((line) => ({
          name: line.name,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          taxes: (taxesByLine.get(line.id) ?? []).map((tax) => {
            const live = tax.taxRateId
              ? rateById.get(tax.taxRateId)
              : undefined;
            return {
              id: live?.id ?? tax.id,
              name: live?.name ?? tax.name,
              rateBps: live?.rateBps ?? tax.rateBps,
            };
          }),
        })),
      });
      const document: InvoiceSnapshot = {
        number: row.number,
        currency: biz.currency,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        reference: row.reference,
        notes: row.notes,
        terms: row.terms,
        client: {
          name: selected.name,
          email: selected.email,
          phone: selected.phone,
          address: selected.address,
          taxExempt: selected.taxExempt,
        },
        business: {
          name: biz.name,
          address: biz.address,
          taxId: biz.taxId,
          footer: biz.footer,
          accentColor: accentOrDefault(biz.accentColor),
        },
        lines: priced.lines.map((line) => ({
          name: line.name,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          amountCents: line.amountCents,
          taxCents: line.taxCents,
          taxes: line.taxes.map((tax) => ({
            name: tax.name,
            rateBps: tax.rateBps,
            taxCents: tax.taxCents,
          })),
        })),
        subtotalCents: priced.subtotalCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
      };
      return {
        id: row.id,
        number: row.number,
        numberLabel: formatInvoiceNumber(row.number),
        status: row.status,
        displayStatus: displayStatus(
          row.status,
          document.dueDate,
          today,
          row.firstViewedAt != null,
        ),
        clientId: row.clientId,
        voidReason: row.voidReason,
        sentAt: row.sentAt,
        voidedAt: row.voidedAt,
        firstViewedAt: row.firstViewedAt,
        locked: false,
        amountDueCents: amountDueCents(
          row.status,
          document.totalCents,
          paidCents,
        ),
        paidCents,
        payments,
        document,
        editorLines,
      };
    });
  }

  async function load(id: string) {
    const rows = await db
      .select()
      .from(invoice)
      .where(and(eq(invoice.id, id), eq(invoice.businessId, businessId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const views = await present([row]);
    return views[0] ?? null;
  }

  async function writeLink(
    tx: Pick<AppDb, "insert" | "update">,
    invoiceId: string,
    replace: boolean,
  ) {
    const now = new Date();
    if (replace) {
      await tx
        .update(invoiceLink)
        .set({ revokedAt: now })
        .where(
          and(
            eq(invoiceLink.invoiceId, invoiceId),
            eq(invoiceLink.businessId, businessId),
            isNull(invoiceLink.revokedAt),
          ),
        );
    }
    const created = createInvoiceToken();
    const expiresAt = new Date(now.getTime() + INVOICE_LINK_TTL_MS);
    await tx.insert(invoiceLink).values({
      id: crypto.randomUUID(),
      businessId,
      invoiceId,
      tokenHash: created.tokenHash,
      expiresAt,
      revokedAt: null,
      createdAt: now,
    });
    return { token: created.token, expiresAt };
  }

  return {
    async list() {
      const rows = await db
        .select()
        .from(invoice)
        .where(eq(invoice.businessId, businessId))
        .orderBy(desc(invoice.number));
      return present(rows);
    },
    get: load,
    async create(input: InvoiceInput) {
      const prepared = await prepare(input, { allowArchivedId: null });
      const id = crypto.randomUUID();
      const now = new Date();
      await writeBusiness(businessId, () =>
        db.transaction(async (tx) => {
          const number = await allocate(tx);
          await tx.insert(invoice).values({
            id,
            businessId,
            clientId: prepared.selected.id,
            number,
            status: "draft",
            issueDate: prepared.documentBase.issueDate,
            dueDate: prepared.documentBase.dueDate,
            reference: prepared.documentBase.reference,
            notes: prepared.documentBase.notes,
            terms: prepared.documentBase.terms,
            voidReason: null,
            voidedAt: null,
            sentAt: null,
            firstViewedAt: null,
            subtotalCents: prepared.priced.subtotalCents,
            taxCents: prepared.priced.taxCents,
            totalCents: prepared.priced.totalCents,
            snapshot: null,
            createdAt: now,
            updatedAt: now,
          });
          await insertLines(tx, id, prepared);
        }),
      );
      const saved = await load(id);
      if (!saved) throw new Error("Could not save the Invoice");
      return saved;
    },
    async update(id: string, input: InvoiceInput) {
      const existing = await db
        .select({
          id: invoice.id,
          status: invoice.status,
          clientId: invoice.clientId,
        })
        .from(invoice)
        .where(and(eq(invoice.id, id), eq(invoice.businessId, businessId)))
        .limit(1);
      const row = existing[0];
      if (!row) return null;
      if (row.status !== "draft") {
        throw new Error("A sent Invoice cannot be changed");
      }
      const prepared = await prepare(input, {
        allowArchivedId: row.clientId,
      });
      const now = new Date();
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(invoice)
          .set({
            clientId: prepared.selected.id,
            issueDate: prepared.documentBase.issueDate,
            dueDate: prepared.documentBase.dueDate,
            reference: prepared.documentBase.reference,
            notes: prepared.documentBase.notes,
            terms: prepared.documentBase.terms,
            subtotalCents: prepared.priced.subtotalCents,
            taxCents: prepared.priced.taxCents,
            totalCents: prepared.priced.totalCents,
            updatedAt: now,
          })
          .where(
            and(
              eq(invoice.id, id),
              eq(invoice.businessId, businessId),
              eq(invoice.status, "draft"),
            ),
          )
          .returning({ id: invoice.id });
        if (!updated[0]) throw new Error("A sent Invoice cannot be changed");
        await tx
          .delete(invoiceLine)
          .where(
            and(
              eq(invoiceLine.invoiceId, id),
              eq(invoiceLine.businessId, businessId),
            ),
          );
        await insertLines(tx, id, prepared);
      });
      return load(id);
    },
    async remove(id: string) {
      const rows = await db
        .delete(invoice)
        .where(
          and(
            eq(invoice.id, id),
            eq(invoice.businessId, businessId),
            eq(invoice.status, "draft"),
          ),
        )
        .returning({ id: invoice.id });
      return rows.length;
    },
    async send(id: string, actorUserId: string) {
      const current = await load(id);
      if (!current) return null;
      if (current.status !== "draft")
        throw new Error("Only a draft can be sent");
      if (current.document.lines.length === 0) {
        throw new Error("Add a line before sending");
      }
      const now = new Date();
      let token = "";
      let expiresAt = now;
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(invoice)
          .set({
            status: "sent",
            sentAt: now,
            snapshot: JSON.stringify(current.document),
            subtotalCents: current.document.subtotalCents,
            taxCents: current.document.taxCents,
            totalCents: current.document.totalCents,
            updatedAt: now,
          })
          .where(
            and(
              eq(invoice.id, id),
              eq(invoice.businessId, businessId),
              eq(invoice.status, "draft"),
            ),
          )
          .returning({ id: invoice.id });
        if (!updated[0]) throw new Error("Only a draft can be sent");
        const link = await writeLink(tx, id, false);
        token = link.token;
        expiresAt = link.expiresAt;
        await tx.insert(auditLog).values({
          id: crypto.randomUUID(),
          businessId,
          actorUserId,
          action: "invoice.sent",
          entityType: "invoice",
          entityId: id,
          amountCents: current.document.totalCents,
          metadata: JSON.stringify({ number: current.number }),
          ip: null,
          userAgent: null,
          createdAt: now,
        });
      });
      const saved = await load(id);
      if (!saved || !token) throw new Error("Could not send the Invoice");
      return { invoice: saved, token, expiresAt };
    },
    async voidInvoice(id: string, reason: string, actorUserId: string) {
      const trimmed = reason.trim();
      if (!trimmed || trimmed.length > LIMITS.reason) {
        throw new Error("A void reason is required");
      }
      const now = new Date();
      const row = await db.transaction(async (tx) => {
        const existing = await tx
          .select({
            id: invoice.id,
            status: invoice.status,
            totalCents: invoice.totalCents,
            number: invoice.number,
          })
          .from(invoice)
          .where(and(eq(invoice.id, id), eq(invoice.businessId, businessId)))
          .limit(1);
        const current = existing[0];
        if (!current) return null;
        const paid = await tx
          .select({ id: payment.id })
          .from(payment)
          .where(
            and(eq(payment.invoiceId, id), eq(payment.businessId, businessId)),
          )
          .limit(1);
        if (
          paid[0] ||
          current.status === "partial" ||
          current.status === "paid"
        ) {
          throw new Error("An Invoice with a Payment cannot be voided");
        }
        if (current.status !== "sent") {
          throw new Error("Only a sent Invoice can be voided");
        }
        const updated = await tx
          .update(invoice)
          .set({
            status: "void",
            voidReason: trimmed,
            voidedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(invoice.id, id),
              eq(invoice.businessId, businessId),
              eq(invoice.status, "sent"),
            ),
          )
          .returning({
            id: invoice.id,
            totalCents: invoice.totalCents,
            number: invoice.number,
          });
        const saved = updated[0];
        if (!saved) throw new Error("Only a sent Invoice can be voided");
        await tx.insert(auditLog).values({
          id: crypto.randomUUID(),
          businessId,
          actorUserId,
          action: "invoice.voided",
          entityType: "invoice",
          entityId: id,
          amountCents: saved.totalCents,
          metadata: JSON.stringify({ number: saved.number, reason: trimmed }),
          ip: null,
          userAgent: null,
          createdAt: now,
        });
        return saved;
      });
      if (!row) return null;
      return load(id);
    },
    async issueLink(id: string, replace: boolean) {
      const rows = await db
        .select({
          id: invoice.id,
          status: invoice.status,
          snapshot: invoice.snapshot,
        })
        .from(invoice)
        .where(and(eq(invoice.id, id), eq(invoice.businessId, businessId)))
        .limit(1);
      const row = rows[0];
      if (!row || row.status === "draft" || !row.snapshot) return null;
      return db.transaction(async (tx) => writeLink(tx, id, replace));
    },
    async revokeLinks(id: string) {
      const rows = await db
        .select({ id: invoice.id })
        .from(invoice)
        .where(and(eq(invoice.id, id), eq(invoice.businessId, businessId)))
        .limit(1);
      if (!rows[0]) return false;
      await db
        .update(invoiceLink)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invoiceLink.invoiceId, id),
            eq(invoiceLink.businessId, businessId),
            isNull(invoiceLink.revokedAt),
          ),
        );
      return true;
    },
    async markViewed(id: string, at = new Date()) {
      await db
        .update(invoice)
        .set({ firstViewedAt: at })
        .where(
          and(
            eq(invoice.id, id),
            eq(invoice.businessId, businessId),
            isNull(invoice.firstViewedAt),
          ),
        );
    },
  };
}
