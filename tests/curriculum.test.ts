import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assessmentSummary,
  curriculumTemplates,
  hasPrerequisiteCycle,
  selectTemplate,
  validateTopicMapping,
} from "../src/domain/curriculum";
import {
  getCurriculum,
  mutateAssessment,
  mutateCurriculum,
} from "../src/server/curriculum";
import { pool, query } from "../src/server/db";
import { addQuestion, practiceAttempt } from "../src/server/learning";
describe("Curriculum domain invariants", () => {
  it("exposes universal, explicitly limited template families", () => {
    expect(curriculumTemplates).toHaveLength(11);
    expect(selectTemplate("JEE Main + Advanced").id).toBe("jee-combined-v1");
    expect(selectTemplate("NEET 2027").subjects).toContain("Biology");
    expect(selectTemplate("GMAT").subjects).toContain("Data Insights");
    expect(curriculumTemplates.every((t) => !!t.coverageStatus)).toBe(true);
  });
  it("rejects indirect prerequisite cycles but permits a shared foundation", () => {
    expect(hasPrerequisiteCycle({ a: ["b"], b: ["c"], c: ["a"] })).toBe(true);
    expect(hasPrerequisiteCycle({ a: ["c"], b: ["c"], c: [] })).toBe(false);
    expect(hasPrerequisiteCycle({ a: ["a"] })).toBe(true);
  });
  it("separates weighted points, completed performance and remaining work", () => {
    const r = assessmentSummary([
      { weight: 20, maxMark: 25, mark: 20 },
      { weight: 30, maxMark: 100, mark: null },
    ]);
    expect(r.earnedWeightedPoints).toBe(16);
    expect(r.performanceOnCompleted).toBe(80);
    expect(r.completedWeight).toBe(20);
    expect(r.remainingWeight).toBe(80);
    expect(r.unallocatedWeight).toBe(50);
  });
  it("does not infer results for ungraded work or impossible weight totals", () => {
    expect(
      assessmentSummary([{ weight: 50, maxMark: 100, mark: null }])
        .performanceOnCompleted,
    ).toBeNull();
    expect(() =>
      assessmentSummary([
        { weight: 60, maxMark: 100, mark: 90 },
        { weight: 50, maxMark: 100, mark: null },
      ]),
    ).toThrow();
    expect(() =>
      assessmentSummary([{ weight: 20, maxMark: 10, mark: 11 }]),
    ).toThrow();
  });
  it("requires an explicit one-to-one version mapping", () => {
    const old = [{ id: "a" }, { id: "b" }],
      targets = [{ code: "x", title: "New title", subject: "Maths" }];
    expect(validateTopicMapping(old, targets, { a: "x", b: null })).toEqual([]);
    expect(
      validateTopicMapping(old, targets, { a: "x", b: "x" }).length,
    ).toBeGreaterThan(0);
    expect(
      validateTopicMapping(old, targets, { a: "x" }).length,
    ).toBeGreaterThan(0);
  });
});
const pid = `curriculum-test-${crypto.randomUUID()}`,
  other = `curriculum-test-${crypto.randomUUID()}`;
