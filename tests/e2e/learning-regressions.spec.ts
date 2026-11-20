import { test, expect } from "@playwright/test";
import { pool, query } from "../../src/server/db";
let projectId = "";
let projectName = "";
test.beforeEach(async ({ request }) => {
  projectName = `Learning regression ${Date.now()}`;
  const p = await request.post("/api/projects", {
    data: { name: projectName, exam: "Custom", subjects: ["Physics"] },
  });
  projectId = (await p.json()).item.id;
  for (const prompt of ["What is two plus two?", "What is three plus one?"]) {
    const q = await request.post(`/api/projects/${projectId}/questions`, {
      data: {
        subject: "Physics",
        topic: "Numerical reasoning",
        type: "numerical",
        prompt,
        answer: "4",
        explanation: "The result is four.",
        hint: "Add the two numbers.",
        difficulty: "Easy",
      },
    });
    expect(q.ok()).toBeTruthy();
  }
});
test.afterEach(async ({ request }) => {
  if (projectId)
    await request.delete(`/api/projects/${projectId}`, {
      data: { confirmName: projectName },
    });
});
test.afterAll(async () => {
  await pool.end();
});
test("expiry submits saved answers after a rejected autosave and shows the ungraded draft", async ({
  page,
  request,
}) => {
  const created = await request.post(`/api/projects/${projectId}/tests`, {
    data: { count: 1, durationMinutes: 1 },
  });
  const session = (await created.json()).item;
  await page.clock.install({ time: new Date() });
  await page.route(
    `**/api/projects/${projectId}/tests/${session.id}`,
    async (route) => {
      if (route.request().method() === "PATCH")
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "The test deadline has passed. Submit to see your result.",
          }),
        });
      return route.continue();
    },
  );
  await page.goto(`/projects/${projectId}/tests/${session.id}`);
  await page.getByLabel("Your answer", { exact: true }).fill("4");
  await expect(
    page.getByText("Not saved · retry below", { exact: true }),
  ).toBeVisible();
  await query(
    "UPDATE test_sessions SET deadline=now()-interval '1 second' WHERE project_id=$1 AND id=$2",
    [projectId, session.id],
  );
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("heading", { name: "Here’s what you learned." }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your last saved answers were graded" }),
  ).toBeVisible();
  await page.locator(".test-review-toggle").click();
  await expect(
    page.getByText("Your unsaved draft (not graded):"),
  ).toBeVisible();
  const result = await (
    await request.get(`/api/projects/${projectId}/tests/${session.id}`)
  ).json();
  expect(result.item.status).toBe("submitted");
  expect(result.item.attempts[0].status).toBe("blank");
  expect(result.item.score).toBe(0);
});
test("per-question review stays correct when attempt order differs from paper order", async ({
  page,
  request,
}) => {
  const created = await request.post(`/api/projects/${projectId}/tests`, {
    data: { count: 2, durationMinutes: 15 },
  });
  const session = (await created.json()).item;
  await request.patch(`/api/projects/${projectId}/tests/${session.id}`, {
    data: { questionId: session.questions[0].id, answer: "4" },
  });
  await request.post(`/api/projects/${projectId}/tests/${session.id}/submit`, {
    data: {},
  });
  await page.route(
    `**/api/projects/${projectId}/tests/${session.id}`,
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.item.attempts.reverse();
      await route.fulfill({ response, json: body });
    },
  );
  await page.goto(`/projects/${projectId}/tests/${session.id}`);
  await expect(
    page
      .locator(".test-review-item")
      .filter({ hasText: session.questions[0].prompt })
      .getByText("Correct", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".test-review-item")
      .filter({ hasText: session.questions[1].prompt })
      .getByText("Unanswered", { exact: true }),
  ).toBeVisible();
});
test("queued answers keep their originating test when navigating to another session", async ({
  page,
  request,
}) => {
  const a = (
    await (
      await request.post(`/api/projects/${projectId}/tests`, {
        data: { count: 1, durationMinutes: 15 },
      })
    ).json()
  ).item;
  const b = (
    await (
      await request.post(`/api/projects/${projectId}/tests`, {
        data: { count: 1, durationMinutes: 15 },
      })
    ).json()
  ).item;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let interceptedResolve: () => void = () => {};
  const intercepted = new Promise<void>((resolve) => {
    interceptedResolve = resolve;
  });
  let count = 0;
  await page.route(
    `**/api/projects/${projectId}/tests/${a.id}`,
    async (route) => {
      if (route.request().method() === "PATCH" && ++count === 1) {
        interceptedResolve();
        await held;
      }
      await route.continue();
    },
  );
  await page.goto(`/projects/${projectId}/tests/${a.id}`);
  await page.getByLabel("Your answer", { exact: true }).fill("4");
  await intercepted;
  await page.getByLabel("Your answer", { exact: true }).fill("40");
  await page.locator(".test-topbar a").first().click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/study$`));
  await page.evaluate(
    (url) => window.history.pushState(null, "", url),
    `/projects/${projectId}/study?tool=test`,
  );
  await page
    .locator(`.test-history a[href="/projects/${projectId}/tests/${b.id}"]`)
    .click();
  await expect(page).toHaveURL(new RegExp(`${b.id}$`));
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("");
  release();
  await expect
    .poll(async () => {
      const r = await (
        await request.get(`/api/projects/${projectId}/tests/${a.id}`)
      ).json();
      return r.item.responses[a.questions[0].id]?.answer;
    })
    .toBe("40");
  const unchanged = await (
    await request.get(`/api/projects/${projectId}/tests/${b.id}`)
  ).json();
  expect(unchanged.item.responses[b.questions[0].id].answer).toBeNull();
});
test("saved variation opens its own durable route and keeps the original intact", async ({
  page,
  request,
}) => {
  const payload = {
    schemaVersion: 1,
    modelId: "projectile",
    modelVersion: 1,
    originalInput: { speed: 20, angle: 30, height: 0, gravity: 10 },
    parameters: { speed: 20, angle: 30, height: 0, gravity: 10 },
  };
  const a = (
    await (
      await request.post(`/api/projects/${projectId}/artifacts`, {
        data: { title: "Original trajectory", type: "simulation", payload },
      })
    ).json()
  ).item;
  await page.goto(`/projects/${projectId}/artifacts/${a.id}`);
  await page.getByLabel("Launch angle", { exact: true }).fill("45");
  await page
    .getByRole("button", { name: "Save as a variation", exact: true })
    .click();
  await expect(page).not.toHaveURL(new RegExp(`${a.id}$`));
  await expect(
    page.getByLabel("Experiment title", { exact: true }),
  ).toHaveValue("Original trajectory · variation");
  const variationId = page.url().split("/").pop()!;
  await page.reload();
  await expect(page.getByLabel("Launch angle", { exact: true })).toHaveValue(
    "45",
  );
  const original = await (
    await request.get(`/api/projects/${projectId}/artifacts/${a.id}`)
  ).json();
  expect(original.item.payload.parameters.angle).toBe(30);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/projects/${projectId}/artifacts/${variationId}`,
    async (route) => {
      if (route.request().method() === "PATCH") await held;
      await route.continue();
    },
  );
  await page.getByLabel("Launch angle", { exact: true }).fill("60");
  await page
    .getByRole("button", { name: "Save experiment", exact: true })
    .click();
  await expect(page.getByLabel("Launch angle", { exact: true })).toBeDisabled();
  await expect(
    page.getByLabel("Experiment title", { exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your Library" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Launch angle", { exact: true })).toHaveValue(
    "60",
  );
});
test("free responses do not depress automatic results and historical totals remain explicit", async ({
  page,
  request,
}) => {
  const questions = await (
    await request.get(`/api/projects/${projectId}/questions`)
  ).json();
  const numerical = questions.items[0];
  const created = await request.post(`/api/projects/${projectId}/questions`, {
    data: {
      subject: "Physics",
      topic: "Reasoning",
      type: "free",
      prompt: "Explain the reasoning behind your numerical answer.",
      answer: "A clear method supported by the given values.",
      explanation: "Use this rubric to self-review your reasoning.",
      difficulty: "Easy",
    },
  });
  const free = (await created.json()).item;
  const started = await request.post(`/api/projects/${projectId}/tests`, {
    data: {
      questionIds: [numerical.id, free.id],
      count: 2,
      durationMinutes: 15,
    },
  });
  const session = (await started.json()).item;
  await request.patch(`/api/projects/${projectId}/tests/${session.id}`, {
    data: { questionId: numerical.id, answer: "4" },
  });
  await request.patch(`/api/projects/${projectId}/tests/${session.id}`, {
    data: {
      questionId: free.id,
      answer: "I grouped the quantities into two pairs.",
    },
  });
  const submitted = await request.post(
    `/api/projects/${projectId}/tests/${session.id}/submit`,
    { data: {} },
  );
  expect((await submitted.json()).item.maxScore).toBe(4);
  await page.goto(`/projects/${projectId}/tests/${session.id}`);
  await expect(page.locator(".test-score")).toContainText("4/4");
  await expect(
    page.getByText("Automatically graded subtotal", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 submitted response awaits self-review" }),
  ).toBeVisible();
  await query(
    "UPDATE test_sessions SET max_score=8 WHERE project_id=$1 AND id=$2",
    [projectId, session.id],
  );
  await page.reload();
  await expect(page.locator(".test-score")).toContainText("4/4");
  await expect(page.getByText(/Historical stored total: 4 \/ 8/)).toBeVisible();
});
