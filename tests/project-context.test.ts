import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  normalizeSubjects,
  parseSyllabusText,
  projectContextLabel,
  projectPresets,
} from "../src/domain/project-context";
import { selectTemplate, topicCode } from "../src/domain/curriculum";
import { projectSchema } from "../src/server/entities";
import { handleApi } from "../src/server/api";
import { identitySession } from "../src/server/identity";
import {
  studentContext,
  type StudentIdentity,
} from "../src/server/identity-context";
import { getCurriculum, mutateCurriculum } from "../src/server/curriculum";
import { pool, query } from "../src/server/db";

describe("Universal project context", () => {
  it("starts blank and accepts each project kind without science defaults", () => {
    const empty = projectSchema.parse({ name: "Learning pottery" });
    expect(empty.subjects).toEqual([]);
    expect(empty.projectKind).toBe("custom");
    expect(empty.syllabusText).toBe("");
    for (const projectKind of [
      "school",
      "exam",
      "course",
      "personal",
      "custom",
    ])
      expect(
        projectSchema.parse({ name: "My project", projectKind }).projectKind,
      ).toBe(projectKind);
    expect(
      projectSchema.safeParse({ name: "X", projectKind: "unrecognized" })
        .success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ name: "X", syllabusText: "a".repeat(201) })
        .success,
    ).toBe(false);
    expect(
      projectSchema.parse({
        name: "X",
        subjects: ["History", "history", "  English  "],
      }).subjects,
    ).toEqual(["history", "English"]);
  });
  it("keeps school and course subjects editable and labels the programming example", () => {
    for (const key of [
      "course",
      "grade12",
      "alevel",
      "school",
      "blank",
      "personal",
    ])
      expect(projectPresets.find((p) => p.id === key)?.subjects).toEqual([]);
    const programming = projectPresets.find((p) => p.id === "info1110")!;
    expect(programming.context.courseCode).toBe("INFO1110");
    expect(programming.context.institution).toBe("University of Sydney");
    expect(programming.subjects).toEqual(["Programming"]);
    expect(
      selectTemplate("Introductory programming", programming.context)
        .coverageStatus,
    ).toContain("Not an official");
    expect(selectTemplate("Conversation practice").id).toBe("custom-v1");
    expect(selectTemplate("History", { projectKind: "course" }).id).toBe(
      "university-v1",
    );
    expect(selectTemplate("Grade 12", { projectKind: "school" }).id).toBe(
      "boards-v1",
    );
    expect(
      projectContextLabel({
        courseCode: "INFO1110",
        academicYear: "Semester 1 2027",
        exam: "Programming",
      }),
    ).toBe("INFO1110 · Programming · Semester 1 2027");
  });
  it("imports explicit topic lines with bounded validation and Unicode preserved", () => {
    expect(
      parseSyllabusText(
        "- Programming | Functions\nProgramming | Functions\nLoops",
        "Programming",
      ),
    ).toEqual([
      { subject: "Programming", title: "Functions" },
      { subject: "Programming", title: "Loops" },
    ]);
    expect(() => parseSyllabusText("Subject | ")).toThrow("Line 1");
    expect(() =>
      parseSyllabusText(Array(301).fill("Topic").join("\n")),
    ).toThrow("300");
    expect(normalizeSubjects(" History, English, history, ")).toEqual([
      "history",
      "English",
    ]);
    expect(topicCode("日本語", "文法")).not.toBe("");
    expect(topicCode("日本語", "文法")).not.toBe(topicCode("日本語", "会話"));
  });
});

let identity: StudentIdentity,
  cookie = "",
  projectId = "",
  blankId = "";
