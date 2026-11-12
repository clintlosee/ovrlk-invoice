# Bulk invoice actions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Owner select Invoices on the list and email, download, mark sent, edit, delete, or record manual Payments for that selection, and mark a draft sent only after its invoice email goes out.

**Architecture:** Store methods on the existing `forBusiness` invoice and payment scopes do the writes. One mail module prepares tokens, sends email, and only then commits a draft send. The list and the Add Payments screen call those server functions. No new public route and no new dependency.

**Tech Stack:** TypeScript, TanStack Start, Drizzle, Vitest, the existing PDF renderer and `deliverEmail`.

**Spec:** `docs/superpowers/specs/2026-11-11-bulk-invoice-actions-design.md`

## Global Constraints

- Tenancy stays in `forBusiness`. The Business id comes from the signed-in Owner's membership.
- Money is integer cents. Currency is USD.
- Public Invoice Links stay under `/p/` and keep the existing rate limit. This work adds no new public route.
- Package manager, runtime, and sign-up rules are unchanged.
- Use the words in `GLOSSARY.md`.

## Review Focus

- A draft whose invoice email throws stays a draft, and `openPublicInvoice` does not resolve a link for it. Task 1.
- `recordManualBatch` with one row the Business cannot pay stores no Payment. Task 6.
- `destroy` removes the Invoice, its Payments, and the card-processing Expense; the Client row remains; the next Invoice Number is not the destroyed one. Task 4.
- A selection that includes a paid Invoice has Add a Payment disabled, and `recordManualBatch` rejects a paid Invoice. Tasks 6 and 7.
- Two Clients in one send produce two emails, and neither body contains the other Client's Invoice Number. Task 2.

---

### Task 1: Commit a draft send only after the email succeeds

**Files:**
- Modify: `src/server/invoice-store.ts` (`send`, `writeLink`)
- Modify: `src/server/invoices.ts` (`sendInvoice`)
- Test: `tests/invoice-send.test.ts`

**Interfaces:**
- Consumes: `createInvoiceToken()`, `scope.invoices.send`, `deliverEmail`, `renderInvoicePdf`
- Produces: `send(id: string, actorUserId: string, prepared?: { token: string; tokenHash: string }): Promise<{ invoice: InvoiceView; token: string } | null>`. When `prepared` is set, `writeLink` stores that hash instead of creating a new token. `sendInvoice` still returns `{ ok: true, emailed: true, url, value }` on success. On email failure it returns `{ ok: true, emailed: false, message: "The email did not go out. The Invoice is still a draft.", value }` and does not include a url.

- [ ] **Step 1: Write the failing test**

Use `insertOwner`, `forBusiness`, and `getDb` the way `tests/invoice.test.ts` does. Create a draft with one line and a Client email.

```ts
it("leaves a draft unsent when the invoice email throws", async () => {
  const result = await mailDraft(scope, draft.id, owner.userId, async () => {
    throw new Error("smtp down");
  });
  expect(result).toEqual({
    ok: true,
    emailed: false,
    message: "The email did not go out. The Invoice is still a draft.",
  });
  expect((await scope.invoices.get(draft.id))?.status).toBe("draft");
  const links = await db
    .select()
    .from(invoiceLink)
    .where(eq(invoiceLink.invoiceId, draft.id));
  expect(links).toEqual([]);
});

it("marks the draft sent when the email succeeds and the link matches the emailed url", async () => {
  let url = "";
  const result = await mailDraft(
    scope,
    draft.id,
    owner.userId,
    async (message) => {
      url = message.url;
    },
  );
  expect(result.emailed).toBe(true);
  expect(result.url).toBe(url);
  expect((await scope.invoices.get(draft.id))?.status).toBe("sent");
  expect(
    await openPublicInvoice(url.split("/p/")[1], request("1.2.3.4")),
  ).toMatchObject({
    status: 200,
  });
});
```

