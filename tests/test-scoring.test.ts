import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gradeAnswer, summarizeTestScore } from "../src/domain/grading";
import {
  addQuestion,
  createTest,
  getTest,
  submitTest,
  updateTest,
} from "../src/server/learning";
import { pool, query } from "../src/server/db";
describe("Automatic test-score semantics", () => {
  it("does not depress a perfect automatic subtotal with an ungraded free response", () => {
    const numerical = { type: "numerical" as const, answer: "4" },
      free = { type: "free" as const, answer: "Review rubric" };
    const totals = summarizeTestScore([
      ...Array.from({ length: 5 }, () => ({
        question: numerical,
        grade: gradeAnswer(numerical, "4"),
      })),
      { question: free, grade: gradeAnswer(free, "My explanation") },
    ]);
    expect(totals.automaticScore).toBe(20);
    expect(totals.automaticMaxScore).toBe(20);
    expect(totals.pendingSelfReviewCount).toBe(1);
    expect(totals.scoringComplete).toBe(false);
  });
  it("keeps an all-written test ungraded instead of claiming zero percent", () => {
    const q = { type: "free" as const, answer: "Rubric" };
    const totals = summarizeTestScore([
      { question: q, grade: gradeAnswer(q, "A reasoned answer") },
    ]);
    expect(totals.automaticMaxScore).toBe(0);
    expect(totals.automaticallyGradedQuestionCount).toBe(0);
    expect(totals.ungradedQuestionCount).toBe(1);
  });
  it("excludes unresolved numerical assessment while retaining deterministic blanks in the denominator", () => {
    const invalid = {
        type: "numerical" as const,
        answer: "unsupported symbolic key",
      },
      valid = { type: "numerical" as const, answer: "4" };
    const totals = summarizeTestScore([
      { question: invalid, grade: gradeAnswer(invalid, "4") },
      { question: valid, grade: gradeAnswer(valid, "") },
    ]);
    expect(totals.automaticMaxScore).toBe(4);
    expect(totals.pendingSelfReviewCount).toBe(1);
    expect(totals.automaticScore).toBe(0);
  });
});
const projectId = `scoring-test-${crypto.randomUUID()}`;
describe("Persisted automatic subtotals and legacy result interpretation", () => {
  beforeAll(async () => {
    await query(
      "INSERT INTO projects(id,student_id,name,exam,subjects) VALUES($1,'adi-demo','Test scoring integration fixture','Custom','[\"Physics\"]')",
      [projectId],
    );
  });
  afterAll(async () => {
    await query("DELETE FROM projects WHERE id=$1", [projectId]);
    await pool.end();
  });
  it("stores 4/4 plus a pending review, preserves an old 4/8 record without misleading the current subtotal", async () => {
    const q = await addQuestion(projectId, {
      subject: "Physics",
      topic: "Reasoning",
      type: "numerical",
      prompt: "What is 2 + 2?",
      answer: "4",
      explanation: "Four.",
    });
    const f = await addQuestion(projectId, {
      subject: "Physics",
      topic: "Reasoning",
      type: "free",
      prompt: "Explain your method.",
      answer: "Look for a reasoned method.",
      explanation: "Self-review rubric only.",
    });
    const session = await createTest(projectId, {
      questionIds: [q.id, f.id],
      count: 2,
      durationMinutes: 10,
    });
    await updateTest(projectId, session.id, { questionId: q.id, answer: "4" });
    await updateTest(projectId, session.id, {
      questionId: f.id,
      answer: "I grouped two pairs.",
    });
    const result = await submitTest(projectId, session.id);
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(4);
    expect(result.automaticScore).toBe(4);
    expect(result.automaticMaxScore).toBe(4);
    expect(result.pendingSelfReviewCount).toBe(1);
    expect(result.historicalScoreProvisional).toBe(false);
    expect((await submitTest(projectId, session.id)).attempts).toHaveLength(2);
    await query(
      "UPDATE test_sessions SET max_score=8 WHERE project_id=$1 AND id=$2",
      [projectId, session.id],
    );
    const legacy = await getTest(projectId, session.id);
    expect(legacy.maxScore).toBe(8);
    expect(legacy.automaticMaxScore).toBe(4);
    expect(legacy.historicalScoreProvisional).toBe(true);
    expect(
      Number(
        (
          await query(
            "SELECT max_score FROM test_sessions WHERE project_id=$1 AND id=$2",
            [projectId, session.id],
          )
        ).rows[0].max_score,
      ),
    ).toBe(8);
  });
});
