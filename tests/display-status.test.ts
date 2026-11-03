import { describe, expect, it } from "vitest";
import {
  deriveDisplayStatus,
  type InvoiceDisplayInput,
} from "../src/lib/invoice";

/** 2026-04-01 05:30 UTC is still 2026-03-31 in Denver and already 2026-04-01 in UTC. */
const NOW = new Date("2026-04-01T05:30:00.000Z");

function invoice(
  patch: Partial<InvoiceDisplayInput> = {},
): InvoiceDisplayInput {
  return {
    status: "sent",
    dueDate: "2026-04-08",
    totalCents: 1000,
    paidCents: 0,
    viewed: false,
    ...patch,
  };
}

function show(
  patch: Partial<InvoiceDisplayInput> = {},
  timeZone = "America/Denver",
) {
  return deriveDisplayStatus(invoice(patch), NOW, timeZone);
}

describe("deriveDisplayStatus", () => {
  it("uses day boundaries in the Business time zone across the Denver/UTC midnight", () => {
    expect(show({ dueDate: "2026-04-07" })).toBe("due-soon");
    expect(show({ dueDate: "2026-04-08" })).toBe("sent");
    expect(show({ dueDate: "2026-03-31" })).toBe("due-soon");
    expect(show({ dueDate: "2026-03-30" })).toBe("overdue");

    expect(show({ dueDate: "2026-04-08" }, "UTC")).toBe("due-soon");
    expect(show({ dueDate: "2026-04-09" }, "UTC")).toBe("sent");
    expect(show({ dueDate: "2026-04-01" }, "UTC")).toBe("due-soon");
    expect(show({ dueDate: "2026-03-31" }, "UTC")).toBe("overdue");
  });

  it("marks due soon and overdue for sent, viewed, and partial when a balance is owed", () => {
    for (const viewed of [false, true]) {
      expect(show({ dueDate: "2026-04-07", viewed })).toBe("due-soon");
      expect(show({ dueDate: "2026-03-31", viewed })).toBe("due-soon");
      expect(show({ dueDate: "2026-03-30", viewed })).toBe("overdue");
    }
    expect(show({ dueDate: "2026-04-08", viewed: true })).toBe("viewed");
    expect(show({ dueDate: "2026-04-08" })).toBe("sent");
    expect(
      show({ status: "partial", paidCents: 400, dueDate: "2026-04-07" }),
    ).toBe("due-soon");
    expect(
      show({
        status: "partial",
        paidCents: 400,
        dueDate: "2026-03-30",
        viewed: true,
      }),
    ).toBe("overdue");
    expect(
      show({
        status: "partial",
        paidCents: 400,
        dueDate: "2026-04-08",
        viewed: true,
      }),
    ).toBe("partial");
  });

  it("lets void and draft beat a credit, a view, and a past due date", () => {
    const loud = {
      dueDate: "2026-03-30",
      paidCents: 5000,
      viewed: true,
    };
    expect(show({ status: "void", ...loud })).toBe("void");
    expect(show({ status: "draft", ...loud })).toBe("draft");
  });

  it("shows overpaid when there is a credit and paid when the Invoice is fully paid", () => {
    expect(
      show({
        status: "paid",
        paidCents: 1000,
        dueDate: "2026-03-30",
        viewed: true,
      }),
    ).toBe("paid");
    expect(
      show({
        status: "paid",
        paidCents: 1500,
        dueDate: "2026-03-30",
        viewed: true,
      }),
    ).toBe("overpaid");
    expect(
      show({ status: "sent", paidCents: 1500, dueDate: "2026-03-30" }),
    ).toBe("overpaid");
    expect(
      show({
        status: "partial",
        paidCents: 1500,
        dueDate: "2026-03-30",
        viewed: true,
      }),
    ).toBe("overpaid");
  });

  it("does not call an open Invoice overdue or due soon when nothing is owed", () => {
    expect(show({ paidCents: 1000, dueDate: "2026-03-30" })).toBe("sent");
    expect(show({ paidCents: 1000, dueDate: "2026-03-30", viewed: true })).toBe(
      "viewed",
    );
    expect(
      show({ status: "partial", paidCents: 1000, dueDate: "2026-03-30" }),
    ).toBe("partial");
  });
});
