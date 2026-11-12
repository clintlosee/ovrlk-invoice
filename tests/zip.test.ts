import { describe, expect, it } from "vitest";
import { zipStored } from "../src/lib/zip";

describe("zip", () => {
  it("stores each file uncompressed under its own name", () => {
    const zip = zipStored([
      { name: "invoice-0000001.pdf", data: new Uint8Array([1, 2, 3]) },
      { name: "invoice-0000002.pdf", data: new Uint8Array([4, 5]) },
    ]);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("invoice-0000001.pdf");
    expect(text).toContain("invoice-0000002.pdf");
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });
});
