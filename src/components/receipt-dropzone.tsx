import { useEffect, useState } from "react";
import {
  chosenReceipt,
  RECEIPT_ACCEPT,
  receiptPreview,
} from "@/lib/receipt-upload";
import { cn } from "@/lib/utils";

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function ReceiptDropzone({
  file,
  remoteContentType,
  remoteUrl,
  pending,
  onFile,
}: {
  file: File | null;
  remoteContentType: string | null;
  remoteUrl: string | null;
  pending: boolean;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const objectUrl = useObjectUrl(file);
  const preview = receiptPreview({
    file,
    remoteContentType,
  });
  const src = file ? objectUrl : remoteUrl;
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
    <div className="space-y-2">
      <label
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-4 py-4 text-center text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
          over && "border-primary",
          pending && "pointer-events-none opacity-50",
        )}
        onDragOver={(event) => {
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
          <>
            <span>Drop a Receipt, or click to choose</span>
            <span className="text-muted-foreground">
              Image or PDF, up to 10 MB.
            </span>
          </>
        ) : (
          <>
            {preview.kind === "image" && src ? (
              <img
                src={src}
                alt={preview.label ?? "Receipt"}
                className="pointer-events-none max-h-40 max-w-full object-contain"
              />
            ) : null}
            {preview.kind === "pdf" && src ? (
              <iframe
                src={src}
                title={preview.label ?? "Receipt"}
                className="pointer-events-none h-40 w-full"
              />
            ) : null}
            {preview.label ? <span>{preview.label}</span> : null}
          </>
        )}
      </label>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
