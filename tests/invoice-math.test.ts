import { describe, expect, it } from "vitest";
import {
  amountDueCents,
  displayStatus,
  priceInvoice,
} from "../src/lib/invoice";
import { renderInvoicePdf } from "../src/lib/invoice-pdf";

describe("invoice math", () => {
  it("rounds each Tax Rate on the line and zeroes tax for an exempt Client", () => {
    const priced = priceInvoice({
      taxExempt: false,
      lines: [
        {
          name: "Print",
          description: null,
          quantity: 3,
          unitPriceCents: 1000,
          taxes: [
            { id: "utah", name: "Utah", rateBps: 725 },
            { id: "city", name: "City", rateBps: 100 },
          ],
        },
        {
          name: "Fee",
          description: null,
          quantity: 1,
          unitPriceCents: 50,
          taxes: [{ id: "utah", name: "Utah", rateBps: 725 }],
        },
        {
          name: "Half cent",
          description: null,
          quantity: 1,
          unitPriceCents: 1,
          taxes: [{ id: "half", name: "Half", rateBps: 5000 }],
        },
      ],
    });
    expect(priced.lines.map((line) => line.amountCents)).toEqual([3000, 50, 1]);
    expect(priced.lines[0]?.taxes.map((tax) => tax.taxCents)).toEqual([
      218, 30,
    ]);
    expect(priced.lines[1]?.taxCents).toBe(4);
    expect(priced.lines[2]?.taxCents).toBe(1);
    expect(priced.subtotalCents).toBe(3051);
    expect(priced.taxCents).toBe(253);
    expect(priced.totalCents).toBe(3304);

    const exempt = priceInvoice({
      taxExempt: true,
      lines: [
        {
          name: "Print",
          description: null,
          quantity: 3,
          unitPriceCents: 1000,
          taxes: [
            { id: "utah", name: "Utah", rateBps: 725 },
            { id: "city", name: "City", rateBps: 100 },
          ],
        },
      ],
    });
    expect(exempt.taxCents).toBe(0);
    expect(exempt.totalCents).toBe(3000);
    expect(exempt.lines[0]?.taxes.map((tax) => tax.taxCents)).toEqual([0, 0]);

    expect(displayStatus("sent", "2020-01-01", "2026-01-02")).toBe("overdue");
    expect(displayStatus("draft", "2020-01-01", "2026-01-02")).toBe("draft");
    expect(displayStatus("paid", "2020-01-01", "2026-01-02")).toBe("paid");
    expect(displayStatus("void", "2020-01-01", "2026-01-02")).toBe("void");
    expect(displayStatus("sent", "2026-02-01", "2026-01-02")).toBe("sent");
    expect(amountDueCents("sent", 3304)).toBe(3304);
    expect(amountDueCents("paid", 3304)).toBe(0);
    expect(amountDueCents("void", 3304)).toBe(0);

    expect(() =>
      priceInvoice({
        taxExempt: false,
        lines: [
          {
            name: "Bad",
            description: null,
            quantity: 1.5,
            unitPriceCents: 100,
            taxes: [],
          },
        ],
      }),
    ).toThrow(/whole number/);
  });

  it("writes a PDF from the snapshot", async () => {
    const pdf = Buffer.from(
      await renderInvoicePdf(
        {
          number: 7,
          currency: "USD",
          issueDate: "2026-04-01",
          dueDate: "2026-05-01",
          reference: "PO-9",
          notes: "Thanks",
          terms: "Due on receipt",
          client: {
            name: "Ada Prints",
            email: "ada@example.com",
            phone: null,
            address: "1 Main",
            taxExempt: false,
          },
          business: {
            name: "Catalog Prints",
            address: "9 Studio",
            taxId: "12-345",
            footer: "Thank you",
            accentColor: "#1c1917",
          },
          lines: [
            {
              name: "8x10",
              description: "Matte",
              quantity: 2,
              unitPriceCents: 2500,
              amountCents: 5000,
              taxCents: 363,
              taxes: [{ name: "Utah", rateBps: 725, taxCents: 363 }],
            },
          ],
          subtotalCents: 5000,
          taxCents: 363,
          totalCents: 5363,
        },
        "void",
      ),
    );
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("(Invoice 0000007)");
    expect(text).toContain("(Catalog Prints)");
    expect(text).toContain("38783130");
    expect(text).toContain("0.6235294117647059");
  });
});
