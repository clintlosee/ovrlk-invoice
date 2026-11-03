declare module "pdfkit" {
  interface PDFDocumentOptions {
    size?: string;
    margin?: number;
    compress?: boolean;
    info?: { Title?: string; Author?: string };
  }

  interface PDFTextOptions {
    width?: number;
    align?: "left" | "right" | "center";
    lineGap?: number;
  }

  export class PDFDocument {
    constructor(options?: PDFDocumentOptions);
    x: number;
    y: number;
    page: { width: number; height: number };
    end(): void;
    addPage(): this;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    text(text: string, x?: number, y?: number, options?: PDFTextOptions): this;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    rect(x: number, y: number, w: number, h: number): this;
    fill(color?: string): this;
    on(event: "data", listener: (chunk: Buffer) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }
}
