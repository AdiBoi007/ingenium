import { test, expect } from "@playwright/test";

test("private guests create universal projects, retain files/history and cannot access each other", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.GUEST_WORKSPACE_TEST !== "true",
    "Run against private guest mode, separately from the sample fixture suite.",
  );
  const a = await browser.newContext({ baseURL });
  const b = await browser.newContext({ baseURL });
  let projectId = "";
  const name = `INFO1110 guest verification ${Date.now()}`;
  try {
    const pa = await a.newPage();
    const pb = await b.newPage();
    await pa.goto("/projects");
    await pb.goto("/projects");
    await expect(
      pa.getByRole("heading", { name: "A place for every ambition." }),
    ).toBeVisible();
    await expect(
      pb.getByRole("heading", { name: "A place for every ambition." }),
    ).toBeVisible();
    const create = await a.request.post("/api/projects", {
      data: {
        name,
        exam: "Introduction to Programming",
        subjects: ["Programming"],
        projectKind: "course",
        institution: "University of Sydney",
        courseCode: "INFO1110",
        academicYear: "2026 Semester 2",
        learningGoal: "Understand Python fundamentals",
        syllabusText: "Variables\nConditionals\nLoops",
      },
    });
    expect(create.ok()).toBeTruthy();
    projectId = (await create.json()).item.id;
    const p = `/api/projects/${projectId}`;
    const uploaded = await a.request.post(`${p}/resources/upload`, {
      multipart: {
        file: {
          name: "original-python-note.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("A loop repeats a block of instructions."),
        },
        subject: "Programming",
      },
    });
    expect(uploaded.ok()).toBeTruthy();
    const resource = (await uploaded.json()).item;
    const bytes = await a.request.get(`${p}/resources/${resource.id}/file`);
    expect(bytes.ok()).toBeTruthy();
    expect(await bytes.text()).toBe("A loop repeats a block of instructions.");
    const lessonResponse = await a.request.post(`${p}/lessons`, {
      data: {
        title: "Original verification video",
        videoId: "kKKM8Y-u7ds",
        subject: "Programming",
        duration: 300,
      },
    });
    const lesson = (await lessonResponse.json()).item;
    const event = await a.request.post(`${p}/lessons/${lesson.id}/playback`, {
      data: {
        eventId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        position: 42,
        duration: 300,
        watchedSeconds: 9,
        state: "paused",
      },
    });
    expect(event.ok()).toBeTruthy();
    await pa.goto(`/projects/${projectId}/cramazon?view=history`);
    await pa.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      pa.getByText("Original verification video", { exact: true }).first(),
    ).toBeVisible();
    await pa.reload();
    const history = await a.request.get(`${p}/lessons/history`);
    expect((await history.json()).items[0].position).toBe(42);
    await pa.goto(`/projects/${projectId}`);
    await expect(
      pa.getByText("INFO1110", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      pa.getByRole("heading", { name: "Make today count, Learner." }),
    ).toBeVisible();
    await pa.getByRole("button", { name: "Open workspace profile" }).click();
    await pa.getByLabel("What should we call you?").fill("Alex");
    await pa.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(pa.getByText("Name saved", { exact: true })).toBeVisible();
    await pa.getByRole("button", { name: "Close dialog", exact: true }).click();
    await pa.reload();
    await expect(
      pa.getByRole("heading", { name: "Make today count, Alex." }),
    ).toBeVisible();
    expect((await b.request.get(p)).status()).toBe(404);
    expect(
      (await b.request.get(`${p}/resources/${resource.id}/file`)).status(),
    ).toBe(404);
    expect((await b.request.get(`${p}/lessons/history`)).status()).toBe(404);
    expect((await b.request.get(`${p}/curriculum`)).status()).toBe(404);
    expect(
      (await (await b.request.get("/api/search?q=verification")).json()).items,
    ).toEqual([]);
    await pb.reload();
    expect((await (await b.request.get("/api/preferences")).json()).name).toBe(
      "Learner",
    );
  } finally {
    if (projectId)
      await a.request.delete(`/api/projects/${projectId}`, {
        data: { confirmName: name },
      });
    await a.close();
    await b.close();
  }
});
