# Sent invoices are immutable

Once an Invoice is Sent its lines and totals are locked; corrections mean Voiding and issuing a new Invoice. Invoice Lines are copied from Items, not referenced. This keeps records identical to what the Client saw and makes reports reproducible. Overdue is derived from the due date rather than stored.
