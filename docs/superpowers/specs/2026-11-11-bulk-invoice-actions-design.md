# Bulk invoice actions

## Intent

The Owner often records a check by hand after a Client pays one or more Invoices outside the Invoice Link. Today that means opening each Invoice and recording a Payment one at a time. The same list is also where the Owner wants to email, download, mark sent, edit, or remove several Invoices without opening each one.

The invoice list gains a checkbox on every row and a Bulk Actions menu. Add a Payment opens one screen for the whole selection. The other actions run from the menu.

## Goals

- Check any Invoice, then run Edit, Send by Email, Download PDF, Mark as Sent, Add a Payment, or Delete on that selection.
- Record manual Payments for several Invoices in one save, defaulting each amount to the remaining balance and allowing a smaller amount.
- Optionally email each Client that payment was received, listing only that Client's Invoices from the save.
- Send Invoice emails for a selection: one email per Client, with the PDFs attached unless the Owner turns that off.
- Download one PDF per selected Invoice.
- Mark drafts as sent without emailing.
- Delete an Invoice and everything that belongs to it.
- Mark a draft sent only when its invoice email goes out, including send from the Invoice page and from the new-Invoice form.

## Non-goals

- Duplicate, archive, print, send reminder, or assign to a project.
- A merged PDF of several Invoices.
- A select-all checkbox.
- Changing the existing single-Invoice Payment form, including the receipt it already emails.
- Changing Void, or the draft-only delete on the Invoice page.
- Refunding a card charge in Stripe.
- A finished email template. Wording can change later. This design only fixes what the email must contain and what it must leave out.

## Anti-goals

- A Payment recorded while a paid Invoice is part of the selection.
- One Client's email mentioning another Client's Invoices.
- An Invoice removed while its Payments or card-processing fee remain in the books.
- Edit opening a paid or void Invoice.

## Who decides what

The Owner decided the behavior below. Calls marked **Builder call** were not discussed and are settled here so a plan does not reopen them.

## Invoice list

The Invoices list at `/app/invoices` keeps its current columns and totals. Every row gets a checkbox, including paid, draft, and void rows.

Checking one or more rows replaces the section heading with the count ("Selected 2") and a Bulk Actions menu:

- Edit
- Send by Email
- Download PDF
- Mark as Sent
- Add a Payment
- Delete

Client and Invoice Number stay on the left. Issued date, amount, and status sit on the right, with open space between those groups.

Gray items stay visible and do not run:

- Edit is gray unless exactly one Invoice is checked and that Invoice can still be changed. A paid or void Invoice cannot be changed. Two or more checked grays Edit.
- Add a Payment is gray if any checked Invoice is paid, draft, or void. A partly paid Invoice still has a balance, so a selection of only those stays available. One paid Invoice in the selection grays the action for the whole selection.

**Builder call:** there is no select-all control.

## Add a Payment

Choosing Add a Payment opens one screen for the checked Invoices. The title is "Add Payments" with the count in bold parentheses, as in `(2)`.

A bar at the top, "Apply to all", has payment date, internal notes, and payment type, plus Apply. Apply copies those three values onto every row. It does not change amounts and it does not save.

Invoices are grouped by Client. Each group shows the Client name, a bold count such as `(2)`, and a payment total for that Client. Inside a group, the Invoice Number sits on the left. Payment date, internal notes, payment type, and amount sit together on the right. The notes field is the wide one. A small gap separates those fields. They are not stretched across the row.

Each amount starts as that Invoice's remaining balance. The Owner can type a smaller amount. Payment type is Check, Cash, Venmo, or Other. Date defaults to today in the Business time zone.

The bottom row has the checkbox "Send clients a payment notification email", then Cancel and Save. The checkbox starts off.

Save records one manual Payment per row, through the same rules as recording a Payment on a single Invoice: integer cents, a positive amount, a real date, and a method from that list. An amount above the remaining balance is allowed and is credit on that Invoice only, which is already how a single manual Payment works. Status follows the existing rule: sent when nothing has been paid, partial when the net paid is below the total, paid when the net paid meets or exceeds the total.

The internal note is stored on the Payment. It is not shown to the Client.

