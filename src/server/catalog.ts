import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../db/client";
import { formatCents, parseDollarsToCents } from "../lib/money";
import { formatBps, parsePercentToBps } from "../lib/tax";
import { signedInBusiness } from "./membership";
import {
  type ClientInput,
  forBusiness,
  type ItemInput,
  type TaxRateInput,
} from "./tenancy";

const blank = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .transform((value) => (value.length === 0 ? null : value));

const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(200, `${label} is too long.`);

const clientFields = z.object({
  name: nameField("Name"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(320, "Email is too long.")
    .toLowerCase()
    .pipe(z.email("Enter a valid email.")),
  phone: blank(40, "Phone"),
  address: blank(500, "Address"),
  taxExempt: z.boolean().default(false),
  note: blank(2000, "Note"),
});

const taxRateFields = z.object({
  name: nameField("Name"),
  rate: z.string(),
});

const itemFields = z.object({
  name: nameField("Name"),
  description: blank(2000, "Description"),
  unitPrice: z.string(),
  taxRateIds: z.array(z.string().min(1)).default([]),
});

const idField = z.object({ id: z.string().min(1) });

export type ClientFormValues = z.input<typeof clientFields>;
export type TaxRateFormValues = z.input<typeof taxRateFields>;
export type ItemFormValues = z.input<typeof itemFields>;

type Failure = { ok: false; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

function invalid(error: z.ZodError): Failure {
  return {
    ok: false,
    message: error.issues[0]?.message ?? "Check the form and try again.",
  };
}

function parseClient(input: unknown): Result<ClientInput> {
  const parsed = clientFields.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return { ok: true, value: parsed.data };
}

function parseTaxRate(input: unknown): Result<TaxRateInput> {
  const parsed = taxRateFields.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return {
      ok: true,
      value: {
        name: parsed.data.name,
        rateBps: parsePercentToBps(parsed.data.rate),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Enter a rate like 7.25",
    };
  }
}

function parseItem(input: unknown): Result<ItemInput> {
  const parsed = itemFields.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return {
      ok: true,
      value: {
        name: parsed.data.name,
        description: parsed.data.description,
        unitPriceCents: parseDollarsToCents(parsed.data.unitPrice),
        taxRateIds: [...new Set(parsed.data.taxRateIds)],
      },
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Enter a unit price like 12.50",
    };
  }
}

function presentClient(row: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxExempt: boolean;
  note: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? "",
    address: row.address ?? "",
    taxExempt: row.taxExempt,
    note: row.note ?? "",
    archived: row.archivedAt != null,
  };
}

function presentTaxRate(row: { id: string; name: string; rateBps: number }) {
  return {
    id: row.id,
    name: row.name,
    rateBps: row.rateBps,
    rate: formatBps(row.rateBps),
  };
}

function presentItem(row: {
  id: string;
  name: string;
  description: string | null;
  unitPriceCents: number;
  taxRates: { id: string; name: string; rateBps: number }[];
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    unitPriceCents: row.unitPriceCents,
    unitPrice: formatCents(row.unitPriceCents),
    taxRateIds: row.taxRates.map((rate) => rate.id),
    taxRates: row.taxRates.map((rate) => ({
      ...rate,
      rate: formatBps(rate.rateBps),
    })),
  };
}

async function scope() {
  const current = await signedInBusiness();
  if (!current) return null;
  return forBusiness(getDb(), current.businessId);
}

function saveError(error: unknown): Failure {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Tax Rate does not belong")) {
    return {
      ok: false,
      message: "Choose Tax Rates saved for this Business.",
    };
  }
  if (message.includes("basis points") || message.includes("rate like")) {
    return { ok: false, message: "Enter a rate like 7.25." };
  }
  if (message.includes("cents") || message.includes("unit price")) {
    return { ok: false, message: "Enter a unit price like 12.50." };
  }
  throw error;
}

export const getClients = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = await scope();
    if (!db) return null;
    return (await db.clients.list()).map(presentClient);
  },
);

export const getClient = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const db = await scope();
    if (!db) return null;
    const row = await db.clients.get(data.id);
    return row ? presentClient(row) : null;
  });

export const createClient = createServerFn({ method: "POST" })
  .validator((data: ClientFormValues) => data)
  .handler(async ({ data }) => {
    const parsed = parseClient(data);
    if (!parsed.ok) return parsed;
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    const row = await db.clients.create(parsed.value);
    return { ok: true as const, value: presentClient(row) };
  });

