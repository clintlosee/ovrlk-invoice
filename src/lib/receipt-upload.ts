export const RECEIPT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf";

const MAX_BYTES = 10 * 1024 * 1024;

const RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export function chosenReceipt<T extends { size: number; type: string }>(
  files: ArrayLike<T>,
): { ok: true; file: T } | { ok: false; message: string } | null {
  if (files.length === 0) return null;
  const file = files[0];
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "File must be 10 MB or smaller." };
  }
  if (file.type !== "" && !RECEIPT_TYPES.has(file.type)) {
    return { ok: false, message: "Receipt must be an image or PDF" };
  }
  return { ok: true, file };
}

export function receiptPreview(input: {
  file: { name: string; type: string } | null;
  remoteContentType: string | null;
}): { kind: "image" | "pdf" | "none"; label: string | null } {
  if (!input.file && !input.remoteContentType) {
    return { kind: "none", label: null };
  }
  const type = input.file ? input.file.type : input.remoteContentType;
  const name = input.file?.name.toLowerCase() ?? "";
  const kind = type?.startsWith("image/")
    ? "image"
    : type === "application/pdf" || name.endsWith(".pdf")
      ? "pdf"
      : "none";
  return { kind, label: input.file ? input.file.name : "Receipt" };
}

export async function uploadReceipt(
  expenseId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const picked = chosenReceipt([file]);
  if (!picked?.ok) {
    return { ok: false, message: picked?.message ?? "Choose a file" };
  }
  const body = new FormData();
  body.set("receipt", file);
  try {
    const response = await fetch(`/app/expenses/${expenseId}/receipt`, {
      method: "POST",
      body,
    });
    const result = (await response.json()) as {
      ok: boolean;
      message?: string;
    };
    if (result.ok) return { ok: true };
    return { ok: false, message: result.message ?? "Could not upload." };
  } catch {
    return { ok: false, message: "Could not upload." };
  }
}
