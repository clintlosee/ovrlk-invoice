import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import {
  type ClientListClient,
  clientListView,
  clientMark,
  filterClientRows,
  toClientListInvoice,
} from "../src/lib/client-list";
import { cents } from "../src/lib/money";
import type { InvoiceInput } from "../src/server/invoice-store";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

const ada = {
  id: "ada",
  name: "Ada Prints",
  email: "ada@example.com",
  taxExempt: true,
  note: "Cert 44",
  archived: false,
};
const bea = {
  id: "bea",
  name: "Bea Frames",
  email: "bea@example.com",
  taxExempt: false,
  note: "",
  archived: false,
};
const cara = {
  id: "cara",
  name: "Cara Studio",
  email: "cara@example.com",
  taxExempt: false,
  note: "",
  archived: false,
};
const dee = {
  id: "dee",
  name: "Dee Quiet",
  email: "dee@example.com",
  taxExempt: false,
  note: "",
  archived: false,
};
const fay = {
  id: "fay",
  name: "Fay Gallery",
  email: "fay@example.com",
  taxExempt: false,
  note: "",
  archived: false,
};
const eli = {
  id: "eli",
  name: "Eli Old",
  email: "eli@example.com",
  taxExempt: false,
  note: "Former",
  archived: true,
};

const clients = [fay, eli, dee, cara, bea, ada];

const invoices = [
  {
    clientId: "ada",
    displayStatus: "paid" as const,
    amountDueCents: 0,
    totalCents: 10000,
    sentAt: "2026-03-01T15:00:00.000Z",
  },
  {
    clientId: "ada",
    displayStatus: "draft" as const,
    amountDueCents: 5000,
    totalCents: 5000,
    sentAt: null,
  },
  {
    clientId: "bea",
    displayStatus: "sent" as const,
    amountDueCents: 20000,
    totalCents: 20000,
    sentAt: "2026-04-02T15:00:00.000Z",
  },
  {
    clientId: "bea",
    displayStatus: "void" as const,
    amountDueCents: 0,
    totalCents: 30000,
    sentAt: "2026-05-01T15:00:00.000Z",
  },
  {
    clientId: "cara",
    displayStatus: "overdue" as const,
    amountDueCents: 4000,
    totalCents: 4000,
    sentAt: "2026-03-20T15:00:00.000Z",
  },
  {
    clientId: "dee",
    displayStatus: "draft" as const,
    amountDueCents: 900,
    totalCents: 900,
    sentAt: null,
  },
  {
    clientId: "fay",
    displayStatus: "paid" as const,
    amountDueCents: 0,
    totalCents: 100,
    sentAt: "2026-02-01T15:00:00.000Z",
  },
  {
    clientId: "eli",
    displayStatus: "sent" as const,
    amountDueCents: 7000,
    totalCents: 7000,
    sentAt: "2026-06-01T15:00:00.000Z",
  },
];

describe("client list", () => {
  it("orders recently active by the newest sent invoice and skips drafts and voids", () => {
    const view = clientListView(clients, invoices);
    expect(view.recent.map((client) => client.id)).toEqual([
      "bea",
      "cara",
      "ada",
    ]);
  });

  it("shows at most three recently active clients", () => {
    const view = clientListView(clients, invoices);
    expect(view.recent).toHaveLength(3);
    expect(view.recent.map((client) => client.id)).not.toContain("fay");
  });

  it("totals overdue, outstanding, and draft from invoice balances", () => {
    const view = clientListView(clients, invoices);
    expect(view.overdueCents).toBe(4000);
    expect(view.outstandingCents).toBe(31000);
    expect(view.draftCents).toBe(5900);
  });

  it("lists each active client's outstanding balance by name", () => {
    const view = clientListView(clients, invoices);
    expect(
      view.rows.map((row) => [row.id, row.outstandingCents, row.taxExempt]),
    ).toEqual([
      ["ada", 0, true],
      ["bea", 20000, false],
      ["cara", 4000, false],
      ["dee", 0, false],
      ["fay", 0, false],
    ]);
  });

  it("keeps an archived client off the list and in the totals", () => {
    const view = clientListView(clients, invoices);
    expect(view.rows.map((row) => row.id)).not.toContain("eli");
    expect(view.recent.map((client) => client.id)).not.toContain("eli");
    expect(view.archived.map((row) => [row.id, row.outstandingCents])).toEqual([
      ["eli", 7000],
    ]);
    expect(view.outstandingCents).toBe(31000);
  });

  it("matches a search against name, email, or note", () => {
    const view = clientListView(clients, invoices);
    expect(filterClientRows(view.rows, "cert").map((row) => row.id)).toEqual([
      "ada",
    ]);
    expect(filterClientRows(view.rows, "GALLERY").map((row) => row.id)).toEqual(
      ["fay"],
    );
    expect(filterClientRows(view.rows, "nope")).toEqual([]);
  });
});

describe("client list from saved invoices", () => {
  it("ranks a client by the invoice that was sent", async () => {
    const db = getDb();
    const owner = await insertOwner("client-list@example.com", "Client List");
    const scope = forBusiness(db, owner.businessId);
    const ada = await scope.clients.create({
      name: "Ada Prints",
      email: "ada-list@example.com",
      phone: null,
      address: null,
      taxExempt: false,
      note: null,
    });
    const bea = await scope.clients.create({
      name: "Bea Frames",
      email: "bea-list@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: "Cert 44",
    });
    await scope.invoices.create(savedInvoice(ada.id, 8000));
    const draft = await scope.invoices.create(savedInvoice(bea.id, 20000));
    const sent = await scope.invoices.send(draft.id, owner.userId);
    if (!sent) throw new Error("send");

    const view = clientListView(
      (await scope.clients.list()).map(listedClient),
      (await scope.invoices.list()).map((invoice) =>
        toClientListInvoice({
          clientId: invoice.clientId,
          displayStatus: invoice.displayStatus,
          amountDueCents: invoice.amountDueCents,
          totalCents: invoice.document.totalCents,
          sentAt: invoice.sentAt,
        }),
      ),
    );

    expect(view.recent.map((client) => client.id)).toEqual([bea.id]);
    expect(view.rows.map((row) => [row.name, row.outstandingCents])).toEqual([
      ["Ada Prints", 0],
      ["Bea Frames", 20000],
    ]);
    expect(view.outstandingCents).toBe(20000);
    expect(view.draftCents).toBe(8000);
  });
});

function listedClient(row: {
  id: string;
  name: string;
  email: string;
  taxExempt: boolean;
  note: string | null;
  archivedAt: Date | null;
}): ClientListClient {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    taxExempt: row.taxExempt,
    note: row.note ?? "",
    archived: row.archivedAt != null,
  };
}

function savedInvoice(clientId: string, unitPriceCents: number): InvoiceInput {
  return {
    clientId,
    issueDate: "2026-04-01",
    dueDate: "2026-04-15",
    reference: null,
    notes: null,
    terms: null,
    lines: [
      {
        name: "Print",
        description: null,
        quantity: 1,
        unitPriceCents: cents(unitPriceCents),
        taxRateIds: [],
      },
    ],
  };
}

describe("client mark", () => {
  it("uses the first and last word on a card", () => {
    expect(clientMark("Daniel Mirci")).toBe("DM");
    expect(clientMark("Alpine Art & Frame")).toBe("AF");
    expect(clientMark("A")).toBe("A");
  });
});
