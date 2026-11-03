import type { ReactNode } from "react";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InvoiceDisplayStatus } from "@/lib/invoice";

const STATUSES: InvoiceDisplayStatus[] = [
  "paid",
  "sent",
  "viewed",
  "due-soon",
  "overdue",
  "draft",
  "partial",
  "void",
  "overpaid",
];

const SWATCHES = [
  ["background", "bg-background text-foreground"],
  ["foreground", "bg-foreground text-background"],
  ["card", "bg-card text-card-foreground"],
  ["popover", "bg-popover text-popover-foreground"],
  ["primary", "bg-primary text-primary-foreground"],
  ["primary-hover", "bg-primary-hover text-primary-foreground"],
  ["secondary", "bg-secondary text-secondary-foreground"],
  ["muted", "bg-muted text-muted-foreground"],
  ["accent", "bg-accent text-accent-foreground"],
  ["destructive", "bg-destructive text-destructive-foreground"],
  ["brass", "bg-brass text-brass-foreground"],
  ["border", "border-2 border-border bg-background text-foreground"],
  ["input", "border-2 border-input bg-background text-foreground"],
  ["ring", "border-2 border-ring bg-background text-foreground"],
] as const;

export function StyleguideSamples() {
  return (
    <div className="mt-8 grid gap-8">
      <Mode title="Light" className="light bg-background text-foreground">
        <Samples />
      </Mode>
      <Mode title="Dark" className="dark bg-background text-foreground">
        <Samples />
      </Mode>
    </div>
  );
}

function Mode({
  title,
  className,
  children,
}: {
  title: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <section className={`${className} rounded-lg border border-border p-6`}>
      <h2 className="font-serif text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Samples() {
  return (
    <div className="mt-6 space-y-8">
      <TokenGrid />
      <ButtonRow />
      <CardSample />
      <BadgeRow />
      <StatusRow />
      <TableSample />
    </div>
  );
}

function TokenGrid() {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {SWATCHES.map(([name, className]) => (
        <li
          key={name}
          className={`${className} rounded-md border border-border px-3 py-2 text-sm`}
        >
          {name}
        </li>
      ))}
    </ul>
  );
}

function ButtonRow() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
    </div>
  );
}

function CardSample() {
  return (
    <Card>
      <Label htmlFor="styleguide-email">Email</Label>
      <Input
        id="styleguide-email"
        className="mt-2"
        placeholder="ada@example.com"
      />
    </Card>
  );
}

function BadgeRow() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">Destructive</Badge>
    </div>
  );
}

function StatusRow() {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUSES.map((status) => (
        <InvoiceStatusBadge key={status} status={status} />
      ))}
    </div>
  );
}

function TableSample() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>0000571</TableCell>
          <TableCell>North Studio</TableCell>
          <TableCell>
            <InvoiceStatusBadge status="paid" />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>0000572</TableCell>
          <TableCell>Harbor Prints</TableCell>
          <TableCell>
            <InvoiceStatusBadge status="draft" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
