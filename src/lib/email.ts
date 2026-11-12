import { Resend } from "resend";
import { isProduction } from "./config";
import { formatInvoiceNumber, paymentMethodLabel } from "./invoice";
import { formatUsd } from "./money";

type CapturedEmail = { to: string; code: string };

const inbox: CapturedEmail[] = [];

export function takeEmails(): CapturedEmail[] {
  return inbox.splice(0, inbox.length);
}

export type Outbound = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  fromName?: string;
  attachments?: { filename: string; content: Buffer | Uint8Array }[];
  /** Sign-in codes are captured so tests can read them when Resend is not configured. */
  captureCode?: string;
};

export function formatFrom(name: string, emailFrom: string): string {
  const address = /<([^>]+)>/.exec(emailFrom)?.[1]?.trim() ?? emailFrom.trim();
  const safe =
    name
      .replace(/[\r\n<>"]/g, "")
      .trim()
      .slice(0, 200) || "Invoice";
  return `${safe} <${address}>`;
}

export async function deliverEmail(message: Outbound): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (message.captureCode) {
      inbox.push({ to: message.to, code: message.captureCode });
    }
    if (process.env.VITEST !== "1" && !isProduction()) {
      console.info(
        message.captureCode
          ? `Sign-in code for ${message.to}: ${message.captureCode}`
          : `Email to ${message.to}: ${message.subject}\n${message.text}`,
      );
    }
    if (isProduction()) throw new Error("RESEND_API_KEY is not set");
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: message.fromName ? formatFrom(message.fromName, from) : from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    replyTo: message.replyTo,
    attachments: message.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: "application/pdf",
    })),
  });
  if (error) throw new Error("Could not send the email");
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await deliverEmail({
    to,
    subject: "Your ovrlk-invoice sign-in code",
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not try to sign in, you can ignore this email.`,
    captureCode: code,
  });
}

export async function sendInvoiceEmail(input: {
  to: string;
  replyTo: string;
  businessName: string;
  number: number;
  totalCents: number;
  dueDate: string;
  url: string;
  pdf?: Uint8Array;
  reminder: boolean;
  deliver?: (message: Outbound) => Promise<void>;
}): Promise<void> {
  const numberLabel = formatInvoiceNumber(input.number);
  const amount = formatUsd(input.totalCents);
  const subject = input.reminder
    ? `Reminder: Invoice ${numberLabel} from ${input.businessName}`
    : `Invoice ${numberLabel} from ${input.businessName}`;
  const intro = input.reminder
    ? `${input.businessName} is sending a reminder for invoice ${numberLabel}.`
    : `${input.businessName} sent you invoice ${numberLabel}.`;
  const attached = input.pdf ? "\n\nThe PDF is attached." : "";
  const send = input.deliver ?? deliverEmail;
  await send({
    to: input.to,
    replyTo: input.replyTo,
    fromName: input.businessName,
    subject,
    text: `${intro}\n\nAmount due: ${amount}\nDue: ${input.dueDate}\n\nView the invoice: ${input.url}${attached}`,
    attachments: input.pdf
      ? [{ filename: `invoice-${numberLabel}.pdf`, content: input.pdf }]
      : undefined,
  });
}

export async function sendInvoiceListEmail(input: {
  to: string;
  replyTo: string;
  businessName: string;
  invoices: {
    number: number;
    totalCents: number;
    dueDate: string;
    url: string;
  }[];
  pdfs: { filename: string; content: Buffer | Uint8Array }[];
  deliver?: (message: Outbound) => Promise<void>;
}): Promise<void> {
  const blocks = input.invoices.map((item) => {
    const numberLabel = formatInvoiceNumber(item.number);
    return `Invoice ${numberLabel}\nAmount due: ${formatUsd(item.totalCents)}\nDue: ${item.dueDate}\n\nView the invoice: ${item.url}`;
  });
  const attached = input.pdfs.length > 0 ? "\n\nThe PDFs are attached." : "";
  const send = input.deliver ?? deliverEmail;
  await send({
    to: input.to,
    replyTo: input.replyTo,
    fromName: input.businessName,
    subject: `Invoices from ${input.businessName}`,
    text: `${input.businessName} sent you invoices.\n\n${blocks.join("\n\n")}${attached}`,
    attachments:
      input.pdfs.length > 0
        ? input.pdfs.map((file) => ({
            filename: file.filename,
            content: file.content,
          }))
        : undefined,
  });
}

export async function sendPaymentReceivedEmail(input: {
  to: string;
  replyTo?: string;
  businessName: string;
  invoices: {
    number: number;
    amountCents: number;
    balanceCents: number;
  }[];
  deliver?: (message: Outbound) => Promise<void>;
}): Promise<void> {
  const blocks = input.invoices.map((item) => {
    const numberLabel = formatInvoiceNumber(item.number);
    const amount = formatUsd(item.amountCents);
    const balance =
      item.balanceCents > 0
        ? `Balance due: ${formatUsd(item.balanceCents)}`
        : "This invoice is paid.";
    return `Invoice ${numberLabel}: ${amount}\n${balance}`;
  });
  const send = input.deliver ?? deliverEmail;
  await send({
    to: input.to,
    replyTo: input.replyTo,
    fromName: input.businessName,
    subject: `Payment received from ${input.businessName}`,
    text: `${input.businessName} received payment.\n\n${blocks.join("\n\n")}`,
  });
}

export async function sendReceiptEmail(input: {
  to: string;
  replyTo?: string;
  businessName: string;
  number: number;
  amountCents: number;
  paidOn: string;
  method: string;
  balanceCents: number;
}): Promise<void> {
  const numberLabel = formatInvoiceNumber(input.number);
  const balance =
    input.balanceCents > 0
      ? `Balance due: ${formatUsd(input.balanceCents)}`
      : "This invoice is paid.";
  await deliverEmail({
    to: input.to,
    replyTo: input.replyTo,
    fromName: input.businessName,
    subject: `Receipt for invoice ${numberLabel}`,
    text: `${input.businessName} received ${formatUsd(input.amountCents)} by ${paymentMethodLabel(input.method).toLowerCase()} on ${input.paidOn} for invoice ${numberLabel}.\n\n${balance}`,
  });
}
