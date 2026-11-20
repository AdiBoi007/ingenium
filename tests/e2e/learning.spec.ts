import { test, expect } from "@playwright/test";
let projectId = "";
let projectName = "";
let questionId = "";
test.beforeEach(async ({ request }) => {
  projectName = `Learning QA ${Date.now()}`;
  const create = await request.post("/api/projects", {
    data: {
      name: projectName,
      exam: "Custom",
      subjects: ["Physics", "Chemistry", "Maths", "Biology"],
      description: "Ephemeral automated acceptance fixture",
    },
  });
  expect(create.ok()).toBeTruthy();
  projectId = (await create.json()).item.id;
  const q = await request.post(`/api/projects/${projectId}/questions`, {
    data: {
      subject: "Physics",
      topic: "Kinematics",
      type: "numerical",
      prompt:
        "A body travels 12 metres in 3 seconds at constant speed. Find its speed in m/s.",
      answer: "4",
      unit: "m/s",
      explanation: "Speed equals distance divided by time: 12 / 3 = 4 m/s.",
      hint: "Divide distance by time.",
      difficulty: "Easy",
      source: "Automated acceptance fixture",
    },
  });
  expect(q.ok()).toBeTruthy();
  questionId = (await q.json()).item.id;
  await request.post(`/api/projects/${projectId}/questions`, {
    data: {
      subject: "Physics",
      topic: "Friction",
      type: "single",
      prompt: "Which force opposes sliding between rough surfaces?",
      options: ["Friction", "Weight", "Buoyancy"],
      answer: "Friction",
      explanation: "Kinetic friction opposes relative sliding.",
      hint: "Consider the contact force parallel to the surface.",
      difficulty: "Easy",
    },
  });
  await request.post(`/api/projects/${projectId}/flashcards`, {
    data: {
      front: "What is the constant-speed formula?",
      back: "Speed = distance ÷ time.",
      subject: "Physics",
      topic: "Kinematics",
      deck: "Motion basics",
    },
  });
});
test.afterEach(async ({ request }) => {
  if (projectId)
    await request.delete(`/api/projects/${projectId}`, {
      data: { confirmName: projectName },
    });
});
test("desktop connected practice, test resume, flashcard and saved lab", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  await page.goto(
    `/projects/${projectId}/study?tool=practice&question=${questionId}`,
  );
  await expect(
    page.getByRole("heading", {
      name: "A body travels 12 metres in 3 seconds at constant speed. Find its speed in m/s.",
    }),
  ).toBeVisible();
  await page.getByLabel("Your answer", { exact: true }).fill("9");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("A useful mistake to learn from.")).toBeVisible();
  await page
    .getByRole("button", { name: "Schedule revision", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Revision scheduled" }),
  ).toBeVisible();
  const tasks = await (
    await request.get(`/api/projects/${projectId}/tasks`)
  ).json();
  expect(
    tasks.items.some(
      (t: { questionId?: string }) => t.questionId === questionId,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("That’s right. Nicely reasoned.")).toBeVisible();
  await page.screenshot({
    path: "output/screenshots/learning-practice-desktop.png",
    fullPage: true,
  });
  const progress = await (
    await request.get(`/api/projects/${projectId}/progress`)
  ).json();
  expect(progress.attempts).toBe(2);
  expect(progress.correct).toBe(1);
  await page.goto(`/projects/${projectId}/study?tool=test`);
  await page
    .getByRole("button", { name: "Begin practice test", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tests\//);
  await expect(page.getByRole("timer")).toBeVisible();
  const sessionId = page.url().split("/").pop()!;
  const session = await (
    await request.get(`/api/projects/${projectId}/tests/${sessionId}`)
  ).json();
  const first = session.item.questions[0];
  if (first.type === "numerical")
    await page.getByLabel("Your answer", { exact: true }).fill("4");
  else await page.getByRole("radio", { name: /Friction/ }).check();
  await expect(
    page.getByText("All answers saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("timer")).toBeVisible();
  if (first.type === "numerical")
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      "4",
    );
  else
    await expect(page.getByRole("radio", { name: /Friction/ })).toBeChecked();
  await page.getByRole("button", { name: "Save & next", exact: true }).click();
  const second = session.item.questions[1];
  if (second.type === "numerical")
    await page.getByLabel("Your answer", { exact: true }).fill("4");
  else await page.getByRole("radio", { name: /Friction/ }).check();
  await expect(
    page.getByText("All answers saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review & submit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit and see results", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Here’s what you learned." }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/screenshots/learning-test-result-desktop.png",
    fullPage: true,
  });
  const once = await (
    await request.post(`/api/projects/${projectId}/tests/${sessionId}/submit`, {
      data: {},
    })
  ).json();
  expect(once.item.score).toBe(8);
  expect(once.item.attempts).toHaveLength(2);
  await page.goto(`/projects/${projectId}/study?tool=revise`);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(page.getByText("Speed = distance ÷ time.")).toBeVisible();
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(page.getByText("A little more, remembered.")).toBeVisible();
  await page.goto(`/projects/${projectId}/study?tool=visualise`);
  await page.getByLabel("Launch angle", { exact: true }).fill("45");
  await page.getByLabel("Launch angle", { exact: true }).blur();
  await expect(page.locator(".lab-metrics")).toContainText("40");
  await page
    .getByLabel("Experiment title", { exact: true })
    .fill("QA projectile variation");
  await page
    .getByRole("button", { name: "Save experiment", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your Library" }),
  ).toBeVisible();
  const artifacts = await (
    await request.get(`/api/projects/${projectId}/artifacts`)
  ).json();
  const artifact = artifacts.items.find(
    (a: { title: string }) => a.title === "QA projectile variation",
  );
  expect(artifact.payload.parameters.angle).toBe(45);
  await page.goto(`/projects/${projectId}/artifacts/${artifact.id}`);
  await expect(page.getByLabel("Launch angle", { exact: true })).toHaveValue(
    "45",
  );
  await page
    .getByRole("button", { name: "Restore original values", exact: true })
    .click();
  await expect(page.getByLabel("Launch angle", { exact: true })).toHaveValue(
    "30",
  );
  await page.screenshot({
    path: "output/screenshots/learning-lab-desktop.png",
    fullPage: true,
  });
});
test("mobile lab adjustment, practice, revision and flashcard remain usable", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/study?tool=visualise`);
  await page.getByLabel("Launch angle", { exact: true }).fill("60");
  await page
    .getByRole("button", { name: "Save experiment", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your Library" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "output/screenshots/learning-lab-mobile.png",
    fullPage: true,
  });
  await page.goto(
    `/projects/${projectId}/study?tool=practice&question=${questionId}`,
  );
  await page.getByLabel("Your answer", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("A useful mistake to learn from.")).toBeVisible();
  await page
    .getByRole("button", { name: "Schedule revision", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Revision scheduled" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "output/screenshots/learning-practice-mobile.png",
    fullPage: true,
  });
  await page.goto(`/projects/${projectId}/study?tool=revise`);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await page.screenshot({
    path: "output/screenshots/learning-flashcards-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(page.getByText("A little more, remembered.")).toBeVisible();
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/projects/${projectId}/study?tool=visualise`);
    await expect(
      page.getByLabel("Launch angle", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
});
test("all twelve lab scenes render and exceptional inputs stay explicit", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto(`/projects/${projectId}/study?tool=visualise`);
  const titles = [
    "Projectile motion",
    "Block on an incline",
    "Spring oscillator",
    "DC circuits",
    "Thin lens",
    "Limiting reagent",
    "Dilution",
    "First-order kinetics",
    "Quadratic explorer",
    "Circle & line",
    "Monohybrid inheritance",
    "Mitosis",
  ];
  for (const title of titles) {
    await page
      .getByRole("button", { name: "Change experiment", exact: true })
      .click();
    await page
      .locator(".lab-catalog-grid")
      .getByRole("button")
      .filter({ has: page.getByText(title, { exact: true }) })
      .click();
    await expect(
      page.getByLabel("Experiment title", { exact: true }),
    ).toHaveValue(title);
    await expect(page.locator(".lab-metrics")).not.toContainText("NaN");
    await expect(page.locator(".lab-metrics")).not.toContainText("undefined");
    await page.getByRole("tab", { name: "Graph", exact: true }).click();
    await expect(page.locator(".lab-graph svg")).toBeVisible();
    await page.getByRole("tab", { name: "Scene", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Change experiment", exact: true })
    .click();
  await page
    .locator(".lab-catalog-grid")
    .getByRole("button")
    .filter({ has: page.getByText("Thin lens", { exact: true }) })
    .click();
  await page.getByLabel("Object distance", { exact: true }).fill("10");
  await expect(page.locator(".lab-metrics")).toContainText("At infinity");
  await page
    .getByRole("button", { name: "Change experiment", exact: true })
    .click();
  await page
    .locator(".lab-catalog-grid")
    .getByRole("button")
    .filter({ has: page.getByText("DC circuits", { exact: true }) })
    .click();
  await page.getByLabel("Connection", { exact: true }).selectOption("parallel");
  await page.screenshot({
    path: "output/screenshots/learning-circuit-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Change experiment", exact: true })
    .click();
  await page
    .locator(".lab-catalog-grid")
    .getByRole("button")
    .filter({ has: page.getByText("Block on an incline", { exact: true }) })
    .click();
  await page
    .getByLabel("Kinetic friction coefficient", { exact: true })
    .fill("1");
  await expect(page.getByText("Showing the last valid values.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save experiment", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Restore original values", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save experiment", exact: true }),
  ).toBeEnabled();
});
test("curriculum coverage, assessment weights and reviewed version persist", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.goto(`/projects/${projectId}/progress`);
  await page.getByRole("button", { name: "Syllabus", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "See what you’ve covered." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add topic", exact: true }).click();
  const topicDialog = page.getByRole("dialog");
  await topicDialog
    .getByLabel("Topic name", { exact: true })
    .fill("Work and energy");
  await topicDialog
    .getByLabel("Subject or course", { exact: true })
    .fill("Physics");
  await topicDialog
    .getByRole("button", { name: "Save topic", exact: true })
    .click();
  await page
    .getByLabel("Coverage for Work and energy", { exact: true })
    .selectOption("covered");
  await expect(
    page.getByRole("status").filter({ hasText: "Topic updated." }),
  ).toBeVisible();
  await page
    .getByLabel("Confidence for Work and energy", { exact: true })
    .selectOption("low");
  await expect(
    page.getByRole("status").filter({ hasText: "Topic updated." }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Syllabus", exact: true }).click();
  await expect(
    page.getByLabel("Coverage for Work and energy", { exact: true }),
  ).toHaveValue("covered");
  await expect(
    page.getByLabel("Confidence for Work and energy", { exact: true }),
  ).toHaveValue("low");
  await page
    .getByRole("tab", { name: "Course assessments", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add assessment", exact: true })
    .click();
  const a = page.getByRole("dialog");
  await a
    .getByLabel("Assessment title", { exact: true })
    .fill("Mechanics assignment");
  await a.getByLabel("Course", { exact: true }).fill("Mechanics");
  await a.getByLabel("Course weight (%)", { exact: true }).fill("20");
  await a.getByLabel("Maximum mark", { exact: true }).fill("25");
  await a
    .getByLabel("Earned mark · leave blank until graded", { exact: true })
    .fill("20");
  await a.getByRole("button", { name: "Save assessment", exact: true }).click();
  await expect(page.locator(".curriculum-grade-summary")).toContainText("16.0");
  await expect(page.locator(".curriculum-grade-summary")).toContainText(
    "80.0%",
  );
  await page.screenshot({
    path: "output/screenshots/learning-assessments-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Review syllabus version", exact: true })
    .click();
  const v = page.getByRole("dialog");
  await v
    .getByLabel("Version name", { exact: true })
    .fill("Reviewed course v2");
  await v
    .getByLabel("Proposed topic 1", { exact: true })
    .fill("Contact forces");
  await v.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(v.getByText("Ready for your review")).toBeVisible();
  await v
    .getByRole("button", { name: "Apply reviewed version", exact: true })
    .click();
  await expect(page.locator(".curriculum-template")).toContainText(
    "Reviewed course v2",
  );
  const snapshot = await (
    await request.get(`/api/projects/${projectId}/curriculum`)
  ).json();
  expect(snapshot.template.versionLabel).toBe("Reviewed course v2");
  expect(snapshot.assessments[0].mark).toBe(20);
  expect(
    snapshot.topics.find(
      (t: { title: string }) => t.title === "Work and energy",
    ).coverage,
  ).toBe("covered");
  await page
    .getByRole("tab", { name: "Topics & coverage", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByLabel("Coverage for Work and energy", { exact: true }),
  ).toHaveValue("covered");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "output/screenshots/learning-syllabus-mobile.png",
    fullPage: true,
  });
});
