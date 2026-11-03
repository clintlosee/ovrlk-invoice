import { cva } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePlus,
  Clock,
  Eye,
  FilePen,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type InvoiceDisplayStatus, statusLabel } from "@/lib/invoice";

export type InvoiceBadgeStatus = InvoiceDisplayStatus | "due-soon";

const statusClass = cva("border-transparent", {
  variants: {
    status: {
      paid: "bg-status-paid-bg text-status-paid-foreground",
      sent: "bg-status-sent-bg text-status-sent-foreground",
      viewed: "bg-status-viewed-bg text-status-viewed-foreground",
      "due-soon": "bg-status-due-soon-bg text-status-due-soon-foreground",
      overdue: "bg-status-overdue-bg text-status-overdue-foreground",
      draft: "bg-status-draft-bg text-status-draft-foreground",
      partial: "bg-status-partial-bg text-status-partial-foreground",
      void: "bg-status-void-bg text-status-void-foreground",
      overpaid: "bg-status-paid-bg text-status-paid-foreground",
    },
  },
});

const ICONS: Record<InvoiceBadgeStatus, LucideIcon> = {
  paid: CircleCheck,
  sent: Send,
  viewed: Eye,
  "due-soon": Clock,
  overdue: CircleAlert,
  draft: FilePen,
  partial: CircleDashed,
  void: Ban,
  overpaid: CirclePlus,
};

function label(status: InvoiceBadgeStatus): string {
  if (status === "due-soon") return "Due soon";
  return statusLabel(status);
}

export function InvoiceStatusBadge({ status }: { status: InvoiceBadgeStatus }) {
  const Icon = ICONS[status];
  return (
    <Badge className={statusClass({ status })}>
      <Icon aria-hidden className="size-3.5" />
      {label(status)}
    </Badge>
  );
}