When the email checkbox is on, each Client in the batch gets one email. It says payment was received and lists that Client's Invoices from this save. It does not include the internal note or the payment type. A Client with no email address is skipped and the Owner is told. The Payments are still recorded.

**Builder call:** Save is one transaction. If any row cannot be recorded, none are. **Builder call:** the email goes out after the Payments are stored. A failed email does not undo the save. The Owner is told which Clients did not get it. **Builder call:** the email may mention each Invoice's number, the amount just recorded, and any remaining balance. Exact sentences are not fixed.

Cancel returns to the list and records nothing.

## Send by Email

The menu asks once, for the whole selection, whether to attach PDFs. PDFs are included unless the Owner turns that off.

Invoices are grouped by Client.

- A Client with one Invoice in the selection gets the existing single-Invoice email: Invoice Number, amount, due date, Invoice Link, and the PDF when the attachment option is on.
- A Client with two or more gets one email listing each of those Invoices with its number, amount, and Invoice Link, plus each PDF when the option is on.
- A void Invoice is skipped.
- A draft is included only if its email goes out. Sending marks it sent (snapshot, totals, and Invoice Link) when that email succeeds. If the email fails, the Invoice stays a draft and no Invoice Link is left active. A draft with no lines is skipped, matching send today.
- An Invoice that is already sent, partly paid, or paid is emailed and its status does not change. A failed email leaves that status as it was.

Two Clients produce two emails. A Client is never sent another Client's Invoices. One Client with several drafts gets one email. That email succeeding marks all of those drafts sent. That email failing leaves all of them drafts.

**Builder call:** a Client with no email address is skipped and named to the Owner. Those drafts stay drafts. Other Clients are still emailed. The Owner is told which emails did not go out.

## Sending one Invoice

Send on the Invoice page and send from the new-Invoice form follow the same rule. A draft becomes sent, with its snapshot and Invoice Link, only when the email goes out. If the email fails, the Invoice stays a draft, no Invoice Link is left active, and the Owner is told the email did not go out.

A reminder for an Invoice that is already sent is unchanged. A failed reminder does not change its status.

## Download PDF

One click downloads every selected Invoice. Each Invoice is its own PDF, the same PDF the app already renders.

**Builder call:** the download is one zip of those PDFs, named by Invoice Number. A browser will not reliably save several files from one click. Void Invoices are included. They already render, with the void notice.

## Mark as Sent

Each checked draft is sent the way a single draft is sent: status becomes sent, the document is snapshotted, and an Invoice Link is created. No email goes out.

An Invoice that is already sent, partly paid, paid, or void is left as it is. A draft with no lines is skipped. If nothing in the selection was sent, the Owner is told that.

## Delete

Delete asks the Owner to confirm and states how many Invoices will be removed.

Confirming removes each selected Invoice and everything that belongs to it:

- Invoice Lines and their taxes
- Invoice Links, so the public URL stops working
- Payments recorded on it, including card Payments
- The processing-fee Expense created for a card Payment

The Client stays. The Invoice Number is not reused. The counter already only moves forward, so delete does not return a number.

Cash-basis and accrual reports lose that Invoice and those Payments. A card charge that already landed in the Connected Account stays there. The books no longer show the Payment or the fee.

**Builder call:** the confirm names the count and says Payments recorded on those Invoices are removed too. **Builder call:** one failure aborts the whole delete. **Builder call:** an audit entry records each removal. The draft-only delete on the Invoice page is unchanged.

## Edit

With exactly one changeable Invoice checked, Edit opens that Invoice's existing editor. Otherwise the item is gray, as described above.

## Constraints

- Tenancy stays in `forBusiness`. The Business id comes from the signed-in Owner's membership.
- Money is integer cents. Currency is USD.
- Public Invoice Links stay under `/p/` and keep the existing rate limit. This work adds no new public route.
- Package manager, runtime, and sign-up rules are unchanged.
- Use the words in `GLOSSARY.md`.

## Left to the builder

- How the menu, the send-email attachment choice, the delete confirm, and the Add Payments screen are built from the existing list and form components.
- The sentences in the new payment email and the multi-Invoice send email, within the content rules above.
- How skipped rows are told to the Owner (which Invoices, in the page or in a message).
