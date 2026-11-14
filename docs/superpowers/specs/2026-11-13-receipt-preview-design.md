# Receipt drop area and preview

## Intent

The Owner attaches a Receipt on an Expense. The browser's plain file button is easy to miss. After a Receipt is chosen or already stored, the Owner should see a small preview of it.

## Goals

- On the new Expense form and the Expense page, one bordered area accepts a click (opens the file picker) or a drop.
- Empty, the area reads "Drop a Receipt, or click to choose" and "Image or PDF, up to 10 MB."
- After a file is chosen, or when the Expense already has a Receipt, that area shows a small preview: the picture for an image, the PDF in a short frame.
- Click or drop on that area still replaces the Receipt.
- A file chosen on a new Expense stays local until Save Expense, which uploads it as today.
- On an existing Expense, a chosen or dropped file uploads immediately.

## Non-goals

- The Expenses list and its Attach Receipt link.
- A new upload library or a new storage path.
- Storing the original file name. A stored Receipt is labeled "Receipt". A file chosen in this session shows its name.
- Changing who may upload, the 10 MB limit, or the allowed types (JPEG, PNG, WebP, GIF, PDF).

## Anti-goals

- Uploading a new Expense's Receipt before the Expense is saved.
- Opening the file picker when the Owner clicks Remove.

## Constraints

- Receipts stay private in R2. The preview of a stored Receipt uses the existing signed URL from `receiptUrl`.
- Money, tenancy, and sign-up rules are unchanged.
- Use the words in `GLOSSARY.md`.

## Approaches

1. **Native file input inside a drop area.** A label wraps `input type="file"`. Drag events on that label take the first file. Chosen because nothing in the app is a file picker, and the browser already opens the picker and accepts a drop.
2. **Leave the plain file button and add a thumbnail beside it.** Rejected. The button stays easy to miss, which is the reason for the change.
3. **Add a dropzone package.** The Owner said a file-picker component would be fine. Rejected. None is installed, and a package would repeat the native input.

The Owner approved approach 1 and allowed a component. Approach 1 is the one to build.

## Decisions

- The drop area is shared by the new Expense form and the Expense page. The list row is unchanged.
- A local file wins over a stored Receipt in the preview, so a replacement shows before the upload finishes.
- An image uses `img`. A PDF uses a short `iframe`. A file whose type is missing still may be chosen; the server sniffs the bytes, and the preview shows the name without a picture until the type is known.
- Several files: only the first is used.
- Remove stays a separate button on the Expense page, outside the file label. View Receipt stays under a stored preview.
- Client checks use the messages already returned for a bad upload: "File must be 10 MB or smaller." and "Receipt must be an image or PDF".

## Left to the builder

- Border, spacing, and drag-over styling, using the existing card and border colors.
- When to refresh the signed URL after a successful replace (the URL lasts five minutes).
