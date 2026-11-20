import { z } from "zod";
import { parseSyllabusText } from "../domain/project-context";
import { ApiError, camel, id, projectExists, query, transaction } from "./db";
import type { PoolClient } from "pg";
import {
  assessmentSummary,
  curriculumTemplates,
  hasPrerequisiteCycle,
  selectTemplate,
  topicCode,
  validateTopicMapping,
  type Assessment,
  type CurriculumTopic,
} from "../domain/curriculum";
export { assessmentSummary, hasPrerequisiteCycle, validateTopicMapping };
const topicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(200),
  coverage: z
    .enum(["not-started", "in-progress", "covered"])
    .default("not-started"),
  confidence: z.enum(["unset", "low", "medium", "high"]).default("unset"),
  prerequisiteIds: z.array(z.string()).max(100).default([]),
});
const assessmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    course: z.string().trim().max(200).default(""),
    weight: z.number().positive().max(100),
    maxMark: z.number().positive().max(999999999),
    mark: z.number().nonnegative().nullable().default(null),
  })
  .refine((a) => a.mark === null || a.mark <= a.maxMark, {
    message: "The mark cannot exceed the maximum mark.",
    path: ["mark"],
  });
export async function ensureCurriculum(projectId: string) {
  const project = await projectExists(projectId);
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "curriculum:" + projectId,
    ]);
    for (const t of curriculumTemplates)
      await query(
        "INSERT INTO curriculum_templates(id,name,family,version,subjects,question_types,coverage_status) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,subjects=EXCLUDED.subjects,coverage_status=EXCLUDED.coverage_status WHERE (curriculum_templates.name,curriculum_templates.subjects,curriculum_templates.coverage_status) IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.subjects,EXCLUDED.coverage_status)",
        [
          t.id,
          t.name,
          t.family,
          t.version,
          JSON.stringify(t.subjects),
          JSON.stringify(t.questionTypes),
          t.coverageStatus,
        ],
        client,
      );
    const existing = await query(
      "SELECT * FROM project_curriculum WHERE project_id=$1",
      [projectId],
      client,
    );
    if (existing.rowCount) return;
    const template = selectTemplate(project.exam, project);
    await query(
      "INSERT INTO project_curriculum(project_id,template_id) VALUES($1,$2)",
      [projectId, template.id],
      client,
    );
    const questionTopics = (
      await query(
        "SELECT DISTINCT subject,topic FROM questions WHERE project_id=$1 ORDER BY subject,topic",
        [projectId],
        client,
      )
    ).rows;
    const topics = [
      ...questionTopics.map((t) => ({ subject: t.subject, title: t.topic })),
      ...parseSyllabusText(
        project.syllabusText || "",
        project.subjects[0] || "General",
      ),
    ];
    const seenTitles = new Set<string>(),
      seenCodes = new Set<string>();
    for (const topic of topics) {
      const key = `${topic.subject.toLowerCase()}\u0000${topic.title.toLowerCase()}`;
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      let code = topicCode(topic.subject, topic.title);
      if (seenCodes.has(code)) code = `${code}-${id("outline")}`;
      seenCodes.add(code);
      await query(
        "INSERT INTO curriculum_topics(id,project_id,code,title,subject) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,code) DO NOTHING",
        [id("topic"), projectId, code, topic.title, topic.subject],
        client,
      );
    }
  });
}
async function readTopics(
  projectId: string,
  client?: PoolClient,
): Promise<CurriculumTopic[]> {
  const rows = (
    await query(
      "SELECT t.*,COALESCE(array_agg(p.prerequisite_id) FILTER(WHERE p.prerequisite_id IS NOT NULL),ARRAY[]::text[]) AS prerequisite_ids FROM curriculum_topics t LEFT JOIN curriculum_prerequisites p ON p.project_id=t.project_id AND p.topic_id=t.id WHERE t.project_id=$1 GROUP BY t.id ORDER BY t.active DESC,t.subject,t.title",
      [projectId],
      client,
    )
  ).rows;
  return rows.map(camel);
}
async function readAssessments(
  projectId: string,
  client?: PoolClient,
): Promise<Assessment[]> {
  return (
    await query(
      "SELECT * FROM course_assessments WHERE project_id=$1 ORDER BY course,created_at",
      [projectId],
      client,
    )
  ).rows.map((r) => ({
    ...camel(r),
    weight: Number(r.weight),
    maxMark: Number(r.max_mark),
    mark: r.mark === null ? null : Number(r.mark),
  }));
}
export async function getCurriculum(projectId: string) {
  await ensureCurriculum(projectId);
  const [topics, assessments, config] = await Promise.all([
    readTopics(projectId),
    readAssessments(projectId),
    query(
      "SELECT p.*,t.name,t.family,t.coverage_status FROM project_curriculum p JOIN curriculum_templates t ON t.id=p.template_id WHERE p.project_id=$1",
      [projectId],
    ),
  ]);
  const active = topics.filter((t) => t.active),
    covered = active.filter((t) => t.coverage === "covered").length;
  const courses = [...new Set(assessments.map((a) => a.course))].map(
    (course) => ({
      course,
      ...assessmentSummary(assessments.filter((a) => a.course === course)),
    }),
  );
  return {
    topics,
    template: camel(config.rows[0]),
    templates: curriculumTemplates,
    assessments,
    summary: {
      totalTopics: active.length,
      coveredTopics: covered,
      inProgressTopics: active.filter((t) => t.coverage === "in-progress")
        .length,
      coveragePercent: active.length
        ? Math.round((covered / active.length) * 100)
        : 0,
      courses,
    },
  };
}
async function assertRevision(
  projectId: string,
  client: PoolClient,
  revision: number,
) {
  const result = await query(
    "SELECT * FROM project_curriculum WHERE project_id=$1 FOR UPDATE",
    [projectId],
    client,
  );
  if (result.rows[0].revision !== revision)
    throw new ApiError(
      409,
      "The curriculum changed in another view. Reload before applying your version.",
    );
  return result.rows[0];
}
export async function mutateCurriculum(projectId: string, input: any) {
  await ensureCurriculum(projectId);
  const action = String(input.action ?? "");
  if (action === "preview-version" || action === "apply-version")
    return changeVersion(projectId, input, action === "apply-version");
  return transaction(async (client) => {
    await query(
      "SELECT id FROM projects WHERE id=$1 FOR UPDATE",
      [projectId],
      client,
    );
    const topics = await readTopics(projectId, client);
    if (action === "import-outline") {
      const data = z
        .object({
          text: z.string().max(50000),
          defaultSubject: z.string().trim().min(1).max(200).default("General"),
        })
        .parse(input);
      let imported;
      try {
        imported = parseSyllabusText(data.text, data.defaultSubject);
      } catch (e) {
        throw new ApiError(400, (e as Error).message);
      }
      const known = new Set(
        topics.map(
          (t) => `${t.subject.toLowerCase()}\u0000${t.title.toLowerCase()}`,
        ),
      );
      const codes = new Set(topics.map((t) => t.code));
      let added = 0;
      for (const topic of imported) {
        if (
          known.has(
            `${topic.subject.toLowerCase()}\u0000${topic.title.toLowerCase()}`,
          )
        )
          continue;
        let code = topicCode(topic.subject, topic.title);
        if (codes.has(code)) code = `${code}-${id("outline")}`;
        codes.add(code);
        await query(
          "INSERT INTO curriculum_topics(id,project_id,code,title,subject) VALUES($1,$2,$3,$4,$5)",
          [id("topic"), projectId, code, topic.title, topic.subject],
          client,
        );
        added++;
      }
      await query(
        "UPDATE projects SET syllabus_text=$2,updated_at=now() WHERE id=$1",
        [projectId, data.text],
        client,
      );
      if (added)
        await query(
          "UPDATE project_curriculum SET revision=revision+1,updated_at=now() WHERE project_id=$1",
          [projectId],
          client,
        );
      return {
        added,
        existing: imported.length - added,
        topics: await readTopics(projectId, client),
      };
    }
    if (action === "add-topic" || action === "update-topic") {
      const data = topicSchema.parse(input);
      const existing =
        action === "update-topic"
          ? topics.find((t) => t.id === input.id)
          : undefined;
      if (action === "update-topic" && !existing)
        throw new ApiError(404, "Topic not found in this project");
      if (existing && existing.revision !== input.revision)
        throw new ApiError(
          409,
          "This topic changed. Reload and keep your edit for review.",
        );
      const topicId = existing?.id ?? id("topic");
      if (
        data.prerequisiteIds.some(
          (pre) => !topics.some((t) => t.id === pre && t.active),
        )
      )
        throw new ApiError(
          400,
          "Prerequisites must be active topics from this project.",
        );
      const edges = Object.fromEntries(
        topics.map((t) => [t.id, t.prerequisiteIds]),
      );
      edges[topicId] = data.prerequisiteIds;
      if (hasPrerequisiteCycle(edges))
        throw new ApiError(400, "Prerequisites cannot contain a cycle.");
      if (existing)
        await query(
          "UPDATE curriculum_topics SET title=$3,subject=$4,coverage=$5,confidence=$6,revision=revision+1,updated_at=now() WHERE project_id=$1 AND id=$2",
          [
            projectId,
            topicId,
            data.title,
            data.subject,
            data.coverage,
            data.confidence,
          ],
          client,
        );
      else
        await query(
          "INSERT INTO curriculum_topics(id,project_id,code,title,subject,coverage,confidence) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            topicId,
            projectId,
            topicCode(data.subject, data.title),
            data.title,
            data.subject,
            data.coverage,
            data.confidence,
          ],
          client,
        );
      await query(
        "DELETE FROM curriculum_prerequisites WHERE project_id=$1 AND topic_id=$2",
        [projectId, topicId],
        client,
      );
      for (const pre of data.prerequisiteIds)
        await query(
          "INSERT INTO curriculum_prerequisites(project_id,topic_id,prerequisite_id) VALUES($1,$2,$3)",
          [projectId, topicId, pre],
          client,
        );
      await query(
        "UPDATE project_curriculum SET revision=revision+1,updated_at=now() WHERE project_id=$1",
        [projectId],
        client,
      );
      return {
        item: (await readTopics(projectId, client)).find(
          (t) => t.id === topicId,
        ),
      };
    }
    if (action === "archive-topic") {
      const topic = topics.find((t) => t.id === input.id);
      if (!topic) throw new ApiError(404, "Topic not found");
      if (topic.revision !== input.revision)
        throw new ApiError(409, "This topic has changed. Reload first.");
      if (topics.some((t) => t.active && t.prerequisiteIds.includes(topic.id)))
        throw new ApiError(
          409,
          "Remove this topic from active prerequisites before archiving it.",
        );
      await query(
        "UPDATE curriculum_topics SET active=false,revision=revision+1,updated_at=now() WHERE project_id=$1 AND id=$2",
        [projectId, topic.id],
        client,
      );
      await query(
        "UPDATE project_curriculum SET revision=revision+1 WHERE project_id=$1",
        [projectId],
        client,
      );
      return { archived: true };
    }
    throw new ApiError(400, "Unknown curriculum action");
  });
}
async function changeVersion(projectId: string, input: any, apply: boolean) {
  const parsed = z
    .object({
      revision: z.number().int().positive(),
      templateId: z.string(),
      versionLabel: z.string().trim().min(1).max(100),
      topics: z
        .array(
          z.object({
            code: z.string().trim().min(1).max(150),
            title: z.string().trim().min(1).max(200),
            subject: z.string().trim().min(1).max(200),
          }),
        )
        .min(1)
        .max(500),
      mapping: z.record(z.string(), z.string().nullable()),
    })
    .parse(input);
  if (!curriculumTemplates.some((t) => t.id === parsed.templateId))
    throw new ApiError(400, "Select a supported project template.");
  return transaction(async (client) => {
    await query(
      "SELECT id FROM projects WHERE id=$1 FOR UPDATE",
      [projectId],
      client,
    );
    const config = await assertRevision(projectId, client, parsed.revision);
    const old = await readTopics(projectId, client),
      active = old.filter((t) => t.active);
    const errors = validateTopicMapping(active, parsed.topics, parsed.mapping);
    if (errors.length)
      throw new ApiError(
        400,
        "Review the topic mapping before applying",
        errors,
      );
    const assigned = Object.values(parsed.mapping).filter(Boolean),
      preview = {
        mapped: assigned.length,
        added: parsed.topics.filter((t) => !assigned.includes(t.code)).length,
        historical: active
          .filter((t) => parsed.mapping[t.id] === null)
          .map((t) => t.title),
        preservedAttemptCount: Number(
          (
            await query(
              "SELECT count(*) FROM attempts WHERE project_id=$1",
              [projectId],
              client,
            )
          ).rows[0].count,
        ),
        versionLabel: parsed.versionLabel,
      };
    if (!apply) return { preview };
    // Temporarily rename active codes to avoid unique collisions during reviewed remapping.
    for (const oldTopic of active)
      await query(
        "UPDATE curriculum_topics SET code=$3,active=false WHERE project_id=$1 AND id=$2",
        [projectId, oldTopic.id, `historical-${oldTopic.id}`],
        client,
      );
    for (const target of parsed.topics) {
      const mappedId = Object.entries(parsed.mapping).find(
        ([, code]) => code === target.code,
      )?.[0];
      if (mappedId)
        await query(
          "UPDATE curriculum_topics SET code=$3,title=$4,subject=$5,active=true,revision=revision+1,updated_at=now() WHERE project_id=$1 AND id=$2",
          [projectId, mappedId, target.code, target.title, target.subject],
          client,
        );
      else
        await query(
          "INSERT INTO curriculum_topics(id,project_id,code,title,subject) VALUES($1,$2,$3,$4,$5)",
          [id("topic"), projectId, target.code, target.title, target.subject],
          client,
        );
    }
    await query(
      "UPDATE projects SET subjects=$2::jsonb,updated_at=now() WHERE id=$1",
      [
        projectId,
        JSON.stringify([...new Set(parsed.topics.map((t) => t.subject))]),
      ],
      client,
    );
    await query(
      "UPDATE project_curriculum SET template_id=$2,version_label=$3,revision=revision+1,updated_at=now() WHERE project_id=$1",
      [projectId, parsed.templateId, parsed.versionLabel],
      client,
    );
    await query(
      "INSERT INTO curriculum_changes(id,project_id,from_revision,to_revision,version_label,snapshot,mapping) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id("curriculum-change"),
        projectId,
        config.revision,
        config.revision + 1,
        parsed.versionLabel,
        JSON.stringify({ config, topics: old }),
        JSON.stringify(parsed.mapping),
      ],
      client,
    );
    return { applied: true, preview };
  });
}
export async function mutateAssessment(projectId: string, input: any) {
  await projectExists(projectId);
  return transaction(async (client) => {
    await query(
      "SELECT id FROM projects WHERE id=$1 FOR UPDATE",
      [projectId],
      client,
    );
    const items = await readAssessments(projectId, client),
      existing = input.id ? items.find((a) => a.id === input.id) : undefined;
    if (input.id && !existing)
      throw new ApiError(404, "Assessment not found in this project");
    if (existing && input.revision !== existing.revision)
      throw new ApiError(409, "This assessment changed. Reload before saving.");
    if (input.action === "delete") {
      if (!existing) throw new ApiError(400, "Choose an assessment to remove.");
      await query(
        "DELETE FROM course_assessments WHERE project_id=$1 AND id=$2",
        [projectId, existing.id],
        client,
      );
      return { deleted: true };
    }
    const data = assessmentSchema.parse(input);
    try {
      assessmentSummary([
        ...items.filter(
          (a) => a.id !== existing?.id && a.course === data.course,
        ),
        data,
      ]);
    } catch (e) {
      throw new ApiError(400, (e as Error).message);
    }
    const assessmentId = existing?.id ?? id("assessment");
    if (existing)
      await query(
        "UPDATE course_assessments SET title=$3,course=$4,weight=$5,max_mark=$6,mark=$7,revision=revision+1,updated_at=now() WHERE project_id=$1 AND id=$2",
        [
          projectId,
          assessmentId,
          data.title,
          data.course,
          data.weight,
          data.maxMark,
          data.mark,
        ],
        client,
      );
    else
      await query(
        "INSERT INTO course_assessments(id,project_id,title,course,weight,max_mark,mark) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          assessmentId,
          projectId,
          data.title,
          data.course,
          data.weight,
          data.maxMark,
          data.mark,
        ],
        client,
      );
    return {
      item: (await readAssessments(projectId, client)).find(
        (a) => a.id === assessmentId,
      ),
    };
  });
}
export async function curriculumHandler(
  request: Request,
  projectId: string,
  assessments = false,
) {
  try {
    await projectExists(projectId);
    if (request.method === "GET")
      return Response.json(await getCurriculum(projectId), {
        headers: { "Cache-Control": "no-store" },
      });
    if (!["PATCH", "POST"].includes(request.method))
      throw new ApiError(405, "Method not supported");
    if (Number(request.headers.get("content-length") ?? 0) > 200000)
      throw new ApiError(413, "Curriculum input is too large");
    let input;
    try {
      input = await request.json();
    } catch {
      throw new ApiError(400, "Provide valid JSON");
    }
    return Response.json(
      assessments
        ? await mutateAssessment(projectId, input)
        : await mutateCurriculum(projectId, input),
    );
  } catch (e) {
    if (e instanceof ApiError)
      return Response.json(
        { error: e.message, fields: e.fields },
        { status: e.status },
      );
    if (e instanceof z.ZodError)
      return Response.json(
        {
          error: "Check the highlighted curriculum fields.",
          fields: e.flatten(),
        },
        { status: 400 },
      );
    const error = e as { code?: string };
    if (["23503", "23505", "23514"].includes(error.code ?? ""))
      return Response.json(
        {
          error:
            "A topic code, prerequisite or assessment weight conflicts with this project.",
        },
        { status: 409 },
      );
    console.error("Curriculum request failed", error.code ?? "unknown");
    return Response.json(
      {
        error:
          "Could not save curriculum changes. Your edits remain available.",
      },
      { status: 500 },
    );
  }
}
