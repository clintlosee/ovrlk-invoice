import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { invoiceLink } from "../db/schema";
import { acceptUpload, keyOwnedBy, objectKeyFor } from "../lib/files";
import { hashInvoiceToken, isInvoiceToken } from "./invoice-token";
import {
  discardObject,
  getObject,
  putObject,
  signedGetUrl,
  storageConfigured,
} from "./storage";
import { forBusiness } from "./tenancy";

export async function issueSignedGet(
  businessId: string,
  key: string,
): Promise<string> {
  const receipt = keyOwnedBy(businessId, key, "receipts");
  const logo = keyOwnedBy(businessId, key, "logos");
  if (!receipt && !logo) {
    throw new Error("That file does not belong to this Business");
  }
  const scope = forBusiness(getDb(), businessId);
  const ownedReceipt = receipt
    ? await scope.expenses.findByReceiptKey(key)
    : null;
  const row = await scope.business.get();
  if (!ownedReceipt && row?.logoKey !== key) {
    throw new Error("That file does not belong to this Business");
  }
  if (!storageConfigured()) throw new Error("File storage is not configured");
  return signedGetUrl(key);
}

export async function saveReceipt(
  businessId: string,
  expenseId: string,
  bytes: Uint8Array,
  declared: string,
): Promise<void> {
  if (!storageConfigured()) throw new Error("File storage is not configured");
  const contentType = acceptUpload(bytes, declared, "receipt");
  const key = objectKeyFor(businessId, "receipts");
  await putObject(key, bytes, contentType);
  let attached = false;
  try {
    const saved = await forBusiness(getDb(), businessId).expenses.attachReceipt(
      expenseId,
      key,
      contentType,
    );
    if (!saved) throw new Error("That Expense does not exist");
    attached = true;
    if (saved.previousKey && saved.previousKey !== key) {
      await discardObject(saved.previousKey);
    }
  } catch (error) {
    if (!attached) await discardObject(key);
    throw error;
  }
}

export async function clearReceipt(
  businessId: string,
  expenseId: string,
): Promise<boolean> {
  const saved = await forBusiness(getDb(), businessId).expenses.clearReceipt(
    expenseId,
  );
  if (!saved) return false;
  await discardObject(saved.previousKey);
  return true;
}

export async function openReceipt(
  businessId: string,
  expenseId: string,
): Promise<string | null> {
  const row = await forBusiness(getDb(), businessId).expenses.get(expenseId);
  if (!row?.receiptKey) return null;
  return issueSignedGet(businessId, row.receiptKey);
}

export async function saveLogo(
  businessId: string,
  bytes: Uint8Array,
  declared: string,
): Promise<void> {
  if (!storageConfigured()) throw new Error("File storage is not configured");
  const contentType = acceptUpload(bytes, declared, "logo");
  const key = objectKeyFor(businessId, "logos");
  await putObject(key, bytes, contentType);
  try {
    const previous = await forBusiness(getDb(), businessId).business.setLogo({
      key,
      contentType,
    });
    if (previous && previous !== key) await discardObject(previous);
  } catch (error) {
    await discardObject(key);
    throw error;
  }
}

export async function clearLogo(businessId: string): Promise<void> {
  const previous = await forBusiness(getDb(), businessId).business.setLogo({
    key: null,
    contentType: null,
  });
  await discardObject(previous);
}

export async function readLogo(
  businessId: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!storageConfigured()) return null;
  const row = await forBusiness(getDb(), businessId).business.get();
  if (!row?.logoKey || !keyOwnedBy(businessId, row.logoKey, "logos")) {
    return null;
  }
  return getObject(row.logoKey);
}

export async function readPublicLogo(
  token: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!isInvoiceToken(token)) return null;
  const rows = await getDb()
    .select()
    .from(invoiceLink)
    .where(eq(invoiceLink.tokenHash, hashInvoiceToken(token)))
    .limit(1);
  const link = rows[0];
  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return readLogo(link.businessId);
}
