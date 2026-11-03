import { PDFDocument } from "pdfkit";
import {
  accentOrDefault,
  formatInvoiceNumber,
  type InvoiceSnapshot,
  type InvoiceStatus,
} from "./invoice";
import { formatUsd } from "./money";
import { formatBps } from "./tax";

/**
 * pdfkit 0.20 draws one page with the standard PDF fonts. No browser and no
 * native addon, so it runs on Node 24 on Render. The bytes come only from the
 * snapshot taken at Send.
 */
export function invoicePdfResponse(
  bytes: Uint8Array,
  filename: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(new Blob([Buffer.from(bytes)]), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      ...extra,
    },
  });
}

export function renderInvoicePdf(
  snapshot: InvoiceSnapshot,
  status: InvoiceStatus,
  logo?: Uint8Array | null,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const numberLabel = formatInvoiceNumber(snapshot.number);
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 48,
      compress: false,
      info: {
        Title: `Invoice ${numberLabel}`,
        Author: snapshot.business.name,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc, snapshot, status, numberLabel, logo ?? null);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function draw(
  doc: PDFDocument,
  snapshot: InvoiceSnapshot,
  status: InvoiceStatus,
  numberLabel: string,
  logo: Uint8Array | null,
) {
  const accent = accentOrDefault(snapshot.business.accentColor);
  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;

  doc.rect(0, 0, doc.page.width, 8).fill(accent);
  let nameX = left;
  if (logo) {
    try {
      doc.image(Buffer.from(logo), left, 24, { fit: [96, 48] });
      nameX = left + 108;
    } catch {
      nameX = left;
    }
  }
  doc.fillColor("#1c1917").font("Helvetica-Bold").fontSize(20);
  doc.text(snapshot.business.name, nameX, 28, {
    width: width * 0.62 - (nameX - left),
  });
  doc.font("Helvetica-Bold").fontSize(16).fillColor(accent);
  doc.text(`Invoice ${numberLabel}`, left, 32, { width, align: "right" });

  doc.fillColor("#44403c").font("Helvetica").fontSize(10);
  const businessLines = [
    snapshot.business.address,
    snapshot.business.taxId ? `Tax ID ${snapshot.business.taxId}` : null,
  ].filter((line): line is string => Boolean(line));
  let y = 58;
  for (const line of businessLines) {
    doc.text(line, left, y, { width: width * 0.62 });
    y = doc.y + 2;
  }
  if (status === "void") {
    doc.fillColor("#9f1239").font("Helvetica-Bold").fontSize(12);
    doc.text("VOID", left, 52, { width, align: "right" });
  }

  y = Math.max(y, 96) + 12;
  doc.fillColor("#1c1917").font("Helvetica-Bold").fontSize(10);
  doc.text("Bill to", left, y, { width: width / 2 });
  doc.text("Details", left + width / 2, y, { width: width / 2 });
  y = doc.y + 4;
  doc.font("Helvetica").fontSize(10).fillColor("#1c1917");
  const clientBlock = [
    snapshot.client.name,
    snapshot.client.email,
    snapshot.client.phone,
    snapshot.client.address,
    snapshot.client.taxExempt ? "Tax-exempt" : null,
  ].filter((line): line is string => Boolean(line));
  const detailBlock = [
    `Issued ${snapshot.issueDate}`,
    `Due ${snapshot.dueDate}`,
    snapshot.reference ? `Reference ${snapshot.reference}` : null,
  ].filter((line): line is string => Boolean(line));
  const columnTop = y;
  for (const line of clientBlock) {
    doc.text(line, left, y, { width: width / 2 - 12 });
    y = doc.y + 2;
  }
  let detailY = columnTop;
  for (const line of detailBlock) {
    doc.text(line, left + width / 2, detailY, { width: width / 2 });
    detailY = doc.y + 2;
  }
  y = Math.max(y, detailY) + 16;

  doc.strokeColor("#e6dfd2").moveTo(left, y).lineTo(right, y).stroke();
  y += 8;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#78716c");
  doc.text("Description", left, y, { width: width * 0.5 });
  doc.text("Qty", left + width * 0.5, y, {
    width: width * 0.12,
    align: "right",
  });
  doc.text("Price", left + width * 0.62, y, {
    width: width * 0.18,
    align: "right",
  });
  doc.text("Amount", left + width * 0.8, y, {
    width: width * 0.2,
    align: "right",
  });
  y = doc.y + 6;
  doc.strokeColor("#e6dfd2").moveTo(left, y).lineTo(right, y).stroke();
  y += 8;

  doc.fillColor("#1c1917").font("Helvetica").fontSize(10);
  for (const line of snapshot.lines) {
    if (y > 700) {
      doc.addPage();
      y = 48;
    }
    const description = line.description
      ? `${line.name}\n${line.description}`
      : line.name;
    doc.font("Helvetica").fillColor("#1c1917");
    doc.text(description, left, y, { width: width * 0.48 });
    const lineBottom = doc.y;
    doc.text(String(line.quantity), left + width * 0.5, y, {
      width: width * 0.12,
      align: "right",
    });
    doc.text(formatUsd(line.unitPriceCents), left + width * 0.62, y, {
      width: width * 0.18,
      align: "right",
    });
    doc.text(formatUsd(line.amountCents), left + width * 0.8, y, {
      width: width * 0.2,
      align: "right",
    });
    y = Math.max(lineBottom, doc.y) + 2;
    for (const tax of line.taxes) {
      doc.fillColor("#78716c").fontSize(9);
      doc.text(
        `${tax.name} ${formatBps(tax.rateBps)}%  ${formatUsd(tax.taxCents)}`,
        left,
        y,
        { width: width * 0.7 },
      );
      y = doc.y + 2;
      doc.fontSize(10);
    }
    y += 8;
  }

  y += 4;
  doc
    .strokeColor("#e6dfd2")
    .moveTo(left + width * 0.55, y)
    .lineTo(right, y)
    .stroke();
  y += 8;
  const totals: [string, number][] = [
    ["Subtotal", snapshot.subtotalCents],
    ["Tax", snapshot.taxCents],
    ["Total", snapshot.totalCents],
  ];
  for (const [label, amount] of totals) {
    doc
      .font(label === "Total" ? "Helvetica-Bold" : "Helvetica")
      .fillColor("#1c1917")
      .fontSize(label === "Total" ? 12 : 10);
    doc.text(label, left + width * 0.55, y, {
      width: width * 0.2,
      align: "right",
    });
    doc.text(formatUsd(amount), left + width * 0.75, y, {
      width: width * 0.25,
      align: "right",
    });
    y = doc.y + 4;
  }

  const notes = [
    snapshot.notes,
    snapshot.terms,
    snapshot.business.footer,
  ].filter((line): line is string => Boolean(line));
  if (notes.length > 0) {
    y += 16;
    doc.font("Helvetica").fontSize(9).fillColor("#44403c");
    for (const note of notes) {
      if (y > 720) {
        doc.addPage();
        y = 48;
      }
      doc.text(note, left, y, { width });
      y = doc.y + 8;
    }
  }
}
