import { describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() =>
  vi.fn(
    async (_message: {
      from?: string;
      to?: string;
      replyTo?: string;
      subject?: string;
      text?: string;
      attachments?: { filename?: string }[];
    }) => ({ data: { id: "email_1" }, error: null }),
  ),
);

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { formatFrom, sendInvoiceEmail } from "../src/lib/email";

describe("invoice email", () => {
  it("sends through Resend from the Business name, reply-to the Owner, with the PDF", async () => {
    send.mockClear();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Billing <billing@example.com>";
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    try {
      await sendInvoiceEmail({
        to: "ada@example.com",
        replyTo: "owner@example.com",
        businessName: "Ada Prints",
        number: 57,
        totalCents: 2500,
        dueDate: "2026-05-01",
        url: "https://invoice.example/p/token",
        pdf,
        reminder: false,
      });
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0]?.[0]).toMatchObject({
        from: "Ada Prints <billing@example.com>",
        to: "ada@example.com",
        replyTo: "owner@example.com",
        subject: "Invoice 0000057 from Ada Prints",
        attachments: [
          expect.objectContaining({ filename: "invoice-0000057.pdf" }),
        ],
      });
      const text = String(send.mock.calls[0]?.[0]?.text);
      expect(text).toContain("https://invoice.example/p/token");
      expect(text).toContain("$25.00");

      send.mockClear();
      await sendInvoiceEmail({
        to: "ada@example.com",
        replyTo: "owner@example.com",
        businessName: "Ada Prints",
        number: 57,
        totalCents: 2500,
        dueDate: "2026-05-01",
        url: "https://invoice.example/p/token",
        pdf,
        reminder: true,
      });
      expect(send.mock.calls[0]?.[0]?.subject).toBe(
        "Reminder: Invoice 0000057 from Ada Prints",
      );
    } finally {
      delete process.env.RESEND_API_KEY;
      process.env.EMAIL_FROM = "ovrlk invoice <test@example.com>";
    }
  });

  it("logs instead of calling Resend when the API key is missing", async () => {
    send.mockClear();
    delete process.env.RESEND_API_KEY;
    await sendInvoiceEmail({
      to: "ada@example.com",
      replyTo: "owner@example.com",
      businessName: "Ada Prints",
      number: 1,
      totalCents: 100,
      dueDate: "2026-05-01",
      url: "https://invoice.example/p/token",
      pdf: new Uint8Array([1]),
      reminder: false,
    });
    expect(send).not.toHaveBeenCalled();
    expect(formatFrom('Bad "Name"\n', "billing@example.com")).toBe(
      "Bad Name <billing@example.com>",
    );
  });
});
