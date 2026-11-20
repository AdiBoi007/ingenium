import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  put as putBlob,
  get as getBlob,
  del as deleteBlob,
} from "@vercel/blob";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
/** Only server-generated, flat object keys are accepted. A stored locator keeps its original backend. */
export function storageKey(key: string) {
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(key))
    throw new Error("Invalid stored object key");
  return key;
}
export const storageDirectory = () =>
  path.resolve(
    /*turbopackIgnore: true*/ process.env.STORAGE_PATH ||
      path.join(os.homedir(), ".local", "share", "ingenium", "uploads"),
  );
function s3() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required for object storage");
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    const u = new URL(endpoint);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      throw new Error(
        "Object storage requires HTTPS (except local development)",
      );
  }
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: endpoint || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 10000, requestTimeout: 30000 },
    ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  return { client, bucket };
}
export async function storeBytes(
  key: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  storageKey(key);
  if (process.env.STORAGE_PROVIDER === "vercel-blob") {
    await putBlob(`ingenium/${key}`, Buffer.from(bytes), {
      access: "private",
      contentType: mime,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return `blob:${key}`;
  }
  if (process.env.VERCEL && process.env.STORAGE_PROVIDER !== "s3")
    throw new Error("Hosted uploads require configured durable storage");
  if (process.env.STORAGE_PROVIDER === "s3") {
    const { client, bucket } = s3();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `ingenium/${key}`,
          Body: bytes,
          ContentType: mime,
          IfNoneMatch: "*",
        }),
      );
      return `s3:${key}`;
    } finally {
      client.destroy();
    }
  }
  await mkdir(/*turbopackIgnore: true*/ storageDirectory(), {
    recursive: true,
  });
  await writeFile(
    /*turbopackIgnore: true*/ path.join(storageDirectory(), key),
    bytes,
    { flag: "wx", mode: 0o600 },
  );
  return key;
}
export async function readBytes(locator: string): Promise<Buffer> {
  if (locator.startsWith("blob:")) {
    const key = storageKey(locator.slice(5));
    const result = await getBlob(`ingenium/${key}`, {
      access: "private",
      useCache: false,
    });
    if (!result || result.statusCode !== 200)
      throw new Error("Stored file is unavailable");
    const max = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;
    if (result.blob.size > max)
      throw new Error("Stored file exceeds upload limit");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  if (locator.startsWith("s3:")) {
    const key = storageKey(locator.slice(3)),
      { client, bucket } = s3();
    try {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: `ingenium/${key}` }),
      );
      if (!result.Body) throw new Error("Stored object has no body");
      const max = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;
      if ((result.ContentLength ?? 0) > max)
        throw new Error("Stored object exceeds file limit");
      return Buffer.from(await result.Body.transformToByteArray());
    } finally {
      client.destroy();
    }
  }
  return readFile(
    /*turbopackIgnore: true*/ path.join(
      storageDirectory(),
      storageKey(locator),
    ),
  );
}
export async function removeBytes(locator: string): Promise<void> {
  if (locator.startsWith("blob:")) {
    await deleteBlob(`ingenium/${storageKey(locator.slice(5))}`);
    return;
  }
  if (locator.startsWith("s3:")) {
    const key = storageKey(locator.slice(3)),
      { client, bucket } = s3();
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: `ingenium/${key}` }),
      );
    } finally {
      client.destroy();
    }
    return;
  }
  await unlink(
    /*turbopackIgnore: true*/ path.join(
      storageDirectory(),
      storageKey(locator),
    ),
  );
}