describe("Persistent scoped curriculum and assessments", () => {
  beforeAll(async () => {
    for (const id of [pid, other])
      await query(
        "INSERT INTO projects(id,student_id,name,exam,subjects,syllabus_text) VALUES($1,'adi-demo','Curriculum integration fixture','University','[\"Engineering\"]','Engineering | Foundations')",
        [id],
      );
  });
  afterAll(async () => {
    await query("DELETE FROM projects WHERE id=ANY($1::text[])", [
      [pid, other],
    ]);
    await pool.end();
  });
  it("keeps explicit coverage and rejects cyclic/cross-project prerequisites", async () => {
    const d = await getCurriculum(pid);
    expect(d.topics.length).toBe(1);
    expect(d.summary.coveredTopics).toBe(0);
    const foundation = d.topics[0];
    const second = await mutateCurriculum(pid, {
      action: "add-topic",
      title: "Dynamics",
      subject: "Engineering",
      prerequisiteIds: [foundation.id],
    });
    await expect(
      mutateCurriculum(pid, {
        action: "update-topic",
        id: foundation.id,
        revision: foundation.revision,
        title: foundation.title,
        subject: foundation.subject,
        prerequisiteIds: ["item" in second ? second.item!.id : ""],
      }),
    ).rejects.toThrow("cycle");
    const otherTopic = (await getCurriculum(other)).topics[0];
    await expect(
      mutateCurriculum(pid, {
        action: "add-topic",
        title: "Outside",
        subject: "Engineering",
        prerequisiteIds: [otherTopic.id],
      }),
    ).rejects.toThrow("this project");
    await mutateCurriculum(pid, {
      action: "update-topic",
      id: foundation.id,
      revision: foundation.revision,
      title: foundation.title,
      subject: foundation.subject,
      coverage: "covered",
      confidence: "low",
      prerequisiteIds: [],
    });
    const changed = await getCurriculum(pid);
    expect(changed.summary.coveredTopics).toBe(1);
    expect(changed.topics.find((t) => t.id === foundation.id)?.confidence).toBe(
      "low",
    );
    await expect(
      mutateCurriculum(pid, {
        action: "update-topic",
        id: foundation.id,
        revision: foundation.revision,
        title: "Stale edit",
        subject: "Engineering",
      }),
    ).rejects.toThrow("changed");
  });
  it("previews and transactionally applies a reviewed version without deleting history", async () => {
    const question = await addQuestion(pid, {
      subject: "Engineering",
      topic: "Historical mechanics",
      type: "numerical",
      prompt: "Find 2 + 2.",
      answer: "4",
      explanation: "Addition gives four.",
    });
    const attempt = await practiceAttempt(pid, {
      questionId: question.id,
      answer: "4",
    });
    const d = await getCurriculum(pid),
      active = d.topics.filter((t) => t.active),
      first = active[0];
    const payload = {
      revision: d.template.revision,
      templateId: "university-v1",
      versionLabel: "Reviewed v2",
      topics: [
        {
          code: "mapped-topic",
          title: "Updated learning topic",
          subject: "Mathematics",
        },
      ],
      mapping: Object.fromEntries(
        active.map((t) => [t.id, t.id === first.id ? "mapped-topic" : null]),
      ),
    };
    const preview = await mutateCurriculum(pid, {
      ...payload,
      action: "preview-version",
    });
    expect("preview" in preview ? preview.preview.mapped : 0).toBe(1);
    expect((await getCurriculum(pid)).template.versionLabel).toBe("starter-v1");
    await mutateCurriculum(pid, { ...payload, action: "apply-version" });
    const after = await getCurriculum(pid);
    expect(after.template.versionLabel).toBe("Reviewed v2");
    expect(after.topics).toHaveLength(active.length);
    expect(after.topics.filter((t) => t.active)).toHaveLength(1);
    expect(after.topics.find((t) => t.id === first.id)?.title).toBe(
      "Updated learning topic",
    );
    const retained = (
      await query(
        "SELECT question_snapshot FROM attempts WHERE project_id=$1 AND id=$2",
        [pid, attempt.id],
      )
    ).rows[0];
    expect(retained.question_snapshot.prompt).toBe("Find 2 + 2.");
    expect(retained.question_snapshot.subject).toBe("Engineering");
    expect(
      (await query("SELECT subjects FROM projects WHERE id=$1", [pid])).rows[0]
        .subjects,
    ).toEqual(["Mathematics"]);
    await expect(
      mutateCurriculum(pid, { ...payload, action: "apply-version" }),
    ).rejects.toThrow("changed");
  });
  it("stores per-course assessments, enforces total weight and stale revision checks", async () => {
    const a = await mutateAssessment(pid, {
      title: "Assignment",
      course: "Mechanics",
      weight: 20,
      maxMark: 25,
      mark: 20,
    });
    await mutateAssessment(pid, {
      title: "Exam",
      course: "Mechanics",
      weight: 60,
      maxMark: 100,
      mark: null,
    });
    await expect(
      mutateAssessment(pid, {
        title: "Too much",
        course: "Mechanics",
        weight: 30,
        maxMark: 100,
        mark: null,
      }),
    ).rejects.toThrow("100%");
    await mutateAssessment(pid, {
      title: "Other course exam",
      course: "Maths",
      weight: 100,
      maxMark: 100,
      mark: null,
    });
    const result = await getCurriculum(pid);
    expect(
      result.summary.courses.find((c) => c.course === "Mechanics")
        ?.earnedWeightedPoints,
    ).toBe(16);
    await expect(
      mutateAssessment(other, {
        id: a.item!.id,
        revision: 1,
        title: "Wrong project",
        course: "Mechanics",
        weight: 20,
        maxMark: 25,
        mark: 20,
      }),
    ).rejects.toThrow("not found");
    await mutateAssessment(pid, {
      id: a.item!.id,
      revision: a.item!.revision,
      title: "Assignment",
      course: "Mechanics",
      weight: 20,
      maxMark: 25,
      mark: 21,
    });
    await expect(
      mutateAssessment(pid, {
        id: a.item!.id,
        revision: a.item!.revision,
        title: "Stale",
        course: "Mechanics",
        weight: 20,
        maxMark: 25,
        mark: 22,
      }),
    ).rejects.toThrow("changed");
  });
  it("database constraints independently reject cyclic prerequisites and excessive course weight", async () => {
    const topics = (await getCurriculum(pid)).topics;
    const pair = topics.slice(0, 2);
    await query("DELETE FROM curriculum_prerequisites WHERE project_id=$1", [
      pid,
    ]);
    await query(
      "INSERT INTO curriculum_prerequisites(project_id,topic_id,prerequisite_id) VALUES($1,$2,$3)",
      [pid, pair[0].id, pair[1].id],
    );
    await expect(
      query(
        "INSERT INTO curriculum_prerequisites(project_id,topic_id,prerequisite_id) VALUES($1,$2,$3)",
        [pid, pair[1].id, pair[0].id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      query(
        "INSERT INTO course_assessments(id,project_id,title,course,weight,max_mark) VALUES($1,$2,'Invalid','Maths',1,100)",
        [crypto.randomUUID(), pid],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
