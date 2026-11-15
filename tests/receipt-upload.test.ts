import { describe, expect, it } from "vitest";
import { chosenReceipt, receiptPreview } from "../src/lib/receipt-upload";

const jpeg = { name: "booth.jpg", size: 100, type: "image/jpeg" };

describe("chosenReceipt", () => {
  it("returns null when nothing was dropped", () => {
    expect(chosenReceipt([])).toBeNull();
  });

  it("keeps only the first file", () => {
    expect(
      chosenReceipt([
        jpeg,
        { name: "notes.txt", size: 10, type: "text/plain" },
      ]),
    ).toEqual({ ok: true, file: jpeg });
  });

  it("rejects a file over 10 MB", () => {
    expect(
      chosenReceipt([
        {
          name: "big.jpg",
          size: 10 * 1024 * 1024 + 1,
          type: "image/jpeg",
        },
      ]),
    ).toEqual({ ok: false, message: "File must be 10 MB or smaller." });
  });

  it("rejects a type that is not an image or PDF", () => {
    expect(
      chosenReceipt([{ name: "notes.txt", size: 10, type: "text/plain" }]),
    ).toEqual({ ok: false, message: "Receipt must be an image or PDF" });
  });

  it("accepts a file whose type is missing", () => {
    const file = { name: "scan", size: 100, type: "" };
    expect(chosenReceipt([file])).toEqual({ ok: true, file });
  });
});

describe("receiptPreview", () => {
  it("lets a local image win over a stored PDF", () => {
    expect(
      receiptPreview({ file: jpeg, remoteContentType: "application/pdf" }),
    ).toEqual({ kind: "image", label: "booth.jpg" });
  });

  it("labels a stored PDF as Receipt", () => {
    expect(
      receiptPreview({ file: null, remoteContentType: "application/pdf" }),
    ).toEqual({ kind: "pdf", label: "Receipt" });
  });

  it("shows the file name without a picture when the type is missing", () => {
    expect(
      receiptPreview({
        file: { name: "scan", type: "" },
        remoteContentType: "image/png",
      }),
    ).toEqual({ kind: "none", label: "scan" });
  });

  it("is empty when there is no file and no stored Receipt", () => {
    expect(receiptPreview({ file: null, remoteContentType: null })).toEqual({
      kind: "none",
      label: null,
    });
  });
});
