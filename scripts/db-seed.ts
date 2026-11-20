import "dotenv/config";
import { pool, id, transaction } from "../src/server/db";
import { insertRow } from "../src/server/entities";
import { originalQuestions } from "../src/domain/question-seed";
import { gradeAnswer } from "../src/domain/grading";
import { seedExtras } from "./db-seed-extras";
const already = await pool.query(
  "SELECT value FROM demo_metadata WHERE key='seed-v1'",
);
if (already.rowCount) {
  await seedExtras();
  console.log("Demo seed already exists; all student changes preserved.");
  await pool.end();
  process.exit(0);
}
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const shift = (days: number) => {
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
await transaction(async (client) => {
  await insertRow(
    "demo_students",
    {
      id: "adi-demo",
      name: "Adi — demo",
      preferences: JSON.stringify({ theme: "light" }),
    },
    client,
  );
  const projects = [
    {
      id: "jee-2027",
      name: "JEE 2027",
      exam: "JEE Main + Advanced",
      subjects: ["Physics", "Chemistry", "Maths"],
      description: "A little progress, every day.",
      accent: "blue",
      pinned: true,
      targetDate: "2027-04-15",
    },
    {
      id: "neet-2027",
      name: "NEET 2027",
      exam: "NEET",
      subjects: ["Physics", "Chemistry", "Biology"],
      description: "Build your understanding. Find your confidence.",
      accent: "sage",
      pinned: false,
      targetDate: "2027-05-02",
    },
    {
      id: "gmat",
      name: "GMAT Focus",
      exam: "GMAT",
      subjects: ["Quantitative Reasoning", "Verbal Reasoning", "Data Insights"],
      description: "Make room for your next chapter.",
      accent: "sand",
      pinned: false,
      targetDate: null,
    },
    {
      id: "engineering",
      name: "Engineering, semester 1",
      exam: "University / Custom",
      subjects: ["Engineering", "Mathematics", "Mechanics"],
      description: "Lecture notes, assignments and the ideas between.",
      accent: "lavender",
      pinned: false,
      targetDate: null,
    },
  ];
  for (const p of projects)
    await insertRow(
      "projects",
      {
        ...p,
        studentId: "adi-demo",
        settings: {
          language: "English",
          tone: "Clear and encouraging",
          availableMinutes: 120,
          enabledTools: [
            "ask",
            "solve",
            "visualise",
            "practise",
            "test",
            "revise",
            "notes",
            "plan",
            "lessons",
            "progress",
            "sources",
            "updates",
          ],
          targetProvenance: "student-defined sample target",
          coverageStatus:
            "Illustrative topic coverage, not a complete official syllabus",
          overviewWidgets: ["continue", "plan", "watching", "resources"],
        },
      },
      client,
    );
  for (const p of projects) {
    const subject = p.subjects[0];
    const topics =
      p.id === "jee-2027"
        ? ["Electrostatics practice", "Chemical bonding", "Revise calculus"]
        : p.id === "neet-2027"
          ? ["Cell division review", "Chemical bonding", "Physics practice"]
          : p.id === "gmat"
            ? [
                "Quantitative reasoning",
                "Critical reasoning",
                "Data interpretation",
              ]
            : [
                "Statics tutorial",
                "Linear algebra review",
                "Prepare lab report",
              ];
    for (let i = 0; i < topics.length; i++)
      await insertRow(
        "tasks",
        {
          id: `${p.id}-task-${i + 1}`,
          projectId: p.id,
          title: topics[i],
          date: today,
          time: ["09:00", "10:00", "16:00"][i],
          duration: [30, 40, 25][i],
          subject: p.subjects[i] ?? subject,
          type: i === 2 ? "revision" : "study",
        },
        client,
      );
    await insertRow(
      "tasks",
      {
        id: `${p.id}-commitment`,
        projectId: p.id,
        title:
          p.id === "engineering" ? "Mechanics lecture" : "Weekly study group",
        date: shift(1),
        time: "14:00",
        duration: 60,
        subject,
        fixed: true,
        type: "commitment",
      },
      client,
    );
    await insertRow(
      "conversations",
      {
        id: `${p.id}-conversation`,
        projectId: p.id,
        title:
          p.id === "jee-2027"
            ? "Projectile motion"
            : p.id === "neet-2027"
              ? "Understanding inheritance"
              : p.id === "gmat"
                ? "Think through a word problem"
                : "Forces in equilibrium",
        subject,
        sample: true,
      },
      client,
    );
    await insertRow(
      "messages",
      {
        id: `${p.id}-message-user`,
        projectId: p.id,
        conversationId: `${p.id}-conversation`,
        role: "user",
        content:
          p.id === "jee-2027"
            ? "How do horizontal and vertical motion work together in a projectile?"
            : "Help me make a clear start with this topic.",
      },
      client,
    );
    await insertRow(
      "messages",
      {
        id: `${p.id}-message-assistant`,
        projectId: p.id,
        conversationId: `${p.id}-conversation`,
        role: "assistant",
        content:
          p.id === "jee-2027"
            ? "Sample explanation · A projectile combines constant horizontal velocity with vertically accelerated motion. In the ideal model, gravity changes only the vertical component. Try the interactive model: launch at 20 m/s, angle 30°, with g = 10 m/s². The flight takes 2 seconds, reaches a maximum height of 5 metres, and covers about 34.641 metres."
            : "Sample conversation · Start with one clear concept, test it with a question, and save what you learn. The tools in this workspace work without an AI connection.",
      },
      client,
    );
    const note = await insertRow(
      "resources",
      {
        id: `${p.id}-note`,
        projectId: p.id,
        title:
          p.id === "jee-2027"
            ? "Kinematics — the essentials"
            : `${subject} — getting started`,
        type: "note",
        subject,
        content:
          p.id === "jee-2027"
            ? "# Kinematics — the essentials\n\n## Separate the directions\n\nHorizontal: x = u cos(θ) t\nVertical: y = h + u sin(θ) t − ½gt²\n\n## Ground-level launch\n\n- Time of flight: T = 2u sin(θ)/g\n- Range: R = u² sin(2θ)/g\n- Maximum height: H = u² sin²(θ)/(2g)\n\nThese formulas assume uniform gravity, level ground, and no air resistance.\n\nOriginal Ingenium demo material."
            : "# A useful learning loop\n\n1. Read the question carefully.\n2. Write down what is given.\n3. Identify a useful model or principle.\n4. Work through one step at a time.\n5. Check units and the result.\n\nOriginal Ingenium demo material.",
        pinned: true,
      },
      client,
    );
    await insertRow(
      "resource_versions",
      {
        id: id("version"),
        projectId: p.id,
        resourceId: note.id,
        version: 1,
        content: note.content,
      },
      client,
    );
    await insertRow(
      "source_chunks",
      {
        id: id("chunk"),
        projectId: p.id,
        resourceId: note.id,
        version: 1,
        section: 1,
        content: note.content,
      },
      client,
    );
    await insertRow(
      "flashcards",
      {
        id: `${p.id}-card-1`,
        projectId: p.id,
        front:
          p.id === "jee-2027"
            ? "What remains constant in ideal projectile motion?"
            : p.id === "neet-2027"
              ? "What does a heterozygous genotype mean?"
              : "What should you check before trusting a numerical answer?",
        back:
          p.id === "jee-2027"
            ? "Horizontal velocity, because there is no horizontal force in the ideal no-drag model."
            : p.id === "neet-2027"
              ? "Two different alleles at a locus, for example Aa."
              : "The units, assumptions, sign and approximate order of magnitude.",
        subject,
        deck: "Essential ideas",
        dueDate: today,
      },
      client,
    );
    await insertRow(
      "flashcards",
      {
        id: `${p.id}-card-2`,
        projectId: p.id,
        front: "Why should a worked example be followed by a new question?",
        back: "Recognising a solution is different from retrieving and applying the method independently.",
        subject,
        deck: "Essential ideas",
        dueDate: today,
      },
      client,
    );
  }
  const bookResources = [
    {
      id: "jee-resource-ncert",
      title: "NCERT Chemistry",
      type: "book",
      subject: "Chemistry",
      description: "Book reference",
      content:
        "# NCERT Chemistry\n\nA reference to your own copy. No textbook content is hosted here.\n\nSuggested reading: chemical bonding, solutions and reaction kinetics. Add your own chapter notes below.",
      metadata: {
        author: "NCERT",
        edition: "Student-selected edition",
        volume: "Classes XI–XII",
        coverage: "Reference only",
      },
    },
    {
      id: "jee-resource-verma",
      title: "H. C. Verma · Mechanics",
      type: "book",
      subject: "Physics",
      description: "Book reference",
      content:
        "# Concepts of Physics · Mechanics\n\nA reference to your own copy of H. C. Verma’s book. No protected textbook pages are hosted.\n\nUse this space to track chapter and exercise references.",
      metadata: {
        author: "H. C. Verma",
        volume: "1",
        edition: "Student-selected edition",
      },
    },
    {
      id: "jee-resource-modules",
      title: "Coaching modules",
      type: "collection",
      subject: "Physics",
      description: "3 collections",
      content:
        "# Your coaching modules\n\n- Mechanics\n- Chemical bonding\n- Calculus\n\nAdd your own permitted material to the Library.",
      metadata: {
        collections: ["Mechanics", "Chemical bonding", "Calculus"],
        institute: "Sample coaching context",
      },
    },
  ];
  for (const item of bookResources) {
    const resource = await insertRow(
      "resources",
      { ...item, projectId: "jee-2027" },
      client,
    );
    await insertRow(
      "resource_versions",
      {
        id: id("version"),
        projectId: "jee-2027",
        resourceId: resource.id,
        version: 1,
        content: resource.content,
      },
      client,
    );
  }
  const lessons = [
    {
      id: "jee-lesson-newton",
      title: "Newton’s laws, made visual",
      subject: "Physics",
      topic: "Newton’s laws",
      videoId: "kKKM8Y-u7ds",
      channel: "CrashCourse",
      description:
        "Newton’s Laws: Crash Course Physics #5. An introduction to force and motion.",
      saved: true,
      position: 0,
    },
    {
      id: "jee-lesson-motion",
      title: "Motion in a straight line",
      subject: "Physics",
      topic: "Kinematics",
      videoId: "ZM8ECpBuQYE",
      channel: "CrashCourse",
      description: "Motion in a Straight Line: Crash Course Physics #1.",
      saved: true,
      position: 0,
    },
    {
      id: "jee-lesson-calculus",
      title: "The essence of calculus",
      subject: "Maths",
      topic: "Calculus",
      videoId: "WUvTyaaNkzM",
      channel: "3Blue1Brown",
      description:
        "The essence of calculus, introduced through visual intuition.",
      saved: false,
      position: 0,
    },
  ];
  for (const lesson of lessons)
    await insertRow(
      "lessons",
      {
        ...lesson,
        projectId: "jee-2027",
        metadata: {
          verifiedVia: "YouTube oEmbed",
          verifiedAt: new Date().toISOString(),
          originalTitle:
            lesson.id === "jee-lesson-newton"
              ? "Newton's Laws: Crash Course Physics #5"
              : lesson.id === "jee-lesson-motion"
                ? "Motion in a Straight Line: Crash Course Physics #1"
                : "The essence of calculus",
          durationStatus: "Unknown until player metadata loads",
        },
      },
      client,
    );
  await insertRow(
    "lessons",
    {
      ...lessons[1],
      id: "neet-lesson-motion",
      projectId: "neet-2027",
      metadata: {
        verifiedVia: "YouTube oEmbed",
        verifiedAt: new Date().toISOString(),
      },
    },
    client,
  );
  for (const source of originalQuestions) {
    const projectIds = source.examTags.includes("JEE")
      ? ["jee-2027", ...(source.examTags.includes("NEET") ? ["neet-2027"] : [])]
      : source.examTags.includes("NEET")
        ? ["neet-2027"]
        : source.examTags.includes("GMAT")
          ? ["gmat"]
          : ["engineering"];
    for (const projectId of projectIds) {
      const q = await insertRow(
        "questions",
        {
          ...source,
          id: `${projectId}-${source.id}`,
          projectId,
          options: source.options ?? [],
        },
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
    }
  }
  for (const projectId of ["jee-2027", "neet-2027", "gmat", "engineering"]) {
    const qs = (
      await client.query(
        "SELECT * FROM questions WHERE project_id=$1 ORDER BY id LIMIT 10",
        [projectId],
      )
    ).rows;
    for (let i = 0; i < Math.min(qs.length, 8); i++) {
      const raw = qs[i];
      const q: any = {
        ...raw,
        projectId,
        examTags: raw.exam_tags,
        reviewStatus: raw.review_status,
      };
      const answer = i % 3 === 0 ? "999" : i % 5 === 0 ? "" : raw.answer;
      const grade = gradeAnswer(q, answer);
      const date = shift(-(7 - i));
      const attempt = await insertRow(
        "attempts",
        {
          id: id("sample-attempt"),
          projectId,
          questionId: q.id,
          questionVersion: 1,
          questionSnapshot: JSON.stringify(q),
          answer,
          status: grade.status,
          correct: grade.correct,
          score: grade.score,
          hintUsed: i === 4,
          revealed: false,
          elapsedSeconds: 60 + i * 15,
          createdAt: date + "T05:00:00Z",
          idempotencyKey: `sample-${q.id}`,
        },
        client,
      );
      if (grade.status === "incorrect")
        await insertRow(
          "mistakes",
          {
            id: id("mistake"),
            projectId,
            attemptId: attempt.id,
            questionId: q.id,
            nextReview: today,
            reflection:
              "Synthetic sample attempt — review the method and try again.",
          },
          client,
        );
    }
    await insertRow(
      "focus_sessions",
      {
        id: id("sample-focus"),
        projectId,
        title: "Sample focus session",
        startedAt: shift(-1) + "T05:00:00Z",
        endedAt: shift(-1) + "T05:25:00Z",
        elapsedSeconds: 1500,
      },
      client,
    );
  }
  const payload = {
    schemaVersion: 1,
    modelId: "projectile",
    modelVersion: 1,
    originalInput: { speed: 20, angle: 30, gravity: 10, height: 0 },
    parameters: { speed: 20, angle: 30, gravity: 10, height: 0 },
    result: { flightTime: 2, range: 34.6410161514, maxHeight: 5 },
    savedAt: new Date().toISOString(),
  };
  for (const [aid, title, parameters] of [
    [
      "jee-projectile",
      "Projectile motion",
      { speed: 20, angle: 30, gravity: 10, height: 0 },
    ],
    [
      "jee-projectile-variation",
      "A higher launch angle",
      { speed: 20, angle: 45, gravity: 10, height: 0 },
    ],
  ] as const) {
    const artifact = await insertRow(
      "artifacts",
      {
        id: aid,
        projectId: "jee-2027",
        type: "simulation",
        title,
        payload: { ...payload, parameters },
        originalPayload: payload,
        conversationId: "jee-2027-conversation",
      },
      client,
    );
    await insertRow(
      "artifact_revisions",
      {
        id: id("revision"),
        projectId: "jee-2027",
        artifactId: artifact.id,
        revision: 1,
        payload: artifact.payload,
      },
      client,
    );
  }
  await insertRow(
    "notifications",
    {
      id: "welcome-notification",
      projectId: "jee-2027",
      title: "A fresh start for your next study session",
      body: "Your sample workspace is ready. All study records stay within their project.",
      href: "/projects/jee-2027",
    },
    client,
  );
  await insertRow(
    "notifications",
    {
      id: "revision-notification",
      projectId: "jee-2027",
      title: "Two essential ideas to revisit",
      body: "Your first flashcards are ready for a review.",
      href: "/projects/jee-2027/progress",
    },
    client,
  );
  await client.query(
    "INSERT INTO demo_metadata(key,value) VALUES('seed-v1',$1)",
    [
      JSON.stringify({
        anchoredDate: today,
        version: 1,
        originalQuestions: originalQuestions.length,
        synthetic: true,
      }),
    ],
  );
});
await seedExtras();
console.log(
  `Seeded 4 projects, ${originalQuestions.length} original question definitions, project-owned resources, conversations, tasks and learning history. Anchor: ${today}.`,
);
await pool.end();
