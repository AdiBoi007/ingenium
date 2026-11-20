import { id, transaction } from "../src/server/db";
import { insertRow } from "../src/server/entities";
import { computeModel } from "../src/domain/science";
export async function seedExtras() {
  return transaction(async (client) => {
    if (
      (
        await client.query(
          "SELECT key FROM demo_metadata WHERE key='seed-v2' FOR UPDATE",
        )
      ).rowCount
    )
      return;
    const meta = (
      await client.query("SELECT value FROM demo_metadata WHERE key='seed-v1'")
    ).rows[0]?.value;
    if (!meta) return;
    const anchor = meta.anchoredDate;
    const questions = (
      await client.query(
        "SELECT * FROM questions WHERE project_id='jee-2027' ORDER BY id LIMIT 5",
      )
    ).rows;
    const test = await insertRow(
      "test_sessions",
      {
        id: "jee-demo-test",
        projectId: "jee-2027",
        title: "Mechanics check-in · sample custom test",
        deadline: new Date(Date.now() + 3600000).toISOString(),
      },
      client,
    );
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await insertRow(
        "test_items",
        {
          id: id("sample-ti"),
          projectId: "jee-2027",
          sessionId: test.id,
          questionId: q.id,
          position: i,
          snapshot: JSON.stringify(q),
          response: i === 0 ? JSON.stringify(q.answer) : null,
          flagged: i === 1,
        },
        client,
      );
    }
    await insertRow(
      "resources",
      {
        id: "jee-practice-mechanics",
        projectId: "jee-2027",
        title: "Mechanics check-in",
        type: "question-collection",
        subject: "Physics",
        description: "5 original practice questions",
        content:
          "A short original question collection about motion and forces.",
        metadata: {
          questionIds: questions.map((q) => q.id),
          source: "Ingenium original",
          sample: true,
        },
      },
      client,
    );
    await insertRow(
      "resources",
      {
        id: "jee-motion-collection",
        projectId: "jee-2027",
        title: "See motion differently",
        type: "lesson-collection",
        subject: "Physics",
        description: "Two ideas. A stronger foundation.",
        content: "Verified external lessons from CrashCourse.",
        metadata: { lessonIds: ["jee-lesson-motion", "jee-lesson-newton"] },
      },
      client,
    );
    for (const aid of ["jee-projectile", "jee-projectile-variation"]) {
      const row = (
        await client.query(
          "SELECT * FROM artifacts WHERE id=$1 AND revision=1",
          [aid],
        )
      ).rows[0];
      if (row) {
        const payload = {
          ...row.payload,
          result: computeModel("projectile", row.payload.parameters),
        };
        await client.query(
          "UPDATE artifacts SET payload=$2,revision=2 WHERE id=$1",
          [aid, JSON.stringify(payload)],
        );
        await insertRow(
          "artifact_revisions",
          {
            id: id("revision"),
            projectId: "jee-2027",
            artifactId: aid,
            revision: 2,
            payload,
          },
          client,
        );
      }
    }
    const due = new Date(anchor + "T12:00:00Z");
    due.setUTCDate(due.getUTCDate() + 3);
    await insertRow(
      "review_events",
      {
        id: "sample-review-1",
        projectId: "jee-2027",
        cardId: "jee-2027-card-2",
        rating: "good",
        intervalDays: 3,
        nextDue: due.toISOString().slice(0, 10),
        createdAt: anchor + "T00:00:00Z",
      },
      client,
    );
    await client.query(
      "UPDATE flashcards SET review_count=1,interval_days=3,last_review=$1,due_date=$2 WHERE id='jee-2027-card-2' AND review_count=0",
      [anchor + "T00:00:00Z", due.toISOString().slice(0, 10)],
    );
    await client.query(
      "INSERT INTO demo_metadata(key,value)VALUES('seed-v2',$1)",
      [
        JSON.stringify({
          version: 2,
          added:
            "resumable custom test, review history, question and lesson collections",
          date: anchor,
        }),
      ],
    );
  });
}
