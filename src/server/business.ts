import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../db/client";
import { addCalendarDays, todayInTimeZone } from "../lib/invoice";
import { stripeConfigured } from "../lib/stripe";
import { signedInBusiness } from "./membership";
import { beginStripeOnboarding, disconnectStripe } from "./stripe";
import { forBusiness } from "./tenancy";

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .transform((value) => (value.length === 0 ? null : value));

const profileFields = z.object({
  name: z.string().trim().min(1, "Business name is required.").max(200),
  address: optional(500, "Address"),
  taxId: optional(40, "Tax ID"),
  defaultTerms: optional(4000, "Terms"),
  footer: optional(500, "Footer"),
  accentColor: z.string().trim(),
});

export type BusinessFormValues = z.input<typeof profileFields>;

function saveError(error: unknown): { ok: false; message: string } {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("Accent") ||
    message.includes("too long") ||
    message.includes("name")
  ) {
    return {
      ok: false,
      message: message.endsWith(".") ? message : `${message}.`,
    };
  }
  throw error;
}

async function scope() {
  const current = await signedInBusiness();
  if (!current) return null;
  return forBusiness(getDb(), current.businessId);
}

function present(row: {
  name: string;
  address: string | null;
  taxId: string | null;
  defaultTerms: string | null;
  footer: string | null;
  accentColor: string | null;
  timeZone: string;
  currency: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripeDetailsSubmitted: boolean;
}) {
  const today = todayInTimeZone(row.timeZone);
  return {
    name: row.name,
    address: row.address ?? "",
    taxId: row.taxId ?? "",
    defaultTerms: row.defaultTerms ?? "",
    footer: row.footer ?? "",
    accentColor: row.accentColor ?? "#1c1917",
    timeZone: row.timeZone,
    currency: row.currency,
    today,
    dueDate: addCalendarDays(today, 30),
    stripeConfigured: stripeConfigured(),
    stripeAccountId: row.stripeAccountId,
    stripeChargesEnabled: row.stripeChargesEnabled,
    stripeDetailsSubmitted: row.stripeDetailsSubmitted,
  };
}

export const getBusinessSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = await scope();
    if (!db) return null;
    const row = await db.business.get();
    return row ? present(row) : null;
  },
);

export const updateBusinessSettings = createServerFn({ method: "POST" })
  .validator((data: BusinessFormValues) => data)
  .handler(async ({ data }) => {
    const parsed = profileFields.safeParse(data);
    if (!parsed.success) {
      return {
        ok: false as const,
        message:
          parsed.error.issues[0]?.message ?? "Check the form and try again.",
      };
    }
    const db = await scope();
    if (!db) return { ok: false as const, message: "Sign in again." };
    try {
      const row = await db.business.update({
        name: parsed.data.name,
        address: parsed.data.address,
        taxId: parsed.data.taxId,
        defaultTerms: parsed.data.defaultTerms,
        footer: parsed.data.footer,
        accentColor: parsed.data.accentColor,
      });
      if (!row) return { ok: false as const, message: "Sign in again." };
      return { ok: true as const, value: present(row) };
    } catch (error) {
      return saveError(error);
    }
  });

export const startStripeConnect = createServerFn({ method: "POST" }).handler(
  async () => {
    const current = await signedInBusiness();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const url = await beginStripeOnboarding(
        current.businessId,
        current.session.user.id,
      );
      return { ok: true as const, url };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("not configured")) {
        return { ok: false as const, message: "Stripe is not configured." };
      }
      if (message.includes("UNIQUE") || message.includes("stripe_account")) {
        return {
          ok: false as const,
          message: "That Connected Account is already linked.",
        };
      }
      return {
        ok: false as const,
        message: "Could not open Stripe. Try again.",
      };
    }
  },
);

export const disconnectConnectedAccount = createServerFn({
  method: "POST",
}).handler(async () => {
  const current = await signedInBusiness();
  if (!current) return { ok: false as const, message: "Sign in again." };
  await disconnectStripe(current.businessId, current.session.user.id);
  return { ok: true as const };
});
