import { withIdentity } from "./identity";
import { isLocalDemo } from "./identity-context";
import { z } from "zod";
import {
  ApiError,
  camel,
  currentStudentId,
  id,
  projectExists,
  query,
  scoped,
  transaction,
} from "./db";
import {
  createEntity,
  deleteEntity,
  entities,
  getEntity,
  insertRow,
  listEntity,
  projectSchema,
  updateEntity,
  type Entity,
} from "./entities";
import {
  addQuestion,
  createTest,
  getTest,
  importQuestions,
  practiceAttempt,
  progress,
  publicQuestion,
  questions,
  reviewCard,
  submitTest,
  updateTest,
} from "./learning";
import { applyPlan, calendarIcs, previewPlan, undoPlan } from "./planning";
import { resourceFile, uploadResource } from "./files";
import { executeTool, toolRegistry } from "./tools";
import { processIngestionJob, recoverIngestionJobs } from "./ingestion";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1024 * 1024)
    throw new ApiError(413, "Request is too large");
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Provide a valid JSON body");
  }
}
export async function handleApi(
  request: Request,
  path: string[],
): Promise<Response> {
  try {
    if (["health", "capabilities"].includes(path[0]))
      return await dispatch(request, path);
    return await withIdentity(request, () => dispatch(request, path));
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message, fields: error.fields }, error.status);
    if (error instanceof z.ZodError)
      return json({ error: "Invalid input", fields: error.flatten() }, 400);
    const err = error as any;
    if (["23503", "23514", "22P02", "23505"].includes(err.code))
      return json(
        {
          error:
            err.code === "23505"
              ? "This operation has already been applied."
              : "Invalid relationship or field value",
        },
        409,
      );
    console.error("API request failed:", err.code ?? err.name, err.message);
    return json(
      {
        error:
          "The server could not complete this request. Your unsaved work has not been discarded.",
      },
      500,
    );
  }
}
async function dispatch(request: Request, path: string[]): Promise<Response> {
  const method = request.method,
    url = new URL(request.url),
    params = url.searchParams;
  if (path[0] === "health") {
    await query("SELECT 1");
    return json({ status: "ok", database: "connected", demo: isLocalDemo() });
  }
  if (path[0] === "capabilities")
    return json({
      ai: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_API_KEY
        ? process.env.OPENAI_MODEL || "gpt-4.1-mini"
        : null,
      ocr: false,
      storage: process.env.STORAGE_PROVIDER || "local",
      maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024,
    });
  if (path[0] === "preferences") {
    if (method === "PATCH") {
      const input = z
        .object({
          theme: z.enum(["light", "dark", "system"]).optional(),
          listView: z.enum(["grid", "list"]).optional(),
          name: z.string().max(100).optional(),
        })
        .parse(await body(request));
      const result = await query(
        "UPDATE demo_students SET preferences=preferences || $2::jsonb,name=COALESCE($3,name) WHERE id=$1 RETURNING id,name,preferences",
        [currentStudentId(), JSON.stringify(input), input.name?.trim() || null],
      );
      return json(result.rows[0]);
    }
    const result = await query(
      "SELECT id,name,preferences FROM demo_students WHERE id=$1",
      [currentStudentId()],
    );
    return json({
      ...result.rows[0],
      entitlement: {
        name: "Ingenium Pro demo",
        price: 10,
        currency: "USD",
        period: "month",
        hypothesis: true,
      },
    });
  }
  if (path[0] === "notifications") {
    if (method === "PATCH" && path[1]) {
      const input = z
        .object({
          read: z.boolean().optional(),
          dismissed: z.boolean().optional(),
        })
        .parse(await body(request));
      const result = await query(
        "UPDATE notifications SET read=COALESCE($2,read),dismissed=COALESCE($3,dismissed) WHERE id=$1 AND (project_id IN (SELECT id FROM projects WHERE student_id=$4)) RETURNING *",
        [
          path[1],
          input.read ?? null,
          input.dismissed ?? null,
          currentStudentId(),
        ],
      );
      if (!result.rowCount) throw new ApiError(404, "Notification not found");
      return json({ item: camel(result.rows[0]) });
    }
    return json({
      items: (
        await query(
          "SELECT * FROM notifications WHERE dismissed=false AND project_id IN (SELECT id FROM projects WHERE student_id=$1) ORDER BY created_at DESC LIMIT 50",
          [currentStudentId()],
        )
      ).rows.map(camel),
    });
  }
  if (path[0] === "search")
    return json({ items: await search(params.get("q") || "", undefined) });
  if (path[0] !== "projects") throw new ApiError(404, "Endpoint not found");
  if (!path[1]) {
    if (method === "POST") {
      const input = projectSchema.parse(await body(request));
      const item = await insertRow("projects", {
        id: id("project"),
        studentId: currentStudentId(),
        ...input,
      });
      return json({ item, project: item }, 201);
    }
    return json({
      projects: (
        await query(
          "SELECT * FROM projects WHERE student_id=$1 ORDER BY pinned DESC,created_at",
          [currentStudentId()],
        )
      ).rows.map(camel),
    });
  }
  const projectId = path[1];
  const project = await projectExists(projectId);
  const entity = path[2],
    recordId = path[3],
    action = path[4];
  if (!entity || entity === "settings") {
    if (method === "PATCH") {
      let input = await body(request);
      if (entity === "settings" && !input.settings) input = { settings: input };
      const parsed: any = Object.fromEntries(
        Object.entries(projectSchema.partial().parse(input)).filter(([key]) =>
          Object.hasOwn(input, key),
        ),
      );
      if (parsed.settings)
        parsed.settings = { ...project.settings, ...parsed.settings };
      const keys = Object.keys(parsed);
      if (!keys.length) return json({ project, item: project });
      const values = keys.map((key) =>
        ["settings", "subjects"].includes(key)
          ? JSON.stringify((parsed as any)[key])
          : (parsed as any)[key],
      );
      const columns = keys.map(
        (key, i) =>
          `${key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}=$${i + 2}`,
      );
      const result = await query(
        `UPDATE projects SET ${columns.join(",")},updated_at=now() WHERE id=$1 RETURNING *`,
        [projectId, ...values],
      );
      return json({
        project: camel(result.rows[0]),
        item: camel(result.rows[0]),
      });
    }
    if (method === "DELETE") {
      const input = await body(request);
      if (input.confirmName !== project.name)
        throw new ApiError(
          400,
          "Type the exact project name to confirm deletion",
        );
      await query("DELETE FROM projects WHERE id=$1", [projectId]);
      return json({ deleted: true });
    }
    return json({ project, item: project });
  }
  if (entity === "search")
    return json({ items: await search(params.get("q") || "", projectId) });
  if (entity === "progress") return json(await progress(projectId));
  if (entity === "jobs") {
    await recoverIngestionJobs();
    if (method === "POST" && recordId && action === "retry")
      return json({ item: await processIngestionJob(recordId, projectId) });
    if (recordId)
      return json({ item: camel(await scoped("jobs", projectId, recordId)) });
    return json({
      items: (
        await query(
          "SELECT * FROM jobs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50",
          [projectId],
        )
      ).rows.map(camel),
    });
  }
  if (entity === "tools") {
    if (method === "POST" && recordId)
      return json({
        item: await executeTool(projectId, recordId, await body(request)),
      });
    return json({
      items: toolRegistry.filter(
        (t) =>
          !Array.isArray(project.settings.enabledTools) ||
          project.settings.enabledTools.includes(t.id),
      ),
    });
  }
  if (entity === "updates")
    return json({
      items: [],
      sources: project.exam.includes("JEE")
        ? [
            {
              title: "JEE Main official website",
              url: "https://jeemain.nta.nic.in",
            },
            {
              title: "JEE Advanced official website",
              url: "https://jeeadv.ac.in",
            },
          ]
        : project.exam.includes("NEET")
          ? [
              {
                title: "National Medical Commission",
                url: "https://www.nmc.org.in",
              },
            ]
          : [],
      status:
        "No live notice feed connected. Official sources are available for verification.",
    });
  if (entity === "calendar" && recordId === "export")
    return new Response(await calendarIcs(projectId), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${projectId}.ics"`,
      },
    });
  if (
    entity === "resources" &&
    (recordId === "upload" || action === "upload") &&
    method === "POST"
  )
    return json(
      {
        item: await uploadResource(
          projectId,
          request,
          action ? recordId : undefined,
        ),
      },
      201,
    );
  if (entity === "resources" && action === "file")
    return resourceFile(
      projectId,
      recordId,
      params.get("version") || undefined,
    );
  if (entity === "resources" && action === "versions") {
    await scoped("resources", projectId, recordId);
    return json({
      items: (
        await query(
          "SELECT version,content,filename,extraction_status,created_at FROM resource_versions WHERE project_id=$1 AND resource_id=$2 ORDER BY version DESC",
          [projectId, recordId],
        )
      ).rows.map(camel),
    });
  }
  if (entity === "artifacts" && action === "revisions") {
    await scoped("artifacts", projectId, recordId);
    return json({
      items: (
        await query(
          "SELECT * FROM artifact_revisions WHERE project_id=$1 AND artifact_id=$2 ORDER BY revision DESC",
          [projectId, recordId],
        )
      ).rows.map(camel),
    });
  }
  if (entity === "artifacts" && action === "restore" && method === "POST") {
    const item = await getEntity("artifacts", projectId, recordId);
    return json({
      item: await updateEntity("artifacts", projectId, recordId, {
        payload: item.originalPayload,
        revision: item.revision,
      }),
    });
  }
  if (entity === "conversations" && action === "messages") {
    await scoped("conversations", projectId, recordId);
    if (method === "GET")
      return json({
        items: (
          await query(
            "SELECT * FROM messages WHERE project_id=$1 AND conversation_id=$2 ORDER BY created_at",
            [projectId, recordId],
          )
        ).rows.map(camel),
      });
    const input = z
      .object({
        content: z.string().trim().min(1).max(20000),
        tool: z.string().max(100).optional(),
        attachments: z.array(z.unknown()).max(20).optional(),
        subject: z.string().max(100).optional(),
      })
      .parse(await body(request));
    if (input.subject && !project.subjects.includes(input.subject))
      throw new ApiError(400, "Select a subject from this project");
    const result = await transaction(async (client) => {
      const userMessage = await insertRow(
        "messages",
        {
          id: id("message"),
          projectId,
          conversationId: recordId,
          role: "user",
          content: input.content,
          context: [
            ...(input.attachments ?? []),
            ...(input.subject
              ? [{ type: "subject", title: input.subject }]
              : []),
          ],
        },
        client,
      );
      const message = await insertRow(
        "messages",
        {
          id: id("message"),
          projectId,
          conversationId: recordId,
          role: "assistant",
          content:
            "Open-ended AI tutoring is not connected in this demo. Your message is saved. You can still explore a scientific model, practise original questions, make notes, or build a study plan using the tools below.",
          status: "unavailable",
        },
        client,
      );
      await query(
        "UPDATE conversations SET updated_at=now() WHERE project_id=$1 AND id=$2",
        [projectId, recordId],
        client,
      );
      return { item: message, userMessage };
    });
    return json(
      {
        ...result,
        conversation: await getEntity("conversations", projectId, recordId),
      },
      201,
    );
  }
  if (entity === "lessons" && action === "notes") {
    const lesson = await getEntity("lessons", projectId, recordId);
    if (method === "GET")
      return json({
        items: (
          await query(
            "SELECT * FROM resources WHERE project_id=$1 AND deleted=false AND metadata->>'lessonId'=$2 ORDER BY (metadata->>'timestamp')::numeric",
            [projectId, recordId],
          )
        ).rows.map(camel),
      });
    const input = z
      .object({
        content: z.string().trim().min(1).max(20000),
        timestamp: z.number().min(0).max(86400).default(0),
      })
      .parse(await body(request));
    return json(
      {
        item: await createEntity("resources", projectId, {
          title: lesson.title + " — note",
          type: "video-note",
          subject: lesson.subject,
          content: input.content,
          metadata: {
            lessonId: recordId,
            timestamp: input.timestamp,
            videoId: lesson.videoId,
          },
        }),
      },
      201,
    );
  }
  if (entity === "questions") {
    if (recordId === "import" && method === "POST")
      return json(await importQuestions(projectId, await body(request)));
    if (recordId && action === "attempts" && method === "POST")
      return json(
        {
          item: await practiceAttempt(projectId, {
            ...(await body(request)),
            questionId: recordId,
          }),
        },
        201,
      );
    if (recordId) {
      const q = await scoped("questions", projectId, recordId);
      if (method === "PATCH") {
        const input = z
          .object({
            bookmarked: z.boolean().optional(),
            reviewStatus: z
              .enum(["checked", "reviewed", "unreviewed", "reported"])
              .optional(),
          })
          .parse(await body(request));
        await query(
          "UPDATE questions SET bookmarked=COALESCE($3,bookmarked),review_status=COALESCE($4,review_status) WHERE project_id=$1 AND id=$2",
          [
            projectId,
            recordId,
            input.bookmarked ?? null,
            input.reviewStatus ?? null,
          ],
        );
        return json({ item: { ...publicQuestion(q), ...input } });
      }
      return json({ item: publicQuestion(q) });
    }
    if (method === "POST") {
      const input = await body(request);
      return json(
        {
          item: await transaction((client) =>
            addQuestion(projectId, input, client),
          ),
        },
        201,
      );
    }
    return json({ items: await questions(projectId, params) });
  }
  if (entity === "attempts") {
    if (method === "POST")
      return json(
        { item: await practiceAttempt(projectId, await body(request)) },
        201,
      );
    return json({ items: (await progress(projectId)).recentAttempts });
  }
  if (entity === "tests") {
    if (recordId && action === "submit" && method === "POST")
      return json({ item: await submitTest(projectId, recordId) });
    if (recordId && method === "PATCH")
      return json({
        item: await updateTest(projectId, recordId, await body(request)),
      });
    if (recordId) return json({ item: await getTest(projectId, recordId) });
    if (method === "POST")
      return json(
        { item: await createTest(projectId, await body(request)) },
        201,
      );
    return json({
      items: (
        await query(
          "SELECT * FROM test_sessions WHERE project_id=$1 ORDER BY started_at DESC",
          [projectId],
        )
      ).rows.map(camel),
    });
  }
  if (entity === "reviews") {
    if (method === "POST")
      return json(
        { item: await reviewCard(projectId, await body(request)) },
        201,
      );
    return json({
      items: (
        await query(
          "SELECT * FROM flashcards WHERE project_id=$1 AND suspended=false AND due_date<=current_date ORDER BY due_date",
          [projectId],
        )
      ).rows.map(camel),
    });
  }
  if (entity === "plans") {
    if (recordId && action === "apply" && method === "POST")
      return json({ item: await applyPlan(projectId, recordId) });
    if (recordId && action === "undo" && method === "POST")
      return json({ item: await undoPlan(projectId, recordId) });
    if (recordId) {
      const item = camel(await scoped("plans", projectId, recordId));
      return json({ item: { ...item, ...item.payload } });
    }
    if (method === "POST")
      return json(
        { item: await previewPlan(projectId, await body(request)) },
        201,
      );
    return json({
      items: (
        await query(
          "SELECT * FROM plans WHERE project_id=$1 ORDER BY created_at DESC",
          [projectId],
        )
      ).rows.map((row) => ({ ...camel(row), ...row.payload })),
    });
  }
  if (entity === "mistakes" && method === "GET" && !recordId)
    return json({ items: (await progress(projectId)).mistakes });
  const canonical = (entity === "calendar" ? "tasks" : entity) as Entity;
  if (canonical in entities) {
    if (method === "POST") {
      const input = await body(request);
      if (canonical === "focus" && input.seconds !== undefined) {
        input.elapsedSeconds = input.seconds;
        input.endedAt = new Date().toISOString();
      }
      return json(
        { item: await createEntity(canonical, projectId, input) },
        201,
      );
    }
    if (method === "PATCH" && recordId)
      return json({
        item: await updateEntity(
          canonical,
          projectId,
          recordId,
          await body(request),
        ),
      });
    if (method === "DELETE" && recordId) {
      if (canonical === "tasks" && params.get("scope") === "series") {
        const task = await scoped("tasks", projectId, recordId);
        if (task.series_id) {
          await query(
            "DELETE FROM tasks WHERE project_id=$1 AND series_id=$2",
            [projectId, task.series_id],
          );
          return json({ deleted: true });
        }
      }
      return json(await deleteEntity(canonical, projectId, recordId));
    }
    if (recordId) {
      const explicitResourceHistory =
        canonical === "resources" && params.has("version");
      const item = explicitResourceHistory
        ? camel(await scoped("resources", projectId, recordId))
        : await getEntity(canonical, projectId, recordId);
      if (explicitResourceHistory) {
        const version = Number(params.get("version"));
        if (!Number.isInteger(version) || version < 1)
          throw new ApiError(400, "Choose a valid source version");
        const source = (
          await query(
            "SELECT * FROM resource_versions WHERE project_id=$1 AND resource_id=$2 AND version=$3",
            [projectId, recordId, version],
          )
        ).rows[0];
        if (!source) throw new ApiError(404, "Source version not found");
        return json({
          item: {
            ...item,
            content: source.content,
            revision: version,
            currentRevision: item.revision,
            historical: item.deleted || version !== item.revision,
            metadata: {
              ...item.metadata,
              filename: source.filename ?? item.metadata.filename,
              mimeType: source.mime_type ?? item.metadata.mimeType,
              extractionStatus: source.extraction_status,
            },
          },
        });
      }
      return json({ item });
    }
    return json({ items: await listEntity(canonical, projectId, params) });
  }
  throw new ApiError(404, "Endpoint not found");
}
async function search(term: string, projectId?: string) {
  if (term.trim().length < 2) return [];
  const values: unknown[] = ["%" + term.trim().slice(0, 200) + "%"];
  values.push(currentStudentId());
  if (projectId) values.push(projectId);
  const scope =
    "AND p.student_id=$2" + (projectId ? " AND t.project_id=$3" : "");
  const resources = (
    await query(
      `SELECT t.id,t.title,t.type,t.project_id,p.name AS project_name,'/projects/'||p.id||'/library/'||t.id AS url FROM resources t JOIN projects p ON p.id=t.project_id WHERE t.deleted=false AND (t.title ILIKE $1 OR t.content ILIKE $1) ${scope} LIMIT 30`,
      values,
    )
  ).rows;
  const conversations = (
    await query(
      `SELECT t.id,t.title,'conversation' AS type,t.project_id,p.name AS project_name,'/projects/'||p.id||'/study/'||t.id AS url FROM conversations t JOIN projects p ON p.id=t.project_id WHERE t.title ILIKE $1 ${scope} LIMIT 20`,
      values,
    )
  ).rows;
  const artifacts = (
    await query(
      `SELECT t.id,t.title,t.type,t.project_id,p.name AS project_name,'/projects/'||p.id||'/artifacts/'||t.id AS url FROM artifacts t JOIN projects p ON p.id=t.project_id WHERE t.title ILIKE $1 ${scope} LIMIT 20`,
      values,
    )
  ).rows;
  const lessons = (
    await query(
      `SELECT t.id,t.title,'video' AS type,t.project_id,p.name AS project_name,'/projects/'||p.id||'/cramazon/'||t.id AS url FROM lessons t JOIN projects p ON p.id=t.project_id WHERE (t.title ILIKE $1 OR t.channel ILIKE $1 OR t.subject ILIKE $1) ${scope} LIMIT 30`,
      values,
    )
  ).rows;
  return [...resources, ...conversations, ...artifacts, ...lessons].map(camel);
}
