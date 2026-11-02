# ovrlk-invoice

Invoicing, expense tracking, and reporting for small businesses, starting with one owner (a photography print business) and built to host many businesses later.

## Tenancy and people

**Business**:
The tenant: one company whose clients, invoices, expenses, and settings are walled off from every other business.
_Avoid_: Organization, account, workspace, company

**Owner**:
The person who signs in and runs a Business. v1 has exactly one per Business.
_Avoid_: Admin, user (when meaning the owner)

**Member**:
A person with a role in a Business. Modeled now; only the Owner role exists in v1.
_Avoid_: Teammate, staff

**Client**:
A person or company a Business bills. Clients never sign in.
_Avoid_: Customer, contact, account

## Billing

**Item**:
A saved product or service with a default price and default Tax Rates, used to fill Invoice Lines.
_Avoid_: Product, SKU, service

**Tax Rate**:
A named, saved percentage (e.g. Utah sales tax) applied to individual Invoice Lines.
_Avoid_: Tax, VAT

**Tax-Exempt Client**:
A Client whose new Invoice Lines default to no Tax Rate.

**Invoice**:
A numbered request for payment from a Business to one Client. Locked once Sent; corrected only by Voiding and reissuing.
_Avoid_: Bill, statement

**Invoice Line**:
One row on an Invoice: description, quantity, unit price, Tax Rates. Copied from an Item but independent of it afterward.
_Avoid_: Line item, row

**Invoice Number**:
A sequential number unique within a Business (e.g. 0000571).

**Reference**:
A free-text field on an Invoice for the Client's PO number or similar.
_Avoid_: PO, memo

**Invoice Link**:
The long, unguessable, expiring URL a Client uses to view and pay an Invoice without signing in.
_Avoid_: Portal, client login

**Payment**:
Money received against one Invoice, either via Stripe or recorded manually (check, cash, Venmo). An Invoice can have several.
_Avoid_: Transaction, receipt

**Void**:
The terminal state of an Invoice that was withdrawn; it stays on record but counts for nothing.
_Avoid_: Delete, cancel

**Overdue**:
Derived, never stored: an unpaid, non-void Invoice past its due date.

## Expenses and reporting

**Expense**:
Money the Business spent, with a date, merchant, Category, amount, optional tax paid, optional Client, and optional Receipt.
_Avoid_: Bill, cost, purchase

**Category**:
An Expense classification. Defaults follow IRS Schedule C, with a separate Cost of Goods Sold group.

**Cost of Goods Sold (COGS)**:
The Category group for direct costs of what was sold (printing, framing, materials, shipping to Clients).

**Merchant Fee**:
An Expense auto-created from a Stripe Payment's processing fee.

**Receipt**:
An image or PDF attached to an Expense, stored privately.

**Cash Basis**:
Reporting income on the date Payments arrive and expenses on their Expense date. The Owner's primary view.

**Accrual Basis**:
Reporting income on the Invoice date regardless of payment. Also called invoice-based.

**Connected Account**:
A Business's own Stripe account linked through Stripe Connect; Payments land there directly.
