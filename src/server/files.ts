import { createHash } from "node:crypto";
import { ApiError, camel, id, query, scoped, transaction } from "./db";
import { insertRow } from "./entities";
import { processIngestionJob } from "./ingestion";
import { storeBytes, readBytes } from "./storage";
const supported = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export async function uploadResource(
  projectId: string,
  request: Request,
  resourceId?: string,
) {
  if (resourceId) {
    const source = await scoped("resources", projectId, resourceId);
    if (source.deleted)
      throw new ApiError(404, "Deleted sources cannot be replaced.");
  }
  const max = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;
  if (Number(request.headers.get("content-length") || 0) > max + 1024 * 100)
    throw new ApiError(
      413,
      `Files must be smaller than ${Math.floor(max / 1024 / 1024)} MB`,
    );
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ApiError(400, "Choose a file to upload");
  if (file.size > max)
    throw new ApiError(
      413,
      `Files must be smaller than ${Math.floor(max / 1024 / 1024)} MB`,
    );
  let mime = file.type || "";
  if (!mime && /\.(md|txt)$/i.test(file.name))
    mime = file.name.endsWith(".md") ? "text/markdown" : "text/plain";
  if (!supported.has(mime))
    throw new ApiError(
      415,
      "Supported files: PDF, text, Markdown, PNG, JPEG and WebP",
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  if (
    mime === "application/pdf" &&
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    throw new ApiError(400, "This file is not a valid PDF");
  if (
    mime === "image/png" &&
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new ApiError(400, "This file is not a valid PNG");
  if (
    mime === "image/jpeg" &&
    !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  )
    throw new ApiError(400, "This file is not a valid JPEG");
  if (
    mime === "image/webp" &&
    !(
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP"
    )
  )
    throw new ApiError(400, "This file is not a valid WebP");
  const key = await storeBytes(crypto.randomUUID(), bytes, mime);
  const result = await transaction(async (client) => {
    let revision = 1;
    const rid = resourceId ?? id("resource");
    if (resourceId) {
      const found = await query(
        "SELECT * FROM resources WHERE project_id=$1 AND id=$2 FOR UPDATE",
        [projectId, resourceId],
        client,
      );
      revision = found.rows[0].revision + 1;
    }
    const jobId = id("ingestion");
    const metadata = {
      filename: file.name,
      mimeType: mime,
      byteSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      extractionStatus: "queued",
      jobId,
    };
    let item: any;
    if (resourceId)
      item = camel(
        (
          await query(
            "UPDATE resources SET content=$3,metadata=$4,revision=$5,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",
            [projectId, rid, "", JSON.stringify(metadata), revision],
            client,
          )
        ).rows[0],
      );
    else
      item = await insertRow(
        "resources",
        {
          id: rid,
          projectId,
          title: String(form.get("title") || file.name).slice(0, 300),
          subject: String(form.get("subject") || "").slice(0, 200),
          type: mime.startsWith("image/") ? "image" : "document",
          content: "",
          metadata,
        },
        client,
      );
    await query(
      "INSERT INTO resource_versions(id,project_id,resource_id,version,content,storage_key,mime_type,filename,byte_size,extraction_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        id("version"),
        projectId,
        rid,
        revision,
        "",
        key,
        mime,
        file.name,
        bytes.length,
        "queued",
      ],
      client,
    );
    await insertRow(
      "jobs",
      {
        id: jobId,
        projectId,
        type: "ingestion",
        payload: { resourceId: rid, version: revision },
      },
      client,
    );
    return { item, jobId };
  });
  await processIngestionJob(result.jobId, projectId);
  return camel(await scoped("resources", projectId, result.item.id));
}
export async function resourceFile(
  projectId: string,
  resourceId: string,
  version?: string,
) {
  const resource = await scoped("resources", projectId, resourceId);
  if (resource.deleted && !version)
    throw new ApiError(
      404,
      "This source was deleted. Use an explicit historical version.",
    );
  if (version && (!Number.isInteger(Number(version)) || Number(version) < 1))
    throw new ApiError(400, "Choose a valid source version");
  const result = await query(
    `SELECT * FROM resource_versions WHERE project_id=$1 AND resource_id=$2 ${version ? "AND version=$3" : "AND storage_key IS NOT NULL"} ORDER BY version DESC LIMIT 1`,
    [projectId, resourceId, ...(version ? [Number(version)] : [])],
  );
  const file = result.rows[0];
  if (!file?.storage_key)
    throw new ApiError(404, "No uploaded file is attached to this resource");
  let bytes: Buffer;
  try {
    bytes = await readBytes(file.storage_key);
  } catch {
    throw new ApiError(404, "Stored file unavailable");
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime_type,
      "Content-Disposition": `${file.mime_type.startsWith("image/") || file.mime_type === "application/pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0",
    },
  });
}
