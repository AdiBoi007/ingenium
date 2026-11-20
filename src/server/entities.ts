import { z } from "zod";
import { parseSyllabusText } from "../domain/project-context";
import {
  ApiError,
  camel,
  id,
  query,
  requireTool,
  scoped,
  transaction,
} from "./db";
import type { PoolClient } from "pg";
import { recoverStaleGenerations } from "./generations";
import { recordPlayback } from "./playback";
import {
  labs,
  computeModel,
  validateParameters,
  type Parameters,
} from "../domain/science";
const text = z.string().max(50000);
const short = z.string().max(300);
const title = z.string().trim().min(1).max(300);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date");
const url = z
  .string()
  .max(3000)
  .refine((value) => {
    try {
      return ["https:", "http:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use a valid HTTP or HTTPS URL")
  .nullable();
export const projectSchema = z.object({
  name: title,
  exam: short.default("Custom"),
  projectKind: z
    .enum(["course", "exam", "school", "personal", "custom"])
    .default("custom"),
  institution: short.default(""),
  courseCode: short.default(""),
  qualification: short.default(""),
  level: short.default(""),
  academicYear: short.default(""),
  learningGoal: z.string().trim().max(5000).default(""),
  syllabusText: text
    .superRefine((value, ctx) => {
      try {
        parseSyllabusText(value);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
      }
    })
    .default(""),
  subjects: z
    .array(z.string().trim().min(1).max(200))
    .max(30)
    .transform((items) => [
      ...new Map(
        items.map((item) => [item.toLocaleLowerCase(), item]),
      ).values(),
    ])
    .default([]),
  targetDate: date.nullable().optional(),
  description: text.default(""),
  accent: short.default("blue"),
  archived: z.boolean().default(false),
  pinned: z.boolean().default(false),
  settings: z.record(z.string(), z.unknown()).default({}),
});
export const entities = {
  tasks: {
    table: "tasks",
    schema: z.object({
      title,
      date,
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .default("09:00"),
      duration: z.number().int().min(1).max(1440).default(30),
      subject: short.default(""),
      topic: short.default(""),
      type: z
        .enum([
          "study",
          "practice",
          "revision",
          "test",
          "assignment",
          "commitment",
          "target",
          "focus",
        ])
        .default("study"),
      status: z
        .enum(["pending", "completed", "in-progress", "cancelled"])
        .default("pending"),
      fixed: z.boolean().default(false),
      priority: z.number().int().min(1).max(3).default(2),
      timezone: short.default("Australia/Sydney"),
      force: z.boolean().optional(),
      resourceId: short.nullable().optional(),
      questionId: short.nullable().optional(),
      attemptId: short.nullable().optional(),
      sessionId: short.nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      recurrence: z
        .object({
          frequency: z.literal("weekly"),
          count: z.number().int().min(1).max(52),
        })
        .nullable()
        .optional(),
    }),
  },
  resources: {
    table: "resources",
    schema: z.object({
      title,
      type: short.default("note"),
      subject: short.default(""),
      topic: short.default(""),
      content: text.default(""),
      description: text.default(""),
      pinned: z.boolean().default(false),
      url: url.optional(),
      metadata: z.record(z.string(), z.unknown()).default({}),
      revision: z.number().int().positive().optional(),
    }),
  },
  artifacts: {
    table: "artifacts",
    schema: z.object({
      title,
      type: short.default("simulation"),
      payload: z.record(z.string(), z.unknown()).default({}),
      bookmarked: z.boolean().default(true),
      conversationId: short.nullable().optional(),
      revision: z.number().int().positive().optional(),
    }),
  },
  lessons: {
    table: "lessons",
    schema: z.object({
      title,
      subject: short.default(""),
      topic: short.default(""),
      channel: short.default(""),
      videoId: z
        .string()
        .regex(/^[\w-]{11}$/, "A valid YouTube video ID is required"),
      duration: z.number().int().min(0).max(604800).default(0),
      position: z.number().min(0).max(604800).default(0),
      watchedSeconds: z.number().min(0).max(60).optional(),
      saved: z.boolean().default(false),
      completed: z.boolean().default(false),
      description: text.default(""),
      collection: short.default(""),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  conversations: {
    table: "conversations",
    schema: z.object({
      title: title.default("New conversation"),
      subject: short.default(""),
      pinned: z.boolean().default(false),
    }),
  },
  flashcards: {
    table: "flashcards",
    schema: z.object({
      front: title,
      back: text.min(1),
      subject: short.default(""),
      topic: short.default(""),
      deck: short.default("My flashcards"),
      suspended: z.boolean().default(false),
    }),
  },
  mistakes: {
    table: "mistakes",
    schema: z.object({
      category: z.enum([
        "concept",
        "setup",
        "calculation",
        "units",
        "misreading",
        "time",
        "custom",
      ]),
      reflection: text.default(""),
      status: z.enum(["open", "reviewed", "resolved"]).default("open"),
      nextReview: date.optional(),
    }),
  },
  focus: {
    table: "focus_sessions",
    schema: z.object({
      title: title.default("Focus session"),
      elapsedSeconds: z.number().int().min(0).max(86400).default(0),
      endedAt: z.iso.datetime().nullable().optional(),
    }),
  },
} as const;
export type Entity = keyof typeof entities;
const snake = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
const jsonFields = new Set([
  "settings",
  "subjects",
  "metadata",
  "payload",
  "originalPayload",
  "recurrence",
  "context",
  "options",
  "answer",
  "examTags",
]);
export async function insertRow(
  table: string,
  data: Record<string, unknown>,
  client?: PoolClient,
) {
  const keys = Object.keys(data);
  const values = keys.map((key) =>
    jsonFields.has(key) && data[key] !== null
      ? JSON.stringify(data[key])
      : data[key],
  );
  const result = await query(
    `INSERT INTO ${table} (${keys.map(snake).join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
    values,
    client,
  );
  return camel(result.rows[0]);
}
async function writeResourceVersion(resource: any, client: PoolClient) {
  const previous = (
    await query(
      "SELECT * FROM resource_versions WHERE project_id=$1 AND resource_id=$2 AND version<$3 ORDER BY version DESC LIMIT 1",
      [resource.projectId, resource.id, resource.revision],
      client,
    )
  ).rows[0];
  const sameContent = previous?.content === resource.content;
  await query(
    "INSERT INTO resource_versions(id,project_id,resource_id,version,content,storage_key,mime_type,filename,byte_size,extraction_status,extraction_error) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [
      id("version"),
      resource.projectId,
      resource.id,
      resource.revision,
      resource.content,
      previous?.storage_key ?? null,
      previous?.mime_type ?? null,
      previous?.filename ?? null,
      previous?.byte_size ?? null,
      sameContent ? previous.extraction_status : "completed",
      sameContent ? previous.extraction_error : null,
    ],
    client,
  );
  if (sameContent) {
    const chunks = (
      await query(
        "SELECT * FROM source_chunks WHERE project_id=$1 AND resource_id=$2 AND version=$3 ORDER BY section",
        [resource.projectId, resource.id, previous.version],
        client,
      )
    ).rows;
    for (const chunk of chunks)
      await query(
        "INSERT INTO source_chunks(id,project_id,resource_id,version,section,content,page,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id("chunk"),
          resource.projectId,
          resource.id,
          resource.revision,
          chunk.section,
          chunk.content,
          chunk.page,
          chunk.start_offset,
          chunk.end_offset,
        ],
        client,
      );
  } else
    for (
      let offset = 0, index = 1;
      offset < resource.content.length;
      offset += 1600, index++
    )
      await query(
        "INSERT INTO source_chunks(id,project_id,resource_id,version,section,content,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id("chunk"),
          resource.projectId,
          resource.id,
          resource.revision,
          index,
          resource.content.slice(offset, offset + 1800),
          offset,
          Math.min(resource.content.length, offset + 1800),
        ],
        client,
      );
}
export async function createEntity(
  entity: Entity,
  projectId: string,
  body: unknown,
) {
  const config = entities[entity];
  const parsed = config.schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      400,
      "Please check the highlighted fields",
      parsed.error.flatten(),
    );
  const values: any = parsed.data;
  delete values.revision;
  const force = values.force === true;
  delete values.force;
  if (entity === "tasks" && values.metadata)
    for (const key of ["questionId", "attemptId", "sessionId"])
      if (values.metadata[key]) values[key] = String(values.metadata[key]);
  if (entity === "artifacts" && values.type === "simulation")
    await requireTool(projectId, "visualise");
  if (entity === "flashcards") await requireTool(projectId, "revise");
  if (entity === "artifacts" && values.type === "simulation")
    values.payload = validatedSimulation(values.payload);
  return transaction(async (client) => {
    if (entity === "tasks") {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        projectId + ":calendar",
      ]);
      if (values.metadata?.mistakeId)
        await scoped(
          "mistakes",
          projectId,
          String(values.metadata.mistakeId),
          client,
        );
      const reference =
        values.attemptId ||
        values.metadata?.mistakeId ||
        values.questionId ||
        values.resourceId;
      if (values.type === "revision" && reference && !force) {
        const existing = await query(
          "SELECT * FROM tasks WHERE project_id=$1 AND date=$2 AND type='revision' AND status IN ('pending','in-progress') AND COALESCE(attempt_id,metadata->>'mistakeId',question_id,resource_id)=$3 LIMIT 1",
          [projectId, values.date, reference],
          client,
        );
        if (existing.rows[0]) return camel(existing.rows[0]);
      }
    }
    const data = {
      id: id(entity.slice(0, -1)),
      projectId,
      ...values,
      ...(entity === "artifacts" ? { originalPayload: values.payload } : {}),
      ...(entity === "tasks" && values.recurrence
        ? { seriesId: id("series") }
        : {}),
    };
    const item = await insertRow(config.table, data, client);
    if (entity === "resources") await writeResourceVersion(item, client);
    if (entity === "artifacts")
      await query(
        "INSERT INTO artifact_revisions(id,project_id,artifact_id,revision,payload) VALUES($1,$2,$3,1,$4)",
        [id("revision"), projectId, item.id, JSON.stringify(item.payload)],
        client,
      );
    if (entity === "tasks" && values.recurrence)
      for (let week = 1; week < values.recurrence.count; week++) {
        const next = new Date(values.date + "T12:00:00Z");
        next.setUTCDate(next.getUTCDate() + week * 7);
        await insertRow(
          "tasks",
          { ...data, id: id("task"), date: next.toISOString().slice(0, 10) },
          client,
        );
      }
    return item;
  });
}
export async function updateEntity(
  entity: Entity,
  projectId: string,
  recordId: string,
  body: unknown,
) {
  const config = entities[entity];
  const parsed = config.schema.partial().safeParse(body);
  if (!parsed.success)
    throw new ApiError(400, "Invalid update", parsed.error.flatten());
  // Zod defaults are useful on create, but PATCH must preserve every omitted field.
  const values: any = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) =>
      Object.hasOwn(body as object, key),
    ),
  );
  const expectedRevision = values.revision;
  delete values.revision;
  delete values.force;
  if (entity === "tasks" && values.metadata)
    for (const key of ["questionId", "attemptId", "sessionId"])
      if (values.metadata[key]) values[key] = String(values.metadata[key]);
  return transaction(async (client) => {
    if (entity === "tasks")
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        projectId + ":calendar",
      ]);
    const found = await query(
      `SELECT * FROM ${config.table} WHERE project_id=$1 AND id=$2 FOR UPDATE`,
      [projectId, recordId],
      client,
    );
    if (!found.rows[0])
      throw new ApiError(404, "Item not found in this project");
    const previous = found.rows[0];
    if (entity === "resources" && previous.deleted)
      throw new ApiError(
        404,
        "Deleted sources are read-only through their historical versions.",
      );
    if (
      entity === "artifacts" &&
      (values.type ?? previous.type) === "simulation" &&
      values.payload
    ) {
      if (values.payload.modelId !== previous.payload.modelId)
        throw new ApiError(
          409,
          "Create a new experiment to change the scientific model",
        );
      values.payload = validatedSimulation({
        ...values.payload,
        originalInput:
          previous.original_payload.originalInput ??
          previous.payload.originalInput,
      });
    }
    if (
      expectedRevision !== undefined &&
      previous.revision !== expectedRevision
    )
      throw new ApiError(
        409,
        "This item changed elsewhere. Reload before saving.",
      );
    const playback =
      entity === "lessons" &&
      (values.position !== undefined || values.watchedSeconds !== undefined)
        ? {
            eventId:
              typeof (body as any).eventId === "string"
                ? (body as any).eventId
                : id("legacy-playback"),
            sessionId:
              typeof (body as any).sessionId === "string"
                ? (body as any).sessionId
                : `legacy-${recordId}`,
            position: values.position ?? Number(previous.position),
            duration: values.duration,
            watchedSeconds: values.watchedSeconds ?? 0,
            state: values.watchedSeconds > 0 ? "playing" : "paused",
          }
        : null;
    if (playback) {
      delete values.position;
      delete values.duration;
      delete values.watchedSeconds;
    }
    const keys = Object.keys(values);
    if (!keys.length)
      return playback
        ? recordPlayback(projectId, recordId, playback, client)
        : camel(previous);
    const versioned = entity === "resources" || entity === "artifacts";
    const updatedAt = [
      "tasks",
      "resources",
      "artifacts",
      "lessons",
      "conversations",
    ].includes(entity);
    const isSeries =
      entity === "tasks" &&
      (body as any)?.scope === "series" &&
      previous.series_id;
    const updates = keys.map((key, index) =>
      isSeries && key === "date"
        ? `date=date + ($${index + 3}::date - $${keys.length + 3}::date)`
        : entity === "lessons" && key === "watchedSeconds"
          ? `watched_seconds=watched_seconds+$${index + 3}`
          : `${snake(key)}=$${index + 3}`,
    );
    if (versioned) updates.push("revision=revision+1");
    if (updatedAt) updates.push("updated_at=now()");
    const rowValues = keys.map((key) =>
      jsonFields.has(key) && values[key] !== null
        ? JSON.stringify(values[key])
        : values[key],
    );
    let where = "project_id=$1 AND id=$2";
    let scopeId = recordId;
    if (isSeries) {
      where = "project_id=$1 AND series_id=$2";
      scopeId = previous.series_id;
      if (keys.includes("date")) rowValues.push(previous.date);
    }
    const result = await query(
      `UPDATE ${config.table} SET ${updates.join(",")} WHERE ${where} RETURNING *`,
      [projectId, scopeId, ...rowValues],
      client,
    );
    let item = camel(result.rows[0]);
    if (playback)
      item = await recordPlayback(projectId, recordId, playback, client);
    if (entity === "resources") await writeResourceVersion(item, client);
    if (entity === "artifacts")
      await query(
        "INSERT INTO artifact_revisions(id,project_id,artifact_id,revision,payload) VALUES($1,$2,$3,$4,$5)",
        [
          id("revision"),
          projectId,
          item.id,
          item.revision,
          JSON.stringify(item.payload),
        ],
        client,
      );
    if (
      entity === "tasks" &&
      values.status === "completed" &&
      previous.status !== "completed"
    )
      await insertRow(
        "learning_events",
        {
          id: id("event"),
          projectId,
          type: "task-completed",
          subject: item.subject,
          referenceId: item.id,
        },
        client,
      );
    return item;
  });
}
export async function deleteEntity(
  entity: Entity,
  projectId: string,
  recordId: string,
) {
  const config = entities[entity];
  await scoped(config.table, projectId, recordId);
  if (entity === "conversations")
    return transaction(async (client) => {
      const conversation = (
        await query(
          "SELECT * FROM conversations WHERE project_id=$1 AND id=$2 FOR UPDATE",
          [projectId, recordId],
          client,
        )
      ).rows[0];
      if (!conversation) throw new ApiError(404, "Conversation not found");
      await query(
        "UPDATE artifacts SET origin_conversation_id=COALESCE(origin_conversation_id,conversation_id),origin_conversation_title=COALESCE(origin_conversation_title,$3),conversation_id=NULL WHERE project_id=$1 AND conversation_id=$2",
        [projectId, recordId, conversation.title],
        client,
      );
      await query(
        "DELETE FROM conversations WHERE project_id=$1 AND id=$2",
        [projectId, recordId],
        client,
      );
      return { deleted: true };
    });
  if (entity === "resources")
    await query(
      "UPDATE resources SET deleted=true,updated_at=now() WHERE project_id=$1 AND id=$2",
      [projectId, recordId],
    );
  else if (entity === "artifacts")
    await query(
      "UPDATE artifacts SET bookmarked=false WHERE project_id=$1 AND id=$2",
      [projectId, recordId],
    );
  else
    await query(`DELETE FROM ${config.table} WHERE project_id=$1 AND id=$2`, [
      projectId,
      recordId,
    ]);
  return { deleted: true };
}
export async function getEntity(
  entity: Entity,
  projectId: string,
  recordId: string,
) {
  const item = camel(await scoped(entities[entity].table, projectId, recordId));
  if (entity === "resources" && item.deleted)
    throw new ApiError(
      404,
      "Resource was deleted; historical citations remain retained.",
    );
  if (entity === "conversations") {
    await recoverStaleGenerations(projectId);
    item.messages = (
      await query(
        "SELECT * FROM messages WHERE project_id=$1 AND conversation_id=$2 ORDER BY created_at,id",
        [projectId, recordId],
      )
    ).rows.map(camel);
  }
  return item;
}
export async function listEntity(
  entity: Entity,
  projectId: string,
  params: URLSearchParams,
) {
  const table = entities[entity].table;
  const values: unknown[] = [projectId];
  const clauses = ["project_id=$1"];
  if (entity === "resources") clauses.push("deleted=false");
  if (
    params.get("subject") &&
    !["artifacts", "focus", "mistakes"].includes(entity)
  ) {
    values.push(params.get("subject"));
    clauses.push(`subject=$${values.length}`);
  }
  if (
    params.get("type") &&
    ["tasks", "resources", "artifacts"].includes(entity)
  ) {
    values.push(params.get("type"));
    clauses.push(`type=$${values.length}`);
  }
  if (params.get("q")) {
    values.push("%" + params.get("q") + "%");
    clauses.push(
      `${entity === "flashcards" ? "front" : entity === "mistakes" ? "reflection" : "title"} ILIKE $${values.length}`,
    );
  }
  const order =
    entity === "tasks"
      ? "date,time"
      : entity === "flashcards"
        ? "due_date,created_at"
        : entity === "mistakes"
          ? "next_review"
          : "created_at DESC";
  return (
    await query(
      `SELECT * FROM ${table} WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT 200`,
      values,
    )
  ).rows.map(camel);
}

function validatedSimulation(payload: any) {
  const model = labs.find((l) => l.id === payload.modelId);
  if (!model) throw new ApiError(400, "Choose a supported scientific model");
  const parameters = payload.parameters as Parameters;
  const errors = validateParameters(model.id, parameters ?? {});
  if (errors.length)
    throw new ApiError(400, "Invalid simulation parameters", errors);
  const original = payload.originalInput ?? parameters;
  const originalErrors = validateParameters(model.id, original);
  if (originalErrors.length)
    throw new ApiError(
      400,
      "Invalid original simulation parameters",
      originalErrors,
    );
  return {
    ...payload,
    schemaVersion: 1,
    modelVersion: 1,
    parameters,
    originalInput: original,
    result: computeModel(model.id, parameters),
  };
}