export const updateClient = createServerFn({ method: "POST" })
  .validator((data: ClientFormValues & { id: string }) => data)
  .handler(async ({ data }) => {
    const id = idField.safeParse({ id: data.id });
    if (!id.success) return invalid(id.error);
    const parsed = parseClient(data);
    if (!parsed.ok) return parsed;
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    const row = await db.clients.update(id.data.id, parsed.value);
    if (!row)
      return { ok: false as const, message: "That Client does not exist." };
    return { ok: true as const, value: presentClient(row) };
  });

export const setClientArchived = createServerFn({ method: "POST" })
  .validator((data: { id: string; archived: boolean }) => data)
  .handler(async ({ data }) => {
    const id = idField.safeParse({ id: data.id });
    if (!id.success || typeof data.archived !== "boolean") {
      return { ok: false as const, message: "That Client does not exist." };
    }
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    const row = await db.clients.setArchived(id.data.id, data.archived);
    if (!row)
      return { ok: false as const, message: "That Client does not exist." };
    return { ok: true as const, value: presentClient(row) };
  });

export const getTaxRates = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = await scope();
    if (!db) return null;
    return (await db.taxRates.list()).map(presentTaxRate);
  },
);

export const getTaxRate = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const db = await scope();
    if (!db) return null;
    const row = await db.taxRates.get(data.id);
    return row ? presentTaxRate(row) : null;
  });

export const createTaxRate = createServerFn({ method: "POST" })
  .validator((data: TaxRateFormValues) => data)
  .handler(async ({ data }) => {
    const parsed = parseTaxRate(data);
    if (!parsed.ok) return parsed;
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    try {
      const row = await db.taxRates.create(parsed.value);
      return { ok: true as const, value: presentTaxRate(row) };
    } catch (error) {
      return saveError(error);
    }
  });

export const updateTaxRate = createServerFn({ method: "POST" })
  .validator((data: TaxRateFormValues & { id: string }) => data)
  .handler(async ({ data }) => {
    const id = idField.safeParse({ id: data.id });
    if (!id.success) return invalid(id.error);
    const parsed = parseTaxRate(data);
    if (!parsed.ok) return parsed;
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    try {
      const row = await db.taxRates.update(id.data.id, parsed.value);
      if (!row) {
        return { ok: false as const, message: "That Tax Rate does not exist." };
      }
      return { ok: true as const, value: presentTaxRate(row) };
    } catch (error) {
      return saveError(error);
    }
  });

export const deleteTaxRate = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    const removed = await db.taxRates.remove(data.id);
    if (!removed) {
      return { ok: false as const, message: "That Tax Rate does not exist." };
    }
    return { ok: true as const };
  });

export const getItems = createServerFn({ method: "GET" }).handler(async () => {
  const db = await scope();
  if (!db) return null;
  return (await db.items.list()).map(presentItem);
});

export const getItem = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const db = await scope();
    if (!db) return null;
    const row = await db.items.get(data.id);
    return row ? presentItem(row) : null;
  });

export const createItem = createServerFn({ method: "POST" })
  .validator((data: ItemFormValues) => data)
  .handler(async ({ data }) => {
    const parsed = parseItem(data);
    if (!parsed.ok) return parsed;
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    try {
      const row = await db.items.create(parsed.value);
      return { ok: true as const, value: presentItem(row) };
    } catch (error) {
      return saveError(error);
    }
  });

export const updateItem = createServerFn({ method: "POST" })
  .validator((data: ItemFormValues & { id: string }) => data)
  .handler(async ({ data }) => {
    const id = idField.safeParse({ id: data.id });
    if (!id.success) return invalid(id.error);
    const parsed = parseItem(data);
    if (!parsed.ok) return parsed;
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    try {
      const row = await db.items.update(id.data.id, parsed.value);
      if (!row)
        return { ok: false as const, message: "That Item does not exist." };
      return { ok: true as const, value: presentItem(row) };
    } catch (error) {
      return saveError(error);
    }
  });

export const deleteItem = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    const removed = await db.items.remove(data.id);
    if (!removed)
      return { ok: false as const, message: "That Item does not exist." };
    return { ok: true as const };
  });
