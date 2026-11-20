import { expect, test, type APIRequestContext } from "@playwright/test";

let projectId: string;
let projectName: string;
async function collection(request: APIRequestContext, name: string) {
  return (
    await (await request.get(`/api/projects/${projectId}/${name}`)).json()
  ).items as Array<Record<string, any>>;
}

test.beforeEach(async ({ request }) => {
  projectId = "";
  projectName = `Workspace acceptance ${Date.now()}`;
  const response = await request.post("/api/projects", {
    data: {
      name: projectName,
      exam: "Custom",
      subjects: ["Physics", "Maths"],
      settings: {
        enabledTools: ["ask", "notes", "plan", "lessons", "practice"],
        minutesPerDay: 120,
        studyStart: "16:00",
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  projectId = (await response.json()).project.id;
});
test.afterEach(async ({ request }) => {
  if (projectId)
    await request.delete(`/api/projects/${projectId}`, {
      data: { confirmName: projectName },
    });
});

test("notes autosave, survive reload and remain in their owning project", async ({
  page,
  request,
}) => {
  await page.goto(`/projects/${projectId}/library`);
  await page.getByRole("button", { name: "Add resource", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("A useful momentum insight");
  await dialog
    .getByLabel("Your note", { exact: true })
    .fill("## Momentum\n\nMomentum is mass multiplied by velocity.");
  await dialog
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(page).toHaveURL(/\/library\/resource/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Note content", { exact: true })
    .fill(
      "## Momentum\n\nThe direction of momentum follows velocity. Check vector signs.",
    );
  await expect(page.locator(".lib-save-status")).toHaveText("Saved");
  await expect
    .poll(async () => (await collection(request, "resources"))[0]?.content)
    .toContain("Check vector signs.");
  const resourceId = (await collection(request, "resources"))[0].id;
  await page.reload();
  await expect(
    page.getByText(
      "The direction of momentum follows velocity. Check vector signs.",
      { exact: true },
    ),
  ).toBeVisible();
  const wrongScope = await request.get(
    `/api/projects/neet-2027/resources/${resourceId}`,
  );
  expect(wrongScope.status()).toBe(404);
});

test("uploaded sources retain readable historical versions after replacement", async ({
  page,
  request,
}) => {
  await page.goto(`/projects/${projectId}/library`);
  await page.locator("input[type=file]").setInputFiles({
    name: "original-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Original source: force is the rate of change of momentum.",
    ),
  });
  await expect(page).toHaveURL(/\/library\/resource/);
  await expect(
    page.getByText(
      "Original source: force is the rate of change of momentum.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "updated-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Updated source: for constant mass, net force equals mass times acceleration.",
    ),
  });
  await expect(
    page.getByText(
      "Updated source: for constant mass, net force equals mass times acceleration.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Source version", { exact: true }).selectOption("1");
  await expect(
    page.getByText(
      "Original source: force is the rate of change of momentum.",
      { exact: true },
    ),
  ).toBeVisible();
  const resource = (await collection(request, "resources"))[0];
  const previousFile = await request.get(
    `/api/projects/${projectId}/resources/${resource.id}/file?version=1`,
  );
  expect(await previousFile.text()).toContain("Original source:");
  const currentFile = await request.get(
    `/api/projects/${projectId}/resources/${resource.id}/file`,
  );
  expect(await currentFile.text()).toContain("Updated source:");
});

test("mobile calendar creates, edits and completes the same persisted task", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/calendar`);
  await page.getByRole("button", { name: "New task", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("What will you work on?", { exact: true })
    .fill("Review momentum");
  await dialog.getByLabel("Duration, minutes", { exact: true }).fill("25");
  await dialog
    .getByRole("button", { name: "Add to calendar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review momentum Physics", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review momentum Physics", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("What will you work on?", { exact: true })
    .fill("Review momentum and impulse");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Complete Review momentum and impulse",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await collection(request, "tasks"))[0]?.status)
    .toBe("completed");
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Reopen Review momentum and impulse",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("planning previews without mutation, applies, and can undo its own pending tasks", async ({
  page,
  request,
}) => {
  await page.goto(`/projects/${projectId}/calendar`);
  await page.getByRole("button", { name: "Make a plan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: /Topics and workload, one per line/ })
    .fill("Momentum\nImpulse\nConservation of momentum");
  await dialog
    .getByRole("button", { name: "Preview plan", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Your week, before you commit",
      exact: true,
    }),
  ).toBeVisible();
  expect(await collection(request, "tasks")).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Add to my calendar", exact: true })
    .click();
  await expect(
    page.getByText("Your plan is on the calendar.", { exact: true }),
  ).toBeVisible();
  expect((await collection(request, "tasks")).length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo plan", exact: true }).click();
  await expect
    .poll(async () => (await collection(request, "tasks")).length)
    .toBe(0);
});

test("lesson notes are the same resources in Library and collections preserve order", async ({
  page,
  request,
}) => {
  await page.goto(`/projects/${projectId}/cramazon`);
  await page
    .getByRole("button", { name: "Add a lesson", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("YouTube video link", { exact: true })
    .fill("https://www.youtube.com/watch?v=kKKM8Y-u7ds");
  await dialog
    .getByLabel("Lesson title", { exact: true })
    .fill("Forces, one idea at a time");
  await dialog
    .getByRole("button", { name: "Save lesson", exact: true })
    .click();
  await expect(page).toHaveURL(/\/cramazon\/lesson/);
  await page
    .getByLabel("Timestamped lesson note", { exact: true })
    .fill("Check which object the force acts on before drawing a diagram.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page
      .locator(".video-notes-list")
      .getByText(
        "Check which object the force acts on before drawing a diagram.",
        { exact: true },
      ),
  ).toBeVisible();
  const notes = (await collection(request, "resources")).filter(
    (r) => r.type === "video-note",
  );
  expect(notes).toHaveLength(1);
  expect(notes[0].metadata.timestamp).toBeGreaterThanOrEqual(0);
  await page.goto(`/projects/${projectId}/library/${notes[0].id}`);
  await expect(
    page.getByText(
      "Check which object the force acts on before drawing a diagram.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}/cramazon`);
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Collection name", { exact: true })
    .fill("Newton, step by step");
  const lessons = await collection(request, "lessons");
  await dialog
    .getByRole("combobox", { name: "Add a lesson", exact: true })
    .selectOption(lessons[0].id);
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Newton, step by step", exact: true }),
  ).toBeVisible();
  const collections = (await collection(request, "resources")).filter(
    (r) => r.type === "lesson-collection",
  );
  expect(collections[0].metadata.lessonIds).toEqual([lessons[0].id]);
});

test("deleted source citations reopen their exact preserved revision without edit actions", async ({
  page,
  request,
}) => {
  const created = await request.post(`/api/projects/${projectId}/resources`, {
    data: {
      title: "An original force note",
      type: "note",
      subject: "Physics",
      content:
        "Original citation: net force is the rate of change of momentum.",
    },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).item;
  const updated = await request.patch(
    `/api/projects/${projectId}/resources/${resource.id}`,
    {
      data: {
        revision: resource.revision,
        content: "A newer revision with additional explanation.",
      },
    },
  );
  expect(updated.ok()).toBeTruthy();
  const deleted = await request.delete(
    `/api/projects/${projectId}/resources/${resource.id}`,
  );
  expect(deleted.ok()).toBeTruthy();
  expect(
    (
      await request.get(`/api/projects/${projectId}/resources/${resource.id}`)
    ).status(),
  ).toBe(404);
  const preserved = await request.get(
    `/api/projects/${projectId}/resources/${resource.id}?version=1`,
  );
  expect(preserved.ok()).toBeTruthy();
  expect((await preserved.json()).item).toMatchObject({
    deleted: true,
    historical: true,
    revision: 1,
    content: "Original citation: net force is the rate of change of momentum.",
  });
  await page.goto(`/projects/${projectId}/library/${resource.id}?version=1`);
  await expect(
    page.getByText("Deleted source · preserved citation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Original citation: net force is the rate of change of momentum.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Organise", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Replace source", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete resource", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(
      "Original citation: net force is the rate of change of momentum.",
      { exact: true },
    ),
  ).toBeVisible();
  const forbiddenEdit = await request.patch(
    `/api/projects/${projectId}/resources/${resource.id}`,
    { data: { content: "This mutation must not be accepted." } },
  );
  expect(forbiddenEdit.status()).toBe(404);
  expect(
    (
      await request.get(
        `/api/projects/neet-2027/resources/${resource.id}?version=1`,
      )
    ).status(),
  ).toBe(404);
});
