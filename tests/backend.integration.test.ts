import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleApi } from "../src/server/api";
import { id, pool, query } from "../src/server/db";
import {
  allocatePlan,
  prepareCurriculumWorkloads,
} from "../src/server/planning";
const projectId = id("integration-project");
const otherId = id("integration-other");
function request(path: string, method = "GET", payload?: unknown) {
  return handleApi(
    new Request("http://localhost/api/" + path, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    }),
    path.split("?")[0].split("/"),
  );
}
async function data(path: string, method = "GET", payload?: unknown) {
  const response = await request(path, method, payload);
  return { status: response.status, data: await response.json() };
}
beforeAll(async () => {
  const database = (await query("SELECT current_database() AS name")).rows[0]
    .name;
  if (database !== "ingenium_demo")
    throw new Error(
      "Integration tests require isolated ingenium_demo database",
    );
  for (const pid of [projectId, otherId])
    await query(
      "INSERT INTO projects(id,student_id,name,exam,subjects) VALUES($1,'adi-demo','Integration fixture','Custom','[\"Physics\"]')",
      [pid],
    );
});
afterAll(async () => {
  for (const pid of [projectId, otherId])
    await query("DELETE FROM projects WHERE id=$1", [pid]);
  await pool.end();
});
describe("real PostgreSQL application services", () => {
  it("persists notes with immutable revisions and rejects stale saves", async () => {
    const created = await data(`projects/${projectId}/resources`, "POST", {
      title: "Persistent note",
      type: "note",
      content: "Original source text",
    });
    expect(created.status).toBe(201);
    const item = created.data.item;
    const update = await data(
      `projects/${projectId}/resources/${item.id}`,
      "PATCH",
      { content: "New revision", revision: 1 },
    );
    expect(update.data.item.revision).toBe(2);
    expect(
      (await data(`projects/${projectId}/resources/${item.id}`)).data.item
        .content,
    ).toBe("New revision");
    expect(
      (
        await data(`projects/${projectId}/resources/${item.id}`, "PATCH", {
          content: "Stale write",
          revision: 1,
        })
      ).status,
    ).toBe(409);
    const versions = (
      await data(`projects/${projectId}/resources/${item.id}/versions`)
    ).data.items;
    expect(versions).toHaveLength(2);
    expect(versions[1].content).toBe("Original source text");
  });
  it("enforces project scope in API and composite foreign keys", async () => {
    const resource = (
      await data(`projects/${projectId}/resources`, "POST", {
        title: "Scoped resource",
        content: "Only project one",
      })
    ).data.item;
    expect(
      (await data(`projects/${otherId}/resources/${resource.id}`)).status,
    ).toBe(404);
    const task = await data(`projects/${otherId}/tasks`, "POST", {
      title: "Wrong project reference",
      date: "2026-11-18",
      resourceId: resource.id,
    });
    expect(task.status).toBe(409);
    const search = (await data(`projects/${otherId}/search?q=Scoped`)).data
      .items;
    expect(search).toEqual([]);
  });
  it("keeps answers server-side and submits timed tests idempotently", async () => {
    const question = (
      await data(`projects/${projectId}/questions`, "POST", {
        subject: "Physics",
        topic: "Units",
        type: "numerical",
        prompt: "Write one metre in metres.",
        answer: "1",
        unit: "m",
        tolerance: 0.001,
        explanation: "One metre is 100 centimetres.",
      })
    ).data.item;
    expect(question.answer).toBeUndefined();
    const test = (
      await data(`projects/${projectId}/tests`, "POST", {
        questionIds: [question.id],
        count: 1,
        durationMinutes: 5,
      })
    ).data.item;
    expect(test.questions[0].answer).toBeUndefined();
    const saved = await data(
      `projects/${projectId}/tests/${test.id}`,
      "PATCH",
      { questionId: question.id, answer: "100 cm", flagged: true },
    );
    expect(saved.data.item.responses[question.id].answer).toBe("100 cm");
    const result = await data(
      `projects/${projectId}/tests/${test.id}/submit`,
      "POST",
      {},
    );
    expect(result.data.item.score).toBe(4);
    expect(result.data.item.attempts).toHaveLength(1);
    const repeated = await data(
      `projects/${projectId}/tests/${test.id}/submit`,
      "POST",
      {},
    );
    expect(repeated.data.item.score).toBe(4);
    expect(
      Number(
        (
          await query("SELECT count(*) FROM attempts WHERE session_id=$1", [
            test.id,
          ])
        ).rows[0].count,
      ),
    ).toBe(1);
  });
  it("rejects late answer changes and automatically grades expired tests", async () => {
    const questions = (await data(`projects/${projectId}/questions`)).data
      .items;
    const test = (
      await data(`projects/${projectId}/tests`, "POST", {
        questionIds: [questions[0].id],
        count: 1,
        durationMinutes: 1,
      })
    ).data.item;
    await query(
      "UPDATE test_sessions SET deadline=now()-interval '1 minute' WHERE id=$1",
      [test.id],
    );
    expect(
      (
        await data(`projects/${projectId}/tests/${test.id}`, "PATCH", {
          questionId: questions[0].id,
          answer: "1",
        })
      ).status,
    ).toBe(409);
    const expired = (await data(`projects/${projectId}/tests/${test.id}`)).data
      .item;
    expect(expired.status).toBe("submitted");
    expect(expired.attempts[0].status).toBe("blank");
  });
  it("creates mistakes once per idempotent attempt and connects progress", async () => {
    const question = (await data(`projects/${projectId}/questions`)).data
      .items[0];
    const key = id("attempt-key");
    const first = (
      await data(`projects/${projectId}/attempts`, "POST", {
        questionId: question.id,
        answer: "2 m",
        idempotencyKey: key,
      })
    ).data.item;
    const second = (
      await data(`projects/${projectId}/attempts`, "POST", {
        questionId: question.id,
        answer: "2 m",
        idempotencyKey: key,
      })
    ).data.item;
    expect(second.id).toBe(first.id);
    expect(first.correct).toBe(false);
    const progress = (await data(`projects/${projectId}/progress`)).data;
    expect(progress.mistakes.some((m: any) => m.attemptId === first.id)).toBe(
      true,
    );
  });
  it("applies plans once and undo preserves completed work", async () => {
    const plan = (
      await data(`projects/${projectId}/plans`, "POST", {
        startDate: "2027-01-02",
        endDate: "2027-01-02",
        minutesPerDay: 120,
        sessionMinutes: 30,
        topics: ["First topic", "Second topic"],
      })
    ).data.item;
    expect(plan.tasks).toHaveLength(2);
    await data(`projects/${projectId}/plans/${plan.id}/apply`, "POST", {});
    await data(`projects/${projectId}/plans/${plan.id}/apply`, "POST", {});
    const rows = (
      await query("SELECT * FROM tasks WHERE plan_id=$1", [plan.id])
    ).rows;
    expect(rows).toHaveLength(2);
    await data(`projects/${projectId}/tasks/${rows[0].id}`, "PATCH", {
      status: "completed",
    });
    await data(`projects/${projectId}/plans/${plan.id}/undo`, "POST", {});
    const remaining = (
      await query("SELECT * FROM tasks WHERE plan_id=$1", [plan.id])
    ).rows;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("completed");
  });
  it("materializes weekly recurrence without shifting wall-clock times at DST", async () => {
    const task = (
      await data(`projects/${projectId}/tasks`, "POST", {
        title: "Recurring study",
        date: "2027-03-28",
        time: "09:00",
        duration: 30,
        recurrence: { frequency: "weekly", count: 3 },
        timezone: "Australia/Sydney",
      })
    ).data.item;
    const tasks = (
      await query("SELECT * FROM tasks WHERE series_id=$1 ORDER BY date", [
        task.seriesId,
      ])
    ).rows;
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.time)).toEqual(["09:00", "09:00", "09:00"]);
    expect(tasks[1].date).toBe("2027-04-04");
  });

  it("stores real uploaded bytes and preserves source versions", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File(
        ["A source passage about conservation of momentum."],
        "source.txt",
        { type: "text/plain" },
      ),
    );
    const response = await handleApi(
      new Request(
        `http://localhost/api/projects/${projectId}/resources/upload`,
        { method: "POST", body: form },
      ),
      ["projects", projectId, "resources", "upload"],
    );
    expect(response.status).toBe(201);
    const resource = (await response.json()).item;
    expect(resource.metadata.extractionStatus).toBe("completed");
    const file = await handleApi(
      new Request(
        `http://localhost/api/projects/${projectId}/resources/${resource.id}/file`,
      ),
      ["projects", projectId, "resources", resource.id, "file"],
    );
    expect(await file.text()).toContain("conservation of momentum");
    const replacement = new FormData();
    replacement.append(
      "file",
      new File(["Revised source passage."], "source-v2.txt", {
        type: "text/plain",
      }),
    );
    await handleApi(
      new Request(
        `http://localhost/api/projects/${projectId}/resources/${resource.id}/upload`,
        { method: "POST", body: replacement },
      ),
      ["projects", projectId, "resources", resource.id, "upload"],
    );
    const old = await handleApi(
      new Request(
        `http://localhost/api/projects/${projectId}/resources/${resource.id}/file?version=1`,
      ),
      ["projects", projectId, "resources", resource.id, "file"],
    );
    expect(await old.text()).toContain("conservation of momentum");
  });
  it("patches only supplied fields and merges project settings", async () => {
    const original = (
      await data(`projects/${projectId}/resources`, "POST", {
        title: "Preserve metadata",
        subject: "Physics",
        type: "book",
        pinned: true,
        metadata: { author: "Original author" },
        content: "A",
      })
    ).data.item;
    const changed = (
      await data(`projects/${projectId}/resources/${original.id}`, "PATCH", {
        content: "B",
        revision: 1,
      })
    ).data.item;
    expect(changed.subject).toBe("Physics");
    expect(changed.type).toBe("book");
    expect(changed.pinned).toBe(true);
    expect(changed.metadata.author).toBe("Original author");
    await data(`projects/${projectId}`, "PATCH", {
      settings: {
        language: "Hindi",
        enabledTools: ["visualise", "practise", "test", "plan", "revise"],
      },
    });
    const project = (
      await data(`projects/${projectId}`, "PATCH", {
        settings: { tone: "Concise" },
      })
    ).data.item;
    expect(project.subjects).toEqual(["Physics"]);
    expect(project.settings.language).toBe("Hindi");
    expect(project.settings.tone).toBe("Concise");
  });
  it("extracts an original PDF with page and version references", async () => {
    const sentence =
      "Momentum is conserved when the net external force is zero.";
    const stream = `BT /F1 12 Tf 40 700 Td (${sentence}) Tj ET`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((obj, index) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n ")
      .join(
        "\n",
      )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const form = new FormData();
    form.append(
      "file",
      new File([pdf], "original-momentum.pdf", { type: "application/pdf" }),
    );
    const response = await handleApi(
      new Request(
        `http://localhost/api/projects/${projectId}/resources/upload`,
        { method: "POST", body: form },
      ),
      ["projects", projectId, "resources", "upload"],
    );
    expect(response.status).toBe(201);
    const resource = (await response.json()).item;
    expect(resource.metadata.extractionStatus).toBe("completed");
    expect(resource.content).toContain(sentence);
    const chunks = (
      await query("SELECT * FROM source_chunks WHERE resource_id=$1", [
        resource.id,
      ])
    ).rows;
    expect(chunks[0].page).toBe(1);
    expect(chunks[0].version).toBe(1);
  });
  it("deduplicates scheduled revision for the same question and date", async () => {
    const question = (await data(`projects/${projectId}/questions`)).data
      .items[0];
    const payload = {
      title: "Revisit this idea",
      date: "2027-02-01",
      type: "revision",
      metadata: { questionId: question.id },
    };
    const first = (await data(`projects/${projectId}/tasks`, "POST", payload))
      .data.item;
    const retry = (await data(`projects/${projectId}/tasks`, "POST", payload))
      .data.item;
    expect(retry.id).toBe(first.id);
    const explicit = (
      await data(`projects/${projectId}/tasks`, "POST", {
        ...payload,
        force: true,
      })
    ).data.item;
    expect(explicit.id).not.toBe(first.id);
  });
  it("validates and recomputes science on the server before saving", async () => {
    const invalid = await data(`projects/${projectId}/artifacts`, "POST", {
      title: "Invalid lab",
      type: "simulation",
      payload: {
        modelId: "projectile",
        parameters: { speed: 20, angle: 30, height: 0, gravity: 0 },
      },
    });
    expect(invalid.status).toBe(400);
    const valid = await data(`projects/${projectId}/artifacts`, "POST", {
      title: "Trusted lab",
      type: "simulation",
      payload: {
        modelId: "projectile",
        parameters: { speed: 20, angle: 30, height: 0, gravity: 10 },
        result: { range: 999 },
      },
    });
    expect(valid.status).toBe(201);
    expect(valid.data.item.payload.result.values.range).toBeCloseTo(
      34.641016,
      5,
    );
  });
  it("preserves saved Library artifacts and origin when deleting their conversation", async () => {
    const conversation = (
      await data(`projects/${projectId}/conversations`, "POST", {
        title: "Keep my saved experiment",
      })
    ).data.item;
    const other = (
      await data(`projects/${otherId}/conversations`, "POST", {
        title: "Other project conversation",
      })
    ).data.item;
    const artifact = (
      await data(`projects/${projectId}/artifacts`, "POST", {
        title: "Saved independent lab",
        type: "simulation",
        conversationId: conversation.id,
        payload: {
          modelId: "projectile",
          parameters: { speed: 20, angle: 30, height: 0, gravity: 10 },
        },
      })
    ).data.item;
    expect(
      (
        await data(
          `projects/${projectId}/conversations/${conversation.id}`,
          "DELETE",
        )
      ).status,
    ).toBe(200);
    expect(
      (await data(`projects/${projectId}/conversations/${conversation.id}`))
        .status,
    ).toBe(404);
    const retained = (
      await data(`projects/${projectId}/artifacts/${artifact.id}`)
    ).data.item;
    expect(retained.payload).toEqual(artifact.payload);
    expect(retained.conversationId).toBeNull();
    expect(retained.originConversationId).toBe(conversation.id);
    expect(retained.originConversationTitle).toBe("Keep my saved experiment");
    expect(
      (await data(`projects/${projectId}/artifacts/${artifact.id}/revisions`))
        .data.items,
    ).toHaveLength(1);
    expect(
      (await data(`projects/${otherId}/conversations/${other.id}`)).status,
    ).toBe(200);
  });
  it("retains uploaded file locators on edits and explicitly resolves tombstone history", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File(["An original retained source passage."], "retained.txt", {
        type: "text/plain",
      }),
    );
    const response = await handleApi(
      new Request(
        `http://localhost/api/projects/${projectId}/resources/upload`,
        { method: "POST", body: form },
      ),
      ["projects", projectId, "resources", "upload"],
    );
    const resource = (await response.json()).item;
    const revised = (
      await data(`projects/${projectId}/resources/${resource.id}`, "PATCH", {
        title: "Renamed source",
        revision: 1,
      })
    ).data.item;
    expect(revised.revision).toBe(2);
    const versionFile = await request(
      `projects/${projectId}/resources/${resource.id}/file?version=2`,
    );
    expect(versionFile.status).toBe(200);
    expect(await versionFile.text()).toContain("original retained");
    const old = (
      await query(
        "SELECT storage_key FROM resource_versions WHERE resource_id=$1 ORDER BY version",
        [resource.id],
      )
    ).rows;
    expect(old[0].storage_key).toBe(old[1].storage_key);
    await data(`projects/${projectId}/resources/${resource.id}`, "DELETE");
    expect(
      (await data(`projects/${projectId}/resources/${resource.id}`)).status,
    ).toBe(404);
    expect(
      (await request(`projects/${projectId}/resources/${resource.id}/file`))
        .status,
    ).toBe(404);
    const historical = (
      await data(`projects/${projectId}/resources/${resource.id}?version=2`)
    ).data.item;
    expect(historical.deleted).toBe(true);
    expect(historical.historical).toBe(true);
    expect(historical.currentRevision).toBe(2);
    expect(historical.content).toContain("original retained");
    expect(
      (
        await request(
          `projects/${projectId}/resources/${resource.id}/file?version=2`,
        )
      ).status,
    ).toBe(200);
    expect(
      (await data(`projects/${otherId}/resources/${resource.id}?version=2`))
        .status,
    ).toBe(404);
    expect(
      (
        await data(`projects/${projectId}/resources/${resource.id}`, "PATCH", {
          content: "Do not resurrect",
        })
      ).status,
    ).toBe(404);
  });
});
describe("deterministic planner", () => {
  const curriculum = [
    {
      id: "base",
      title: "Vectors",
      subject: "Physics",
      coverage: "not-started",
      active: true,
      prerequisiteIds: [],
    },
    {
      id: "next",
      title: "Projectile motion",
      subject: "Physics",
      coverage: "not-started",
      active: true,
      prerequisiteIds: ["base"],
    },
  ];
  it("orders prerequisites before dependent work and blocks missing prerequisites", () => {
    const blocked = prepareCurriculumWorkloads(
      ["Projectile motion"],
      curriculum,
    );
    expect(blocked[0].blockedReason).toContain("Vectors");
    const plan = allocatePlan({
      startDate: "2027-01-01",
      endDate: "2027-01-01",
      minutesPerDay: 120,
      sessionMinutes: 30,
      topics: blocked,
      existing: [],
    });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.unscheduled[0].reason).toContain("Vectors");
    const ready = prepareCurriculumWorkloads(
      ["Projectile motion", "Vectors"],
      curriculum,
    );
    expect(ready.map((w) => w.title)).toEqual(["Vectors", "Projectile motion"]);
    const scheduled = allocatePlan({
      startDate: "2027-01-01",
      endDate: "2027-01-01",
      minutesPerDay: 120,
      sessionMinutes: 30,
      topics: ready,
      existing: [],
    });
    expect(scheduled.tasks.map((t) => t.title)).toEqual([
      "Vectors",
      "Projectile motion",
    ]);
  });
  it("does not schedule dependent work when prerequisite workload cannot fit", () => {
    const ready = prepareCurriculumWorkloads(
      [
        { title: "Projectile motion", minutes: 15 },
        { title: "Vectors", minutes: 90 },
      ],
      curriculum,
    );
    const plan = allocatePlan({
      startDate: "2027-01-01",
      endDate: "2027-01-01",
      minutesPerDay: 60,
      sessionMinutes: 30,
      topics: ready,
      existing: [],
    });
    expect(plan.tasks.every((t) => t.title === "Vectors")).toBe(true);
    expect(
      plan.unscheduled.find((w) => w.title === "Projectile motion")?.reason,
    ).toContain("Prerequisite");
  });
  it("allows a covered prerequisite without scheduling it again", () => {
    const ready = prepareCurriculumWorkloads(
      ["Projectile motion"],
      [{ ...curriculum[0], coverage: "covered" }, curriculum[1]],
    );
    expect(ready[0].blockedReason).toBeUndefined();
    expect(ready[0].requires).toEqual([]);
  });

  it("avoids fixed blocks and reports infeasible workload", () => {
    const plan = allocatePlan({
      startDate: "2026-11-18",
      endDate: "2026-11-18",
      minutesPerDay: 60,
      sessionMinutes: 30,
      topics: [{ title: "Large workload", minutes: 120 }],
      existing: [{ date: "2026-11-18", time: "09:15", duration: 30 }],
    });
    expect(plan.scheduledMinutes).toBe(30);
    expect(plan.unscheduledMinutes).toBe(90);
    for (const task of plan.tasks) {
      const t = Number(task.time.slice(0, 2)) * 60 + Number(task.time.slice(3));
      expect(t + task.duration <= 555 || t >= 585).toBe(true);
    }
  });
});
