import { ApiError, camel, id, query, transaction } from "./db";
import { readBytes } from "./storage";
export async function recoverIngestionJobs() {
  const result = await query(
    "UPDATE jobs SET status='interrupted',error='The server stopped before extraction completed. Retry this stored upload.',updated_at=now() WHERE type='ingestion' AND status='processing' AND updated_at<now()-interval '5 minutes' RETURNING id,project_id,payload",
  );
  for (const job of result.rows) {
    await query(
      "UPDATE resource_versions SET extraction_status='interrupted',extraction_error=$4 WHERE project_id=$1 AND resource_id=$2 AND version=$3",
      [
        job.project_id,
        job.payload.resourceId,
        job.payload.version,
        "Extraction was interrupted. The uploaded bytes are retained.",
      ],
    );
  }
  return result.rowCount;
}
export async function processIngestionJob(jobId: string, projectId?: string) {
  const claim = await query(
    "UPDATE jobs SET status='processing',error=null,updated_at=now() WHERE id=$1 AND type='ingestion' AND status IN ('queued','failed','interrupted') AND ($2::text IS NULL OR project_id=$2) RETURNING *",
    [jobId, projectId ?? null],
  );
  const job = claim.rows[0];
  if (!job) {
    const existing = await query(
      "SELECT * FROM jobs WHERE id=$1 AND ($2::text IS NULL OR project_id=$2)",
      [jobId, projectId ?? null],
    );
    if (!existing.rows[0]) throw new ApiError(404, "Processing job not found");
    return camel(existing.rows[0]);
  }
  const { resourceId, version } = job.payload;
  const source = (
    await query(
      "SELECT * FROM resource_versions WHERE project_id=$1 AND resource_id=$2 AND version=$3",
      [job.project_id, resourceId, version],
    )
  ).rows[0];
  let content = "",
    status = "completed",
    error: string | null = null,
    pages: number | undefined;
  let pageTexts: Array<{ num: number; text: string }> = [];
  try {
    if (!source?.storage_key)
      throw new Error("The source version has no stored bytes.");
    const bytes = await readBytes(source.storage_key);
    if (source.mime_type.startsWith("text/")) content = bytes.toString("utf8");
    else if (source.mime_type === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: bytes });
      try {
        const result = await parser.getText();
        content = result.text;
        pages = result.total;
        pageTexts = result.pages.map((page) => ({
          num: page.num,
          text: page.text,
        }));
      } finally {
        await parser.destroy();
      }
      if (content.trim().length < 30) {
        status = "manual-text-required";
        error =
          "This PDF has little extractable text. Add a manual transcription; OCR is not connected.";
      }
    } else {
      status = "manual-text-required";
      error =
        "Image stored. Add a manual transcription to make its content searchable; OCR is not connected.";
    }
  } catch (cause) {
    status = "failed";
    error = (
      cause instanceof Error ? cause.message : "Extraction failed"
    ).slice(0, 1000);
  }
  if (content.length > 500000) content = content.slice(0, 500000);
  await transaction(async (client) => {
    await query(
      "UPDATE resource_versions SET content=$4,extraction_status=$5,extraction_error=$6 WHERE project_id=$1 AND resource_id=$2 AND version=$3",
      [job.project_id, resourceId, version, content, status, error],
      client,
    );
    await query(
      "DELETE FROM source_chunks WHERE project_id=$1 AND resource_id=$2 AND version=$3",
      [job.project_id, resourceId, version],
      client,
    );
    let section = 1;
    for (const page of pageTexts.length
      ? pageTexts
      : [{ num: 0, text: content }])
      for (let offset = 0; offset < page.text.length; offset += 1600, section++)
        await query(
          "INSERT INTO source_chunks(id,project_id,resource_id,version,section,content,page,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            id("chunk"),
            job.project_id,
            resourceId,
            version,
            section,
            page.text.slice(offset, offset + 1800),
            page.num || null,
            offset,
            Math.min(page.text.length, offset + 1800),
          ],
          client,
        );
    await query(
      "UPDATE resources SET content=$4,metadata=metadata || $5::jsonb,updated_at=now() WHERE project_id=$1 AND id=$2 AND revision=$3",
      [
        job.project_id,
        resourceId,
        version,
        content,
        JSON.stringify({
          extractionStatus: status,
          extractionError: error,
          pages,
        }),
      ],
      client,
    );
    await query(
      "UPDATE jobs SET status=$2,error=$3,updated_at=now() WHERE id=$1",
      [jobId, status === "failed" ? "failed" : "completed", error],
      client,
    );
  });
  return camel(
    (await query("SELECT * FROM jobs WHERE id=$1", [jobId])).rows[0],
  );
}
export async function drainIngestionJobs() {
  await recoverIngestionJobs();
  const jobs = (
    await query(
      "SELECT id FROM jobs WHERE type='ingestion' AND status IN ('queued','interrupted') ORDER BY created_at LIMIT 10",
    )
  ).rows;
  for (const job of jobs) await processIngestionJob(job.id);
  return jobs.length;
}
