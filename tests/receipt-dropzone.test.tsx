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
    expect(html).toContain("Add a Receipt");
    expect(html).toContain("select a file");
    expect(html).toContain("Image or PDF, up to 10 MB.");
    expect(html).toContain('type="file"');
  });

  it("names a stored PDF while the preview loads", () => {
    const html = markup({
      remoteContentType: "application/pdf",
      remoteUrl: "/app/expenses/exp/receipt",
    });
    expect(html).toContain('data-receipt-kind="pdf"');
    expect(html).toContain("Receipt");
    expect(html).toContain("Open");
    expect(html).toContain('href="/app/expenses/exp/receipt"');
    expect(html).not.toContain("Add a Receipt");
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
