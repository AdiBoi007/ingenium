import { z } from "zod";
import {
  ApiError,
  camel,
  id,
  query,
  requireTool,
  scoped,
  transaction,
} from "./db";
import { insertRow } from "./entities";
import {
  gradeAnswer,
  scheduleReview,
  summarizeTestScore,
} from "../domain/grading";
import type { PoolClient } from "pg";
import { getCurriculum } from "./curriculum";
const questionSchema = z.object({
  subject: z.string().min(1).max(200),
  topic: z.string().min(1).max(200),
  type: z.enum(["single", "multiple", "numerical", "free"]),
  prompt: z.string().min(1).max(12000),
  options: z.array(z.string()).max(12).default([]),
  answer: z.union([z.string(), z.array(z.string()), z.number()]),
  explanation: z.string().max(12000).default(""),
  hint: z.string().max(3000).default(""),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).default("Medium"),
  unit: z.string().max(30).optional(),
  tolerance: z.number().nonnegative().optional(),
  source: z.string().default("Student original"),
  reviewStatus: z.string().default("reviewed"),
  examTags: z.array(z.string()).default([]),
});
export function publicQuestion(row: any) {
  const q = camel(row);
  delete q.answer;
  delete q.explanation;
  return q;
}
export async function questions(projectId: string, params: URLSearchParams) {
  const values: unknown[] = [projectId];
  const clauses = ["project_id=$1"];
  for (const key of ["subject", "topic", "difficulty", "type"])
    if (params.get(key)) {
      values.push(params.get(key));
      clauses.push(`${key}=$${values.length}`);
    }
  if (params.get("q")) {
    values.push("%" + params.get("q") + "%");
    clauses.push(
      `(prompt ILIKE $${values.length} OR topic ILIKE $${values.length})`,
    );
  }
  if (params.get("filter") === "bookmarked") clauses.push("bookmarked=true");
  if (params.get("filter") === "unattempted")
    clauses.push(
      "NOT EXISTS(SELECT 1 FROM attempts a WHERE a.question_id=questions.id)",
    );
  if (params.get("filter") === "incorrect")
    clauses.push(
      "EXISTS(SELECT 1 FROM attempts a WHERE a.question_id=questions.id AND a.status='incorrect')",
    );
  const offset = Math.max(0, Number(params.get("offset") || 0));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") || 60)));
  return (
    await query(
      `SELECT * FROM questions WHERE ${clauses.join(" AND ")} ORDER BY created_at,id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    )
  ).rows.map(publicQuestion);
}
export async function addQuestion(
  projectId: string,
  body: unknown,
  client?: PoolClient,
) {
  const parsed = questionSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(400, "Invalid question", parsed.error.flatten());
  const value = parsed.data;
  if (value.type === "numerical" && !Number.isFinite(Number(value.answer)))
    throw new ApiError(
      400,
      "Numerical questions require a finite numerical answer",
    );
  if (value.type === "single" && !value.options.includes(String(value.answer)))
    throw new ApiError(400, "The answer must match one of the options");
  if (
    value.type === "multiple" &&
    (!Array.isArray(value.answer) ||
      !value.answer.length ||
      value.answer.some((a) => !value.options.includes(a)))
  )
    throw new ApiError(
      400,
      "Multiple-choice answers must match the available options",
    );
  const q = await insertRow(
    "questions",
    { id: id("question"), projectId, ...parsed.data },
    client,
  );
  await insertRow(
    "question_versions",
    {
      id: id("qv"),
      projectId,
      questionId: q.id,
      version: 1,
      snapshot: JSON.stringify(q),
    },
    client,
  );
  return publicQuestion(q);
}
export async function importQuestions(projectId: string, body: any) {
  if (!Array.isArray(body.items) || body.items.length > 500)
    throw new ApiError(400, "Provide at most 500 questions");
  const prompts = body.items.map((q: any) =>
    typeof q.prompt === "string" ? q.prompt : "",
  );
  const existing = (
    await query(
      "SELECT prompt FROM questions WHERE project_id=$1 AND prompt=ANY($2::text[])",
      [projectId, prompts],
    )
  ).rows;
  const seen = new Set(existing.map((row) => row.prompt));
  const report = body.items.map((q: any, index: number) => {
    const parsed = questionSchema.safeParse(q);
    const duplicate = seen.has(q.prompt);
    seen.add(q.prompt);
    return {
      index,
      valid: parsed.success,
      duplicate,
      errors: parsed.success
        ? []
        : parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message),
    };
  });
  if (body.preview !== false)
    return {
      report,
      valid: report.every((r: any) => r.valid),
      count: body.items.length,
      duplicates: report.filter((r: any) => r.duplicate).length,
      duplicatePolicy: "skip exact duplicate prompts in this project",
    };
  if (report.some((r: any) => !r.valid))
    throw new ApiError(400, "Fix invalid questions before importing", report);
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      projectId + ":question-import",
    ]);
    const items = [];
    let skipped = 0;
    for (const q of body.items) {
      const found = await query(
        "SELECT id FROM questions WHERE project_id=$1 AND prompt=$2 LIMIT 1",
        [projectId, q.prompt],
        client,
      );
      if (found.rowCount) {
        skipped++;
        continue;
      }
      items.push(await addQuestion(projectId, q, client));
    }
    return { items, count: items.length, skipped };
  });
}
export async function saveAttempt(
  projectId: string,
  body: any,
  client?: PoolClient,
  snapshotOverride?: any,
) {
  const schema = z.object({
    questionId: z.string().min(1),
    answer: z
      .union([z.string(), z.number(), z.array(z.string())])
      .nullable()
      .optional(),
    hintUsed: z.boolean().default(false),
    revealed: z.boolean().default(false),
    elapsedSeconds: z.number().min(0).max(86400).default(0),
    idempotencyKey: z.string().max(200).optional(),
    sessionId: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(400, "Invalid answer", parsed.error.flatten());
  const input = parsed.data;
  if (input.idempotencyKey) {
    const existing = await query(
      "SELECT * FROM attempts WHERE project_id=$1 AND idempotency_key=$2",
      [projectId, input.idempotencyKey],
      client,
    );
    if (existing.rows[0]) return attemptResponse(existing.rows[0]);
  }
  const row = await scoped("questions", projectId, input.questionId, client);
  const snapshot = snapshotOverride ?? camel(row);
  const grade = gradeAnswer(snapshot, input.answer ?? "");
  const data = {
    id: id("attempt"),
    projectId,
    questionId: input.questionId,
    questionVersion: snapshot.version,
    questionSnapshot: JSON.stringify(snapshot),
    sessionId: input.sessionId ?? null,
    answer: input.answer ?? null,
    status: grade.status,
    correct: grade.correct,
    score: grade.score,
    hintUsed: input.hintUsed,
    revealed: input.revealed,
    elapsedSeconds: input.elapsedSeconds,
    idempotencyKey: input.idempotencyKey ?? null,
  };
  const item = await insertRow("attempts", data, client);
  if (grade.status === "incorrect" || grade.status === "malformed")
    await insertRow(
      "mistakes",
      {
        id: id("mistake"),
        projectId,
        attemptId: item.id,
        questionId: input.questionId,
      },
      client,
    );
  await insertRow(
    "learning_events",
    {
      id: id("event"),
      projectId,
      type: "question-attempt",
      subject: snapshot.subject,
      referenceId: item.id,
      payload: {
        correct: grade.correct,
        assisted: input.hintUsed || input.revealed,
      },
    },
    client,
  );
  return attemptResponse(item);
}
function attemptResponse(row: any) {
  const a = camel(row);
  const snapshot = a.questionSnapshot;
  return {
    ...a,
    expectedAnswer: snapshot.answer,
    explanation: snapshot.explanation,
    subject: snapshot.subject,
    topic: snapshot.topic,
    prompt: snapshot.prompt,
  };
}
export async function practiceAttempt(projectId: string, body: any) {
  await requireTool(projectId, "practise");
  return transaction(async (client) => {
    if (body.idempotencyKey)
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        projectId + body.idempotencyKey,
      ]);
    return saveAttempt(projectId, body, client);
  });
}
export async function createTest(projectId: string, body: any) {
  await requireTool(projectId, "test");
  const parsed = z
    .object({
      questionIds: z.array(z.string()).max(100).optional(),
      subject: z.string().optional(),
      count: z.number().int().min(1).max(100).default(5),
      durationMinutes: z.number().int().min(1).max(240).default(15),
      title: z.string().max(200).default("Custom practice test"),
    })
    .safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      400,
      "Invalid test configuration",
      parsed.error.flatten(),
    );
  const input = parsed.data;
  return transaction(async (client) => {
    const rows = (
      await query(
        `SELECT * FROM questions WHERE project_id=$1 ${input.questionIds ? "AND id=ANY($2::text[])" : input.subject ? "AND subject=$2" : ""} ORDER BY id LIMIT ${input.count}`,
        [
          projectId,
          ...(input.questionIds
            ? [input.questionIds]
            : input.subject
              ? [input.subject]
              : []),
        ],
        client,
      )
    ).rows;
    if (!rows.length)
      throw new ApiError(
        400,
        "No eligible questions in this project. Add questions first.",
      );
    const session = await insertRow(
      "test_sessions",
      {
        id: id("test"),
        projectId,
        title: input.title,
        deadline: new Date(
          Date.now() + input.durationMinutes * 60000,
        ).toISOString(),
      },
      client,
    );
    for (let i = 0; i < rows.length; i++)
      await insertRow(
        "test_items",
        {
          id: id("ti"),
          projectId,
          sessionId: session.id,
          questionId: rows[i].id,
          position: i,
          snapshot: JSON.stringify(camel(rows[i])),
        },
        client,
      );
    return getTest(projectId, session.id, client);
  });
}
export async function getTest(
  projectId: string,
  sessionId: string,
  client?: PoolClient,
): Promise<any> {
  const session = camel(
    await scoped("test_sessions", projectId, sessionId, client),
  );
  if (
    session.status === "active" &&
    new Date(session.deadline).getTime() <= Date.now() &&
    !client
  )
    return submitTest(projectId, sessionId);
  const items = (
    await query(
      "SELECT * FROM test_items WHERE project_id=$1 AND session_id=$2 ORDER BY position",
      [projectId, sessionId],
      client,
    )
  ).rows;
  const responses: Record<string, unknown> = {};
  for (const item of items)
    responses[item.question_id] = {
      answer: item.response,
      flagged: item.flagged,
    };
  const attempts =
    session.status === "submitted"
      ? (
          await query(
            "SELECT * FROM attempts WHERE project_id=$1 AND session_id=$2 ORDER BY created_at",
            [projectId, sessionId],
            client,
          )
        ).rows.map(attemptResponse)
      : [];
  const scoreSummary =
    session.status === "submitted"
      ? summarizeTestScore(
          items.map((item) => ({
            question: item.snapshot,
            grade: attempts.find(
              (attempt: any) => attempt.questionId === item.question_id,
            ),
          })),
          session.policy,
        )
      : undefined;
  return {
    ...session,
    ...(scoreSummary ?? {}),
    historicalScoreProvisional: Boolean(
      scoreSummary &&
      (Number(session.maxScore) !== scoreSummary.automaticMaxScore ||
        Number(session.score) !== scoreSummary.automaticScore),
    ),
    questions: items.map((item) =>
      session.status === "submitted"
        ? item.snapshot
        : publicQuestion(item.snapshot),
    ),
    responses,
    attempts,
    remainingSeconds: Math.max(
      0,
      Math.floor((new Date(session.deadline).getTime() - Date.now()) / 1000),
    ),
    policy: session.policy,
  };
}
export async function updateTest(
  projectId: string,
  sessionId: string,
  body: any,
) {
  return transaction(async (client) => {
    const result = await query(
      "SELECT * FROM test_sessions WHERE project_id=$1 AND id=$2 FOR UPDATE",
      [projectId, sessionId],
      client,
    );
    const session = result.rows[0];
    if (!session) throw new ApiError(404, "Test not found");
    if (session.status !== "active")
      throw new ApiError(409, "This test has already been submitted");
    if (new Date(session.deadline).getTime() <= Date.now())
      throw new ApiError(
        409,
        "The test deadline has passed. Submit to see your result.",
      );
    const parsed = z
      .object({
        questionId: z.string(),
        answer: z
          .union([z.string(), z.number(), z.array(z.string())])
          .nullable()
          .optional(),
        flagged: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new ApiError(400, "Invalid test response");
    const input = parsed.data;
    const updated = await query(
      "UPDATE test_items SET response=CASE WHEN $4 THEN $5::jsonb ELSE response END,flagged=COALESCE($6,flagged) WHERE project_id=$1 AND session_id=$2 AND question_id=$3 RETURNING id",
      [
        projectId,
        sessionId,
        input.questionId,
        "answer" in input,
        JSON.stringify(input.answer ?? null),
        input.flagged ?? null,
      ],
      client,
    );
    if (!updated.rowCount)
      throw new ApiError(404, "Question is not part of this test");
    return getTest(projectId, sessionId, client);
  });
}
export async function submitTest(
  projectId: string,
  sessionId: string,
): Promise<any> {
  return transaction(async (client) => {
    const found = await query(
      "SELECT * FROM test_sessions WHERE project_id=$1 AND id=$2 FOR UPDATE",
      [projectId, sessionId],
      client,
    );
    if (!found.rows[0]) throw new ApiError(404, "Test not found");
    if (found.rows[0].status === "submitted")
      return getTest(projectId, sessionId, client);
    const items = (
      await query(
        "SELECT * FROM test_items WHERE project_id=$1 AND session_id=$2 ORDER BY position",
        [projectId, sessionId],
        client,
      )
    ).rows;
    const gradedItems = [];
    for (const item of items) {
      const attempt = await saveAttempt(
        projectId,
        {
          questionId: item.question_id,
          answer: item.response,
          sessionId,
          idempotencyKey: `${sessionId}:${item.question_id}`,
        },
        client,
        item.snapshot,
      );
      gradedItems.push({ question: item.snapshot, grade: attempt });
    }
    const totals = summarizeTestScore(gradedItems, found.rows[0].policy);
    await query(
      "UPDATE test_sessions SET status='submitted',submitted_at=now(),score=$3,max_score=$4 WHERE project_id=$1 AND id=$2",
      [projectId, sessionId, totals.automaticScore, totals.automaticMaxScore],
      client,
    );
    return getTest(projectId, sessionId, client);
  });
}
export async function reviewCard(projectId: string, body: any) {
  const parsed = z
    .object({
      cardId: z.string(),
      rating: z.enum(["again", "hard", "good", "easy"]),
    })
    .safeParse(body);
  if (!parsed.success)
    throw new ApiError(400, "Choose a card and a review rating");
  const { cardId, rating } = parsed.data;
  return transaction(async (client) => {
    const found = await query(
      "SELECT * FROM flashcards WHERE project_id=$1 AND id=$2 FOR UPDATE",
      [projectId, cardId],
      client,
    );
    if (!found.rows[0]) throw new ApiError(404, "Card not found");
    const card = found.rows[0];
    const scheduling = scheduleReview(rating, card.interval_days);
    const interval = scheduling.intervalDays;
    const date = scheduling.dueAt.slice(0, 10);
    await insertRow(
      "review_events",
      {
        id: id("review"),
        projectId,
        cardId,
        rating,
        intervalDays: interval,
        nextDue: date,
      },
      client,
    );
    const result = await query(
      "UPDATE flashcards SET interval_days=$3,due_date=$4,review_count=review_count+1,last_review=now() WHERE project_id=$1 AND id=$2 RETURNING *",
      [projectId, cardId, interval, date],
      client,
    );
    return camel(result.rows[0]);
  });
}
export async function progress(projectId: string) {
  const attempts = (
    await query(
      "SELECT * FROM attempts WHERE project_id=$1 ORDER BY created_at DESC LIMIT 500",
      [projectId],
    )
  ).rows.map(attemptResponse);
  const assessed = attempts.filter(
    (a) =>
      ["correct", "incorrect"].includes(a.status) && !a.hintUsed && !a.revealed,
  );
  const correct = assessed.filter((a) => a.correct).length;
  const subjects = Object.values(
    attempts.reduce((acc: any, a) => {
      const s = a.subject;
      acc[s] ??= {
        subject: s,
        attempts: 0,
        assessedAttempts: 0,
        correct: 0,
        assisted: 0,
      };
      acc[s].attempts++;
      if (
        ["correct", "incorrect"].includes(a.status) &&
        !a.hintUsed &&
        !a.revealed
      )
        acc[s].assessedAttempts++;
      if (a.correct && !a.hintUsed && !a.revealed) acc[s].correct++;
      if (a.hintUsed || a.revealed) acc[s].assisted++;
      return acc;
    }, {}),
  ) as any[];
  for (const subject of subjects) {
    subject.accuracy = subject.assessedAttempts
      ? Math.round((subject.correct / subject.assessedAttempts) * 100)
      : 0;
    subject.label =
      subject.attempts < 5
        ? "Insufficient evidence"
        : subject.accuracy < 60
          ? "Needs practice"
          : "Improving";
  }
  const mistakes = (
    await query(
      "SELECT m.*,q.prompt,q.explanation,q.answer AS expected_answer,q.subject,q.topic,a.answer AS student_answer FROM mistakes m JOIN questions q ON q.id=m.question_id JOIN attempts a ON a.id=m.attempt_id WHERE m.project_id=$1 ORDER BY m.created_at DESC",
      [projectId],
    )
  ).rows.map(camel);
  const counts = (
    await query(
      "SELECT (SELECT count(*) FROM tasks WHERE project_id=$1 AND status='completed') AS completed_tasks,(SELECT count(*) FROM lessons WHERE project_id=$1 AND completed=true) AS watched_lessons,(SELECT COALESCE(sum(elapsed_seconds),0) FROM focus_sessions WHERE project_id=$1) AS focus_seconds,(SELECT count(*) FROM review_events WHERE project_id=$1) AS reviews,(SELECT count(*) FROM flashcards WHERE project_id=$1 AND due_date<=current_date AND suspended=false) AS due_reviews",
      [projectId],
    )
  ).rows[0];
  const sampleMeta = ["jee-2027", "neet-2027", "gmat", "engineering"].includes(
    projectId,
  )
    ? (await query("SELECT value FROM demo_metadata WHERE key='seed-v1'"))
        .rows[0]?.value
    : null;
  const curriculum = await getCurriculum(projectId);
  return {
    sampleAnchor: sampleMeta?.anchoredDate ?? null,
    coverage: curriculum.summary.coveragePercent,
    coverageTopics: curriculum.summary,
    attempts: attempts.length,
    assessedAttempts: assessed.length,
    correct,
    accuracy: assessed.length
      ? Math.round((correct / assessed.length) * 100)
      : 0,
    subjects,
    recentAttempts: attempts,
    mistakes,
    studyMinutes: Math.round(Number(counts.focus_seconds) / 60),
    completedTasks: Number(counts.completed_tasks),
    watchedLessons: Number(counts.watched_lessons),
    reviews: Number(counts.reviews),
    dueReviews: Number(counts.due_reviews),
    unanswered: attempts.filter((a) => a.status === "blank").length,
    assisted: attempts.filter((a) => a.hintUsed || a.revealed).length,
    accuracyDefinition:
      "Correct unaided answers ÷ submitted unaided correct or incorrect answers. Blank, malformed, hinted and revealed responses are excluded.",
  };
}