`mailDraft` is the test name for the function the server function will call. A reminder test is not required here: `remindInvoice` is unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-send.test.ts`
Expected: FAIL because `mailDraft` is not defined.

- [ ] **Step 3: Implement `mailDraft` and thread it through `sendInvoice`**

Add `src/server/invoice-mail.ts`:

```ts
export async function mailDraft(
  scope: ReturnType<typeof forBusiness>,
  invoiceId: string,
  actorUserId: string,
  deliver: (message: { url: string; pdf: Uint8Array }) => Promise<void>,
): Promise<
  | { ok: true; emailed: true; url: string }
  | {
      ok: true;
      emailed: false;
      message: "The email did not go out. The Invoice is still a draft.";
    }
>;
```

Create the token with `createInvoiceToken()` before `deliver`. Render the PDF with status `"sent"`. Call `deliver`. Only if it resolves, call `scope.invoices.send(invoiceId, actorUserId, prepared)`. `sendInvoice` saves the draft first, as it does today, then calls `mailDraft` with a `deliver` that uses `sendInvoiceEmail` and `attachPdf` content. The old message "The Invoice is sent, but the email did not go out. Use Reminder to try again." is gone. `remindInvoice` is not modified.

`writeLink` takes an optional `{ token, tokenHash }`. Existing `send` callers that omit it still create a token inside `writeLink`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-send.test.ts tests/invoice.test.ts`
Expected: PASS, including the existing "only deletes drafts" and send tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-mail.ts src/server/invoice-store.ts src/server/invoices.ts tests/invoice-send.test.ts
git commit -m "Keep a draft unsent when its invoice email fails."
```

### Task 2: Send a selection by email

**Files:**
- Modify: `src/server/invoice-mail.ts`
- Modify: `src/lib/email.ts`
- Modify: `src/server/invoices.ts`
- Test: `tests/invoice-send.test.ts`

**Interfaces:**
- Consumes: `mailDraft`'s token-then-send rule, `scope.invoices.send`, `sendInvoiceEmail`
- Produces:
  - `sendInvoiceListEmail({ to, replyTo, businessName, invoices: { number, totalCents, dueDate, url }[], pdfs: { filename, content }[] }): Promise<void>`
  - `sendInvoicesByEmail(scope, actorUserId, invoiceIds: string[], options: { attachPdf: boolean }, deliver?: typeof deliverEmail): Promise<{ sentIds: string[]; skipped: { invoiceId: string; clientName: string; reason: "void" | "no-lines" | "no-email" | "email-failed" }[] }>`
  - `sendInvoices` server function, POST `{ ids: string[]; attachPdf: boolean }`, same return shape as `sendInvoicesByEmail` plus `ok`.

- [ ] **Step 1: Write the failing test**

Two Clients who both have email addresses, one draft each, plus one void and one draft with `lines: []`. A separate assertion uses a Client whose email is `""` and expects `reason: "no-email"` with that draft still `draft`.

```ts
it("emails each Client only their Invoices and does not send a void or an empty draft", async () => {
  const deliveries: { to: string; text: string; files: string[] }[] = [];
  const result = await sendInvoicesByEmail(
    scope,
    owner.userId,
    ids,
    { attachPdf: true },
    async (message) => {
      deliveries.push({
        to: message.to,
        text: message.text,
        files: (message.attachments ?? []).map((file) => file.filename),
      });
    },
  );
  expect(deliveries).toHaveLength(2);
  expect(deliveries[0].text).toContain("0000002");
  expect(deliveries[0].text).not.toContain("0000004");
  expect(deliveries[1].text).toContain("0000004");
  expect(deliveries[1].text).not.toContain("0000002");
  expect(deliveries[0].files).toEqual(["invoice-0000002.pdf"]);
  expect(deliveries[1].files).toEqual(["invoice-0000004.pdf"]);
  expect(result.skipped.map((row) => row.reason).sort()).toEqual([
    "no-lines",
    "void",
  ]);
  expect((await scope.invoices.get(adaA.id))?.status).toBe("sent");
});

