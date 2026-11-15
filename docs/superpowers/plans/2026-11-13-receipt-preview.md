# Receipt drop area and preview implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain Receipt file button on the new Expense form and the Expense page with a click-or-drop area that shows a small preview of an image or PDF.

**Architecture:** `chosenReceipt` and `receiptPreview` in `src/lib/receipt-upload.ts` decide which file is kept and whether the preview is an image, a PDF, or a name only. One `ReceiptDropzone` renders that decision. The new Expense form keeps the file local until save. The Expense page uploads on choose or drop and previews a stored Receipt through the existing `receiptUrl` signed URL.

**Tech Stack:** TypeScript, React, TanStack Router, Vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-13-receipt-preview-design.md`

## Global Constraints

- Use the words in `GLOSSARY.md`. The tenant is a Business. The person who signs in is the Owner. A Client does not sign in.
- Every tenant read and write goes through `forBusiness`. This work adds no new server write.
- Money stays integer cents. Do not store the original file name, bank numbers, or card numbers.
- Receipts stay private. The stored preview uses `receiptUrl`. Do not put an object key in the page.
- Package manager is pnpm. Do not add a dependency.
- Sign-up and `/p/` rate limits are unchanged.

## Review Focus

- A file larger than 10 MB is not chosen, and the message is `File must be 10 MB or smaller.` Task 1.
- A non-image, non-PDF type is not chosen, and the message is `Receipt must be an image or PDF`. Task 1.
- Several files: only the first is judged, even when a later file would fail. Task 1.
- A missing type may still be chosen. The preview has no picture until the type is known, and the label is the file name. Task 1.
- A local file wins over a stored Receipt. A stored PDF with no local file is kind `pdf` and the label `Receipt`. Task 1.

---

### Task 1: Choose a Receipt file and describe its preview

**Files:**
- Modify: `src/lib/receipt-upload.ts`
- Test: `tests/receipt-upload.test.ts`

**Interfaces:**
- Consumes: `MAX_BYTES` (10 * 1024 * 1024) already in this file. Export nothing new about the byte limit.
- Produces:
  - `chosenReceipt<T extends { size: number; type: string }>(files: ArrayLike<T>): { ok: true; file: T } | { ok: false; message: string } | null`
  - `receiptPreview(input: { file: { name: string; type: string } | null; remoteContentType: string | null }): { kind: "image" | "pdf" | "none"; label: string | null }`
  - `uploadReceipt` returns `chosenReceipt`'s message for a single bad file instead of its own size check.

`chosenReceipt` returns `null` when `files` is empty. Otherwise it judges `files[0]` only. Size above 10 MB returns `{ ok: false, message: "File must be 10 MB or smaller." }`. A non-empty type other than `image/jpeg`, `image/png`, `image/webp`, `image/gif`, or `application/pdf` returns `{ ok: false, message: "Receipt must be an image or PDF" }`. An empty type is `{ ok: true, file }`.

`receiptPreview` uses the local file when `file` is set, ignoring `remoteContentType`. `kind` is `image` when the type starts with `image/`, `pdf` when the type is `application/pdf`, and `none` otherwise. The local label is `file.name`. With no local file and a `remoteContentType`, the label is `Receipt`. With neither, `{ kind: "none", label: null }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { chosenReceipt, receiptPreview } from "../src/lib/receipt-upload";

const jpeg = { name: "booth.jpg", size: 100, type: "image/jpeg" };

describe("chosenReceipt", () => {
  it("returns null when nothing was dropped", () => {
    expect(chosenReceipt([])).toBeNull();
  });

  it("keeps only the first file", () => {
    expect(
      chosenReceipt([
        jpeg,
        { name: "notes.txt", size: 10, type: "text/plain" },
      ]),
    ).toEqual({ ok: true, file: jpeg });
  });

  it("rejects a file over 10 MB", () => {
    expect(
      chosenReceipt([
        { name: "big.jpg", size: 10 * 1024 * 1024 + 1, type: "image/jpeg" },
      ]),
    ).toEqual({ ok: false, message: "File must be 10 MB or smaller." });
  });

  it("rejects a type that is not an image or PDF", () => {
    expect(
      chosenReceipt([{ name: "notes.txt", size: 10, type: "text/plain" }]),
    ).toEqual({ ok: false, message: "Receipt must be an image or PDF" });
  });

  it("accepts a file whose type is missing", () => {
    const file = { name: "scan", size: 100, type: "" };
    expect(chosenReceipt([file])).toEqual({ ok: true, file });
  });
});

