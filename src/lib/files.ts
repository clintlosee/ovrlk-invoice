const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SIGNED_GET_SECONDS = 300;

const RECEIPTS = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const LOGOS = new Set(["image/jpeg", "image/png"]);

export function objectKeyFor(
  businessId: string,
  kind: "receipts" | "logos",
): string {
  return `${businessId}/${kind}/${crypto.randomUUID()}`;
}

export function keyOwnedBy(
  businessId: string,
  key: string,
  kind: "receipts" | "logos",
): boolean {
  const pattern = new RegExp(`^${UUID}/${kind}/${UUID}$`);
  return key.startsWith(`${businessId}/${kind}/`) && pattern.test(key);
}

/** Sniff the bytes. The declared type has to match. */
export function detectFileType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }
  return null;
}

export function acceptUpload(
  bytes: Uint8Array,
  declared: string,
  kind: "receipt" | "logo",
): string {
  if (bytes.byteLength === 0) throw new Error("Choose a file");
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("File must be 10 MB or smaller");
  }
  const sniffed = detectFileType(bytes);
  const allowed = kind === "logo" ? LOGOS : RECEIPTS;
  if (!sniffed || !allowed.has(sniffed)) {
    throw new Error(
      kind === "logo"
        ? "Logo must be a JPEG or PNG"
        : "Receipt must be an image or PDF",
    );
  }
  const claimed = declared.trim().toLowerCase();
  if (
    claimed &&
    claimed !== "application/octet-stream" &&
    claimed !== sniffed
  ) {
    throw new Error(
      kind === "logo"
        ? "Logo must be a JPEG or PNG"
        : "Receipt must be an image or PDF",
    );
  }
  return sniffed;
}
