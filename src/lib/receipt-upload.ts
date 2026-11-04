export const RECEIPT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf";

const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadReceipt(
  expenseId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "File must be 10 MB or smaller." };
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