const projectName = `Universal project test ${crypto.randomUUID()}`;
async function api(path: string, method = "GET", payload?: unknown) {
  const response = await handleApi(
    new Request(`http://localhost/api/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
    path.split("/"),
  );
  return { status: response.status, data: await response.json() };
}
const scoped = <T>(work: () => Promise<T>) =>
  studentContext.run(identity, work);
describe("Persisted universal projects without invented learning history", () => {
  beforeAll(async () => {
    const response = await identitySession(
      new Request("http://localhost/api/session", { method: "POST" }),
    );
    expect(response.status).toBeLessThan(300);
    identity = (await response.json()).student;
    cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  });
  afterAll(async () => {
    await query("DELETE FROM projects WHERE id=ANY($1::text[])", [
      [projectId, blankId].filter(Boolean),
    ]);
    if (identity && !identity.demo)
      await query("DELETE FROM demo_students WHERE id=$1", [identity.id]);
    await pool.end();
  });
  it("persists INFO1110 context but creates no questions, attempts, lessons or invented coverage", async () => {
    const result = await api("projects", "POST", {
      name: projectName,
      exam: "Introductory programming",
      projectKind: "course",
      institution: "University of Sydney",
      courseCode: "INFO1110",
      academicYear: "Semester 1 2027",
      level: "Undergraduate",
      learningGoal: "Write and debug small programs",
      subjects: ["Programming"],
      settings: { templateId: "programming-v1" },
    });
    expect(result.status).toBe(201);
    projectId = result.data.item.id;
    const saved = (await api(`projects/${projectId}`)).data.project;
    expect(saved).toMatchObject({
      projectKind: "course",
      institution: "University of Sydney",
      courseCode: "INFO1110",
      academicYear: "Semester 1 2027",
      learningGoal: "Write and debug small programs",
    });
    for (const table of [
      "questions",
      "attempts",
      "lessons",
      "resources",
      "test_sessions",
      "tasks",
      "flashcards",
    ]) {
      const result = await query(
        `SELECT count(*)::int AS count FROM ${table} WHERE project_id=$1`,
        [projectId],
      );
      expect(result.rows[0].count, table).toBe(0);
    }
    const curriculum = await scoped(() => getCurriculum(projectId));
    expect(curriculum.topics).toEqual([]);
    expect(curriculum.summary.totalTopics).toBe(0);
    expect(curriculum.template.templateId).toBe("programming-v1");
    const blank = await api("projects", "POST", {
      name: "An unrestricted personal project",
      projectKind: "personal",
    });
    blankId = blank.data.item.id;
    expect(blank.data.item.subjects).toEqual([]);
    expect((await scoped(() => getCurriculum(blankId))).topics).toEqual([]);
  });
  it("imports outlines additively and preserves coverage and attempts when metadata changes", async () => {
    const first = await scoped(() =>
      mutateCurriculum(projectId, {
        action: "import-outline",
        text: "Programming | Functions\nProgramming | Loops",
        defaultSubject: "Programming",
      }),
    );
    expect(first).toMatchObject({ added: 2 });
    const topic = (await scoped(() => getCurriculum(projectId))).topics.find(
      (t) => t.title === "Functions",
    )!;
    await scoped(() =>
      mutateCurriculum(projectId, {
        ...topic,
        coverage: "covered",
        action: "update-topic",
      }),
    );
    const question = (
      await api(`projects/${projectId}/questions`, "POST", {
        subject: "Programming",
        topic: "Functions",
        type: "single",
        prompt: "What can a function return?",
        options: ["A value", "Only comments"],
        answer: "A value",
        explanation: "A function can return a value.",
      })
    ).data.item;
    const attempt = await api(`projects/${projectId}/attempts`, "POST", {
      questionId: question.id,
      answer: "A value",
    });
    expect(attempt.status).toBeLessThan(300);
    const changes = await api(`projects/${projectId}`, "PATCH", {
      subjects: ["Software design"],
      qualification: "Student-defined course",
      academicYear: "Semester 2 2027",
    });
    expect(changes.status).toBe(200);
    const second = await scoped(() =>
      mutateCurriculum(projectId, {
        action: "import-outline",
        text: "Programming | Functions\nSoftware design | Testing",
        defaultSubject: "Software design",
      }),
    );
    expect(second).toMatchObject({ added: 1, existing: 1 });
    const retry = await scoped(() =>
      mutateCurriculum(projectId, {
        action: "import-outline",
        text: "Programming | Functions\nSoftware design | Testing",
      }),
    );
    expect(retry).toMatchObject({ added: 0, existing: 2 });
    const now = await scoped(() => getCurriculum(projectId));
    expect(now.topics).toHaveLength(3);
    expect(now.topics.find((t) => t.id === topic.id)?.coverage).toBe("covered");
    expect(now.topics.find((t) => t.title === "Loops")?.active).toBe(true);
    const kept = await query(
      "SELECT question_snapshot FROM attempts WHERE project_id=$1",
      [projectId],
    );
    expect(kept.rows).toHaveLength(1);
    expect(kept.rows[0].question_snapshot.subject).toBe("Programming");
    expect(
      (await api(`projects/${projectId}`)).data.project.syllabusText,
    ).toContain("Software design | Testing");
  });
  it("does not silently lose punctuation-distinct or non-Latin imported topics", async () => {
    const result = await scoped(() =>
      mutateCurriculum(blankId, {
        action: "import-outline",
        text: "Languages | A+B\nLanguages | A B\n日本語 | 文法\n日本語 | 会話",
      }),
    );
    expect(result).toMatchObject({ added: 4 });
    expect((await scoped(() => getCurriculum(blankId))).topics).toHaveLength(4);
  });
});
