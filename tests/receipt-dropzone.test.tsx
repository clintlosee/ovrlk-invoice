import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptDropzone } from "../src/components/receipt-dropzone";

function markup(
  props: Partial<{
    file: File | null;
    remoteContentType: string | null;
    remoteUrl: string | null;
  }>,
) {
  return renderToStaticMarkup(
    createElement(ReceiptDropzone, {
      file: null,
      remoteContentType: null,
      remoteUrl: null,
      pending: false,
      onFile: () => undefined,
      ...props,
    }),
  );
}

describe("ReceiptDropzone", () => {
  it("renders a file input inside the drop copy", () => {
    const html = markup({});
    expect(html).toContain("Drop a Receipt, or click to choose");
    expect(html).toContain("Image or PDF, up to 10 MB.");
    expect(html).toContain('type="file"');
  });

  it("shows a stored PDF in a frame labeled Receipt", () => {
    const html = markup({
      remoteContentType: "application/pdf",
      remoteUrl: "https://example.test/receipt.pdf",
    });
    expect(html).toContain("<iframe");
    expect(html).toContain('title="Receipt"');
    expect(html).not.toContain("Drop a Receipt, or click to choose");
  });

  it("shows a stored image", () => {
    const html = markup({
      remoteContentType: "image/jpeg",
      remoteUrl: "https://example.test/booth.jpg",
    });
    expect(html).toContain("<img");
    expect(html).toContain('alt="Receipt"');
    expect(html).toContain('src="https://example.test/booth.jpg"');
  });
});
