# Sent invoices stay editable until paid

A Sent or Partially Paid Invoice can be edited. Saving rewrites its lines, totals, and the snapshot the Client and the PDF use. A Paid Invoice, including one that shows Overpaid, cannot be changed. A Void Invoice cannot be changed. Invoice Lines are copied from Items, not referenced. Overdue is derived from the due date rather than stored.

Editing the total below what is already paid marks the Invoice Paid and keeps the extra as credit.

Void stays blocked while any Payment still has an unrefunded balance. A Payment that was fully refunded does not block Void. The Invoice returns to Sent when nothing remains applied, and to Partially Paid when a refund leaves a balance below the total.
