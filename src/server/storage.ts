import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SIGNED_GET_SECONDS } from "../lib/files";

/**
 * Private Cloudflare R2 bucket. The app boots when these are unset;
 * upload and signed URLs stay unavailable until all four are set.
 */
export function storageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

function config() {
  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket = process.env.R2_BUCKET ?? "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("File storage is not configured");
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let client: S3Client | undefined;

function s3(): { client: S3Client; bucket: string } {
  const cfg = config();
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
  });
  return { client, bucket: cfg.bucket };
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { client: s3Client, bucket } = s3();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
}

export async function getObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const { client: s3Client, bucket } = s3();
  try {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return {
      body: bytes,
      contentType: result.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return null;
    throw error;
  }
}

export async function signedGetUrl(key: string): Promise<string> {
  const { client: s3Client, bucket } = s3();
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: SIGNED_GET_SECONDS },
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client: s3Client, bucket } = s3();
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** The row is already gone. A failed delete leaves a private orphan. */
export async function discardObject(key: string | null): Promise<void> {
  if (!key || !storageConfigured()) return;
  try {
    await deleteObject(key);
  } catch {
    // ponytail: orphan stays under the Business prefix. Sweep the bucket if it grows.
  }
}