describe("receiptPreview", () => {
  it("lets a local image win over a stored PDF", () => {
    expect(
      receiptPreview({ file: jpeg, remoteContentType: "application/pdf" }),
    ).toEqual({ kind: "image", label: "booth.jpg" });
  });

  it("labels a stored PDF as Receipt", () => {
    expect(
      receiptPreview({ file: null, remoteContentType: "application/pdf" }),
    ).toEqual({ kind: "pdf", label: "Receipt" });
  });

  it("shows the file name without a picture when the type is missing", () => {
    expect(
      receiptPreview({
        file: { name: "scan", type: "" },
        remoteContentType: "image/png",
      }),
    ).toEqual({ kind: "none", label: "scan" });
  });

  it("is empty when there is no file and no stored Receipt", () => {
    expect(receiptPreview({ file: null, remoteContentType: null })).toEqual({
      kind: "none",
      label: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/receipt-upload.test.ts`
Expected: FAIL because `chosenReceipt` and `receiptPreview` are not exported.

- [ ] **Step 3: Implement `chosenReceipt` and `receiptPreview` in `src/lib/receipt-upload.ts`**

`chosenReceipt` allows only `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, and an empty type. `receiptPreview` treats any `image/*` type as `image`. `uploadReceipt` calls `chosenReceipt([file])` and returns that message when the result is not `{ ok: true }`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/receipt-upload.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipt-upload.ts tests/receipt-upload.test.ts
git commit -m "Choose a Receipt file and describe its preview."
```

---

### Task 2: Drop area on the new Expense form and the Expense page

**Files:**
- Create: `src/components/receipt-dropzone.tsx`
- Modify: `src/components/expense-form.tsx` (the Receipt file input)
- Modify: `src/routes/app/expenses/new.tsx` (pass the chosen `file` into the form)
- Modify: `src/routes/app/expenses/$expenseId/index.tsx` (`Receipt`)

**Interfaces:**
- Consumes: `chosenReceipt`, `receiptPreview`, `RECEIPT_ACCEPT`, `uploadReceipt` from `@/lib/receipt-upload`. `receiptUrl` and `removeReceipt` from `@/server/expenses`. `expense.receiptKey` and `expense.receiptContentType` on the Expense page.
- Produces: `ReceiptDropzone({ file, remoteContentType, remoteUrl, pending, onFile }: { file: File | null; remoteContentType: string | null; remoteUrl: string | null; pending: boolean; onFile: (file: File) => void })`.

`ExpenseForm`'s `receipt` prop gains `file: File | null`. `onFile` stays `(file: File | null) => void`. `new.tsx` passes its existing `file` state. The Expense page does not pass `receipt` into `ExpenseForm`.

- [ ] **Step 1: Add `ReceiptDropzone`**

The control is a `label` around `input type="file"` with `accept={RECEIPT_ACCEPT}`. The input is visually hidden. Clicking the area opens the picker. `dragover` and `drop` call `preventDefault`. Both the input change and the drop pass the file list to `chosenReceipt`. On `{ ok: true }`, call `onFile(file)`. On `{ ok: false }`, show `message` and do not call `onFile`. On `null`, do nothing.

Empty preview (`kind` `none` and `label` null): the visible copy is `Drop a Receipt, or click to choose` and `Image or PDF, up to 10 MB.`

Otherwise call `receiptPreview({ file, remoteContentType })`. `kind` `image` renders `img` with `alt={label}` and `src` from the local object URL when `file` is set, otherwise `remoteUrl`. `kind` `pdf` renders `iframe` with `title={label}` and that same `src`. `kind` `none` with a label shows the label and no `img` or `iframe`. The preview is at most `h-40`. Create the object URL in an effect and revoke it on cleanup. A drag-over state uses `border-primary`. Disable the input while `pending`.

The Remove control is not part of this component.

- [ ] **Step 2: Use it on the new Expense form**

In `expense-form.tsx`, when `receipt.configured`, replace the file input with `ReceiptDropzone`. Pass `file={receipt.file}`, `remoteContentType={null}`, `remoteUrl={null}`, `pending`, and `onFile={receipt.onFile}`. Keep the unconfigured sentence. `new.tsx` already holds `file` and uploads it only inside `onSubmit` after `createExpense` succeeds. Do not upload from the drop area.

- [ ] **Step 3: Use it on the Expense page**

Pass `receiptKey`, `receiptContentType`, and `hasReceipt` into `Receipt`. When storage is not configured, keep the current sentence and render no drop area.

When `receiptKey` is set, load `receiptUrl` once per key and pass the URL as `remoteUrl`. Choosing a file calls `uploadReceipt`, then `router.invalidate()` on success. Until that succeeds, pass the local `File` so the preview is the file just chosen. Clear that local file after a successful upload so the stored preview takes over.

Keep View Receipt and Remove as siblings after the drop area, not inside the `label`. Remove still calls `removeReceipt` and invalidates. View Receipt still opens the signed URL in a new tab.

- [ ] **Step 4: Run the unit tests and typecheck**

Run: `pnpm exec vitest run tests/receipt-upload.test.ts && pnpm exec tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Check the pages**

With the dev server and a signed-in Owner, open New Expense and an Expense that has no Receipt. The bordered area is the control. Clicking it opens the picker. Dropping an image shows the picture and the file name. On New Expense, Save Expense is what uploads; the file is not uploaded by the drop itself. On an Expense that already has an image Receipt, the preview shows without picking a file. A stored PDF shows in a short frame labeled Receipt. Remove does not open the picker. If sign-in or storage is unavailable, say what you could not check.

- [ ] **Step 6: Commit**

```bash
git add src/components/receipt-dropzone.tsx src/components/expense-form.tsx src/routes/app/expenses/new.tsx src/routes/app/expenses/\$expenseId/index.tsx
git commit -m "Show a Receipt preview in a click-or-drop area."
```
