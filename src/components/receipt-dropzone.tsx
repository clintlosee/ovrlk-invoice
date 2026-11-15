import { Paperclip } from "lucide-react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { type DragEvent, useEffect, useState } from "react";
import {
  chosenReceipt,
  RECEIPT_ACCEPT,
  receiptPreview,
} from "@/lib/receipt-upload";
import { cn } from "@/lib/utils";

async function pdfThumbnail(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: data.slice() });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 224 / base.width });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not draw the Receipt");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.86);
    });
    if (!blob) throw new Error("Could not draw the Receipt");
    return URL.createObjectURL(blob);
  } finally {
    await task.destroy();
  }
}

function useThumbnail(
  file: File | null,
  remoteUrl: string | null,
  kind: "image" | "pdf" | "none",
): string | null {
  const [src, setSrc] = useState<string | null>(
    !file && kind === "image" ? remoteUrl : null,
  );

  useEffect(() => {
    if (kind === "none") {
      setSrc(null);
      return;
    }
    const controller = new AbortController();
    let created: string | null = null;
    void (async () => {
      try {
        if (kind === "image") {
          if (!file) {
            if (!controller.signal.aborted) setSrc(remoteUrl);
            return;
          }
          created = URL.createObjectURL(file);
          if (!controller.signal.aborted) setSrc(created);
          return;
        }
        let bytes: Uint8Array | null = null;
        if (file) {
          bytes = new Uint8Array(await file.arrayBuffer());
        } else if (remoteUrl) {
          const response = await fetch(remoteUrl, {
            signal: controller.signal,
            credentials: "same-origin",
            cache: "no-store",
          });
          if (!response.ok) return;
          bytes = new Uint8Array(await response.arrayBuffer());
        }
        if (!bytes || controller.signal.aborted) return;
        created = await pdfThumbnail(bytes);
        if (controller.signal.aborted) {
          URL.revokeObjectURL(created);
          created = null;
          return;
        }
        setSrc(created);
      } catch {
        if (!controller.signal.aborted) setSrc(null);
      }
    })();
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
      setSrc(null);
    };
  }, [file, remoteUrl, kind]);

  return src;
}

export function ReceiptDropzone({
  file,
  remoteContentType,
  remoteUrl,
  pending,
  onFile,
  onRemove,
}: {
  file: File | null;
  remoteContentType: string | null;
  remoteUrl: string | null;
  pending: boolean;
  onFile: (file: File) => void;
  onRemove?: () => void;
}) {
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const preview = receiptPreview({ file, remoteContentType });
  const src = useThumbnail(file, remoteUrl, preview.kind);
  const empty = preview.kind === "none" && preview.label == null;

  function take(list: FileList | null) {
    const picked = chosenReceipt(list ?? []);
    if (!picked) return;
    if (!picked.ok) {
      setMessage(picked.message);
      return;
    }
    setMessage(null);
    onFile(picked.file);
  }

  return (
    // The file input is the accessible control. This node only accepts a drop.
    // biome-ignore lint/a11y/noStaticElementInteractions: Receipt file drop target
    <div
      className={cn("text-right", pending && "pointer-events-none opacity-50")}
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files);
      }}
    >
      <input
        id="receipt"
        type="file"
        accept={RECEIPT_ACCEPT}
        disabled={pending}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      {empty ? (
        <label
          htmlFor="receipt"
          className={cn(
            "relative flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-card px-2 text-center text-xs shadow-sm rotate-2",
            over && "border-primary",
          )}
        >
          <Paperclip
            aria-hidden
            className="absolute -top-2.5 left-1/2 size-4 -translate-x-1/2 text-muted-foreground"
          />
          <span>
            Add a Receipt or{" "}
            <span className="text-primary underline">select a file</span>
          </span>
          <span className="text-muted-foreground">
            Image or PDF, up to 10 MB.
          </span>
        </label>
      ) : (
        <div data-receipt-kind={preview.kind} className="space-y-1">
          <div className="relative rotate-2">
            <Paperclip
              aria-hidden
              className="absolute -top-2.5 left-1/2 z-10 size-4 -translate-x-1/2 text-muted-foreground"
            />
            {src ? (
              <img
                src={src}
                alt={preview.label ?? "Receipt"}
                className="h-28 w-full rounded-md border border-border bg-white object-cover object-top shadow-sm"
              />
            ) : (
              <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-card text-xs text-muted-foreground">
                Receipt
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-x-2 text-xs">
            {remoteUrl ? (
              <a
                href={remoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Open
              </a>
            ) : null}
            <label
              htmlFor="receipt"
              className="cursor-pointer text-primary underline"
            >
              Replace
            </label>
            {onRemove ? (
              <button
                type="button"
                className="text-primary underline"
                disabled={pending}
                onClick={onRemove}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      )}
      {message ? (
        <p className="mt-2 text-xs text-destructive">{message}</p>
      ) : null}
    </div>
  );
}