it("leaves every draft in a failed Client email unsent", async () => {
  const result = await sendInvoicesByEmail(
    scope,
    owner.userId,
    [adaA.id, adaB.id],
    { attachPdf: false },
    async () => {
      throw new Error("smtp down");
    },
  );
  expect(result.sentIds).toEqual([]);
  expect(result.skipped).toEqual([
    { invoiceId: adaA.id, clientName: "Ada Prints", reason: "email-failed" },
    { invoiceId: adaB.id, clientName: "Ada Prints", reason: "email-failed" },
  ]);
  expect((await scope.invoices.get(adaA.id))?.status).toBe("draft");
  expect((await scope.invoices.get(adaB.id))?.status).toBe("draft");
});
```

A second assertion on the list email: subject `Invoices from Catalog Prints`, body contains `Amount due:` and each view URL, and `The PDFs are attached.` only when `pdfs.length > 0`. One Invoice for a Client uses `sendInvoiceEmail`, not the list email.

An already sent Invoice is included in the email and its status stays `sent` or `partial` or `paid`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-send.test.ts`
Expected: FAIL because `sendInvoicesByEmail` is not defined.

- [ ] **Step 3: Implement grouping, the list email, and `sendInvoices`**

Group the loaded Invoices by `clientId`. Skip void, a draft with no lines, and a Client whose email is blank. For one remaining Invoice, call `sendInvoiceEmail`. For two or more, call `sendInvoiceListEmail` with subject `Invoices from ${businessName}` and one block per Invoice: number, `Amount due:`, due date, `View the invoice:`. Create tokens first. After `deliver` resolves, commit every draft in that group with `scope.invoices.send` and the prepared token, in one database transaction (`send` may be called per id inside that transaction; if any commit throws, none of that group's drafts are sent). `attachPdf: false` passes no attachments. `sendInvoices` reads the session through the same `scope()` helper as `sendInvoice`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-send.test.ts tests/invoice-email.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-mail.ts src/lib/email.ts src/server/invoices.ts tests/invoice-send.test.ts
git commit -m "Send selected Invoices one email per Client."
```

### Task 3: Download one PDF per Invoice as a zip

**Files:**
- Create: `src/lib/zip.ts`
- Create: `src/routes/app/invoices/pdfs.ts`
- Test: `tests/zip.test.ts`

**Interfaces:**
- Consumes: `renderInvoicePdf`, `ownedInvoiceForPdf` (call it once per id from the signed-in Business; do not add a public route)
- Produces: `zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array`. GET `/app/invoices/pdfs?ids=` returns `application/zip` as `invoices.zip`. Each entry is `invoice-${numberLabel}.pdf`.

- [ ] **Step 1: Write the failing test**

```ts
it("stores each file uncompressed under its own name", () => {
  const zip = zipStored([
    { name: "invoice-0000001.pdf", data: new Uint8Array([1, 2, 3]) },
    { name: "invoice-0000002.pdf", data: new Uint8Array([4, 5]) },
  ]);
  const text = new TextDecoder().decode(zip);
  expect(text).toContain("invoice-0000001.pdf");
  expect(text).toContain("invoice-0000002.pdf");
  expect(zip[0]).toBe(0x50);
  expect(zip[1]).toBe(0x4b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/zip.test.ts`
Expected: FAIL because `zipStored` is not defined.

- [ ] **Step 3: Implement `zipStored` and the GET route**

Stored method 0, CRC-32 from `node:zlib`, no new package. The route requires a signed-in Business, renders every id that belongs to it, including void, and ignores an id from another Business. Missing ids are omitted. An empty selection returns 400.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/zip.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/zip.ts src/routes/app/invoices/pdfs.ts tests/zip.test.ts
git commit -m "Download selected Invoices as a zip of PDFs."
```

### Task 4: Destroy an Invoice and everything that belongs to it

**Files:**
- Modify: `src/server/invoice-store.ts`
- Modify: `src/server/invoices.ts`
- Test: `tests/invoice.test.ts`

**Interfaces:**
- Consumes: invoice row delete, which already cascades lines, line taxes, links, Payments, and the merchant-fee Expense
- Produces: `destroy(ids: string[], actorUserId: string): Promise<void>`. Throws `Invoice not found` if any id is missing from this Business, and writes nothing. `destroyInvoices` server function, POST `{ ids: string[] }`, returns `{ ok: true }` or `{ ok: false, message: "That Invoice does not exist." }`. Audit action `invoice.destroyed`, `entityType: "invoice"`, metadata `{ number }`.

- [ ] **Step 1: Write the failing test**

Send an Invoice, record a manual Payment, and insert a Payment with `method: "stripe"` plus an Expense whose `paymentId` is that Payment. Then `destroy`.

```ts
it("removes the Invoice, its Payments, and the processing fee, and does not reuse the number", async () => {
  await scope.invoices.destroy([sent.id], owner.userId);
  expect(await scope.invoices.get(sent.id)).toBeNull();
  expect(
    await db.select().from(payment).where(eq(payment.invoiceId, sent.id)),
  ).toEqual([]);
  expect(
    await db.select().from(expense).where(eq(expense.paymentId, cardPaymentId)),
  ).toEqual([]);
  expect(await scope.clients.get(client.id)).not.toBeNull();
  const next = await scope.invoices.create(input(client.id, []));
  expect(next.number).toBeGreaterThan(sent.number);
  const audit = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityId, sent.id));
  expect(audit.some((row) => row.action === "invoice.destroyed")).toBe(true);
});

it("destroys nothing when one id is not in this Business", async () => {
  await expect(
    scope.invoices.destroy([sent.id, other.id], owner.userId),
  ).rejects.toThrow("Invoice not found");
  expect(await scope.invoices.get(sent.id)).not.toBeNull();
});
```

Keep the existing assertion that `remove` deletes only a draft.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice.test.ts`
Expected: FAIL because `destroy` is not a function.

- [ ] **Step 3: Implement `destroy` in one transaction**

Delete each Invoice row. Do not call Stripe. If a merchant-fee Expense has a `receiptKey`, `discardObject` that key after the transaction commits. `invoices.remove` stays draft-only.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice.test.ts tests/payments.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-store.ts src/server/invoices.ts tests/invoice.test.ts
git commit -m "Destroy an Invoice and the Payments recorded on it."
```

### Task 5: Mark drafts sent without emailing

**Files:**
- Modify: `src/server/invoice-store.ts`
- Modify: `src/server/invoices.ts`
- Test: `tests/invoice-send.test.ts`

**Interfaces:**
- Consumes: `scope.invoices.send` with no prepared token
- Produces: `markSent(ids: string[], actorUserId: string): Promise<{ sentIds: string[]; skipped: { invoiceId: string; reason: "not-draft" | "no-lines" }[] }>`. `markInvoicesSent` server function, POST `{ ids: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
it("marks drafts sent and leaves partial, paid, void, and empty drafts alone", async () => {
  const result = await scope.invoices.markSent(
    [draft.id, empty.id, partial.id, paid.id, voided.id],
    owner.userId,
  );
  expect(result.sentIds).toEqual([draft.id]);
  expect((await scope.invoices.get(draft.id))?.status).toBe("sent");
  expect((await scope.invoices.get(partial.id))?.status).toBe("partial");
  expect(result.skipped).toEqual([
    { invoiceId: empty.id, reason: "no-lines" },
    { invoiceId: partial.id, reason: "not-draft" },
    { invoiceId: paid.id, reason: "not-draft" },
    { invoiceId: voided.id, reason: "not-draft" },
  ]);
});
```

Assert no email function is called. Pass a deliver spy only if `markSent` accepts one; it must not.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-send.test.ts`
Expected: FAIL because `markSent` is not a function.

- [ ] **Step 3: Implement `markSent`**

Call `send` for each draft that has a line. Do not call `deliverEmail`. A non-draft is skipped, not an error. All successful sends commit even if a later id is skipped.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-send.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-store.ts src/server/invoices.ts tests/invoice-send.test.ts
git commit -m "Mark selected drafts sent without emailing."
```

### Task 6: Record manual Payments for several Invoices

**Files:**
- Modify: `src/server/payment-store.ts`
- Modify: `src/lib/email.ts`
- Modify: `src/server/payments.ts`
- Test: `tests/payments.test.ts`

**Interfaces:**
- Consumes: `payableInvoice`, `writeStatus`, `positiveCents`, `isManualPaymentMethod`. Does not call `receipt` or `sendReceiptEmail`.
- Produces:
  - `recordManualBatch(input: { actorUserId: string; notify: boolean; rows: { invoiceId: string; amountCents: number; paidOn: string; method: ManualPaymentMethod; note: string | null }[] }, deliver?: (message: Outbound) => Promise<void>): Promise<{ ids: string[]; emailed: string[]; skipped: { clientName: string; reason: "no-email" | "email-failed" }[] }>`. `notify` defaults to false when omitted. `deliver` runs only when `notify` is true.
  - `sendPaymentReceivedEmail` with subject `Payment received from ${businessName}` and a body that lists `Invoice ${numberLabel}: ${amount}` and `Balance due:` or `This invoice is paid.` It must not receive a method or a note.
  - `recordInvoicePayments` server function, POST `{ notify: boolean; rows: ... }`.

- [ ] **Step 1: Write the failing test**

```ts
it("rolls back every Payment when one Invoice is paid", async () => {
  await expect(
    scope.payments.recordManualBatch({
      actorUserId: owner.userId,
      rows: [
        {
          invoiceId: open.id,
          amountCents: 500,
          paidOn: "2026-11-11",
          method: "check",
          note: "1042",
        },
        {
          invoiceId: paid.id,
          amountCents: 100,
          paidOn: "2026-11-11",
          method: "check",
          note: null,
        },
      ],
    }),
  ).rejects.toThrow("A Payment can be recorded on a sent Invoice");
  expect(
    await db.select().from(payment).where(eq(payment.invoiceId, open.id)),
  ).toEqual([]);
});

it("stores a partial Payment and a credit above the balance, and omits the note and method from the email", async () => {
  let text = "";
  await scope.payments.recordManualBatch(
    {
      actorUserId: owner.userId,
      notify: true,
      rows: [
        {
          invoiceId: open.id,
          amountCents: 100,
          paidOn: "2026-11-11",
          method: "check",
          note: "1042",
        },
        {
          invoiceId: other.id,
          amountCents: otherTotal + 50,
          paidOn: "2026-11-11",
          method: "venmo",
          note: null,
        },
      ],
    },
    async (message) => {
      text = message.text;
    },
  );
  expect((await scope.invoices.get(open.id))?.status).toBe("partial");
  expect((await scope.invoices.get(other.id))?.status).toBe("paid");
  expect(text).toContain("Invoice 0000001: $1.00");
  expect(text).not.toContain("1042");
  expect(text.toLowerCase()).not.toContain("check");
  expect(text.toLowerCase()).not.toContain("venmo");
});
```

Also assert `notify: false` does not call `deliver`, a blank Client email still stores the Payment and returns `skipped: [{ clientName, reason: "no-email" }]`, and a throwing `deliver` leaves the Payments in place with `reason: "email-failed"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/payments.test.ts`
Expected: FAIL because `recordManualBatch` is not a function.

- [ ] **Step 3: Implement the batch in one transaction, then email**

One `mutate` transaction for every row. After commit, if `notify` is true, one `sendPaymentReceivedEmail` per Client covering only that Client's rows. Amounts are the amounts in the rows, not the invoice totals. Balance is `max(0, totalCents - netPaid)`. Do not change `recordManual`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/payments.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/payment-store.ts src/lib/email.ts src/server/payments.ts tests/payments.test.ts
git commit -m "Record manual Payments for several Invoices at once."
```

### Task 7: Decide which bulk actions are available

**Files:**
- Create: `src/lib/invoice-bulk.ts`
- Test: `tests/invoice-bulk.test.ts`

**Interfaces:**
- Consumes: stored status `draft | sent | partial | paid | void`
- Produces:

```ts
export function bulkActionState(
  invoices: { id: string; status: InvoiceStatus }[],
): {
  edit: boolean;
  addPayment: boolean;
};
```

Edit is true only for exactly one Invoice whose status is `draft`, `sent`, or `partial`. Add a Payment is true only when every Invoice is `sent` or `partial` and the list is not empty. Send by Email, Download PDF, Mark as Sent, and Delete are always offered when the list is not empty; the server skips rows they do not apply to.

- [ ] **Step 1: Write the failing test**

```ts
expect(bulkActionState([{ id: "a", status: "sent" }])).toEqual({
  edit: true,
  addPayment: true,
});
expect(bulkActionState([{ id: "a", status: "paid" }]).edit).toBe(false);
expect(bulkActionState([{ id: "a", status: "void" }]).edit).toBe(false);
expect(
  bulkActionState([
    { id: "a", status: "sent" },
    { id: "b", status: "partial" },
  ]).edit,
).toBe(false);
expect(
  bulkActionState([
    { id: "a", status: "sent" },
    { id: "b", status: "paid" },
  ]).addPayment,
).toBe(false);
expect(bulkActionState([{ id: "a", status: "draft" }]).addPayment).toBe(false);
expect(bulkActionState([{ id: "a", status: "void" }]).addPayment).toBe(false);
expect(bulkActionState([]).addPayment).toBe(false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-bulk.test.ts`
Expected: FAIL because `bulkActionState` is not defined.

- [ ] **Step 3: Implement `bulkActionState`**

The function is the whole module.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-bulk.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice-bulk.ts tests/invoice-bulk.test.ts
git commit -m "Decide when Edit and Add a Payment are available."
```

### Task 8: Invoice list selection and Bulk Actions

**Files:**
- Modify: `src/routes/app/invoices/index.tsx`
- Create: `src/components/invoice-bulk-bar.tsx`

**Interfaces:**
- Consumes: `bulkActionState`, `sendInvoices`, `markInvoicesSent`, `destroyInvoices`, GET `/app/invoices/pdfs?ids=`
- Produces: a checkbox on every row, including paid, draft, and void. The stretched row link must not cover the checkbox (`relative z-10` on the checkbox cell). When the count is greater than zero, the section heading shows `Selected ${n}` and a Bulk Actions menu.

- [ ] **Step 1: Write the failing test**

No new behavior test. The rules are Task 7. This task's check is the typecheck in Step 4.

- [ ] **Step 2: Implement the bar and the dialogs**

Keep the current columns: Client / Invoice Number, description, issued and due, amount and status. Let the client column take the free width so issued, amount, and status sit on the right.

Menu items, in order: Edit, Send by Email, Download PDF, Mark as Sent, Add a Payment, Delete. Edit and Add a Payment use `disabled` from `bulkActionState`. Edit navigates to `/app/invoices/$invoiceId` for the one selected id.

Send by Email opens a confirm with a checkbox "Attach PDFs", checked by default, then calls `sendInvoices`. Download PDF navigates the browser to the zip URL. Mark as Sent calls `markInvoicesSent`. When `sentIds` is empty, tell the Owner nothing was marked sent. Delete asks `Delete ${n} invoices? Payments recorded on them are removed too.` and then calls `destroyInvoices`. After each action, show the skipped names and reasons from the result and clear the selection. There is no select-all control.

- [ ] **Step 3: Run the typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/invoices/index.tsx src/components/invoice-bulk-bar.tsx
git commit -m "Select Invoices and run bulk actions from the list."
```

### Task 9: Add Payments screen

**Files:**
- Create: `src/routes/app/invoices/payments.tsx`
- Create: `src/components/add-payments.tsx`
- Modify: `src/components/invoice-bulk-bar.tsx` (Add a Payment links here)
- Modify: `src/server/payments.ts` if the loader needs a new getter

**Interfaces:**
- Consumes: `recordInvoicePayments`, `todayInTimeZone`, `MANUAL_PAYMENT_METHODS`, `formatUsd`
- Produces: route `/app/invoices/payments` with search `{ ids: string }`. The loader returns only Invoices in this Business whose stored status is `sent` or `partial`. Any other id is omitted and named in `rejected: { id, clientName }[]`.

- [ ] **Step 1: Write the failing test**

Add to `tests/invoice-bulk.test.ts`:

```ts
it("starts each row at the remaining balance and groups by Client", () => {
  const rows = paymentFormRows(
    [
      {
        id: "a",
        clientName: "Ada",
        numberLabel: "0000001",
        amountDueCents: 12000,
        status: "sent",
      },
      {
        id: "b",
        clientName: "Ada",
        numberLabel: "0000002",
        amountDueCents: 4000,
        status: "partial",
      },
      {
        id: "c",
        clientName: "Bea",
        numberLabel: "0000003",
        amountDueCents: 500,
        status: "paid",
      },
    ],
    "2026-11-11",
  );
  expect(rows.rejected.map((row) => row.id)).toEqual(["c"]);
  expect(rows.groups).toEqual([
    {
      clientName: "Ada",
      rows: [
        {
          invoiceId: "a",
          numberLabel: "0000001",
          paidOn: "2026-11-11",
          note: "",
          method: "check",
          amountCents: 12000,
        },
        {
          invoiceId: "b",
          numberLabel: "0000002",
          paidOn: "2026-11-11",
          note: "",
          method: "check",
          amountCents: 4000,
        },
      ],
    },
  ]);
});

it("copies date, note, and method onto every row and leaves amounts", () => {
  const next = applyToAll(rows, {
    paidOn: "2026-11-01",
    note: "1042",
    method: "cash",
  });
  expect(
    next.every(
      (row) =>
        row.paidOn === "2026-11-01" &&
        row.note === "1042" &&
        row.method === "cash",
    ),
  ).toBe(true);
  expect(next.map((row) => row.amountCents)).toEqual([12000, 4000]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-bulk.test.ts`
Expected: FAIL because `paymentFormRows` and `applyToAll` are not defined.

- [ ] **Step 3: Implement the form functions and the screen**

Put `paymentFormRows` and `applyToAll` in `src/lib/invoice-bulk.ts`. The loader passes `todayInTimeZone(business.timeZone)` into `paymentFormRows`. The screen title is `Add Payments` with a bold count `(n)` of included rows. Apply to all sits above the groups and does not save. Each group title is the Client name and a bold `(n)`, and the group shows a payment total that is the sum of that group's amount fields. Invoice Number is on the left. Date, notes, payment type, and amount sit together on the right; the notes field is the wide one (`min-w-80`). The footer checkbox label is `Send clients a payment notification email`, unchecked. Cancel links back to `/app/invoices`. Save parses dollars with the existing `parseDollarsToCents`, calls `recordInvoicePayments` with `notify` from the checkbox, and shows skipped Clients. Do not send the single-Payment receipt from this screen.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-bulk.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice-bulk.ts src/components/add-payments.tsx src/components/invoice-bulk-bar.tsx src/routes/app/invoices/payments.tsx src/server/payments.ts tests/invoice-bulk.test.ts
git commit -m "Record payments for the selected Invoices on one screen."
```
