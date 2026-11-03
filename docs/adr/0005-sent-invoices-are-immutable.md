# Sent invoices are immutable

Once an Invoice is Sent its lines and totals are locked; corrections mean Voiding and issuing a new Invoice. Invoice Lines are copied from Items, not referenced. This keeps records identical to what the Client saw and makes reports reproducible. Overdue is derived from the due date rather than stored.

Void stays blocked while any Payment still has an unrefunded balance. A Payment that was fully refunded does not block Void. The Invoice returns to Sent when nothing remains applied, and to Partially Paid when a refund leaves a balance below the total.
