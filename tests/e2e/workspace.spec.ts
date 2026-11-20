import { test, expect } from "@playwright/test";
test("every seeded project owns six usable workspaces", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { projects } = await (await request.get("/api/projects")).json();
  for (const p of projects.filter((p: any) =>
    ["jee-2027", "neet-2027", "gmat", "engineering"].includes(p.id),
  )) {
    for (const section of [
      "",
      "study",
      "cramazon",
      "library",
      "calendar",
      "progress",
    ]) {
      await page.goto(`/projects/${p.id}${section ? "/" + section : ""}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("button", { name: p.name, exact: true }),
      ).toBeVisible();
      await expect(
        page.locator("main .page-error, main .error-box"),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      if (p.id === "jee-2027")
        await page.screenshot({
          path: `output/screenshots/${section || "overview"}-desktop.png`,
          fullPage: true,
        });
    }
  }
  expect(errors).toEqual([]);
});
test("phone layouts fit, menus work, and dark mode persists", async ({
  page,
}) => {
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of [
      "",
      "study",
      "cramazon",
      "library",
      "calendar",
      "progress",
    ]) {
      await page.goto(`/projects/jee-2027${route ? "/" + route : ""}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow ${route} ${width}`,
      ).toBeTruthy();
      if (width === 390)
        await page.screenshot({
          path: `output/screenshots/${route || "overview"}-mobile.png`,
          fullPage: true,
        });
    }
  }
  await page.goto("/projects/jee-2027/study");
  await expect(page.getByLabel("Add context", { exact: true })).toBeVisible();
  await page.getByLabel("Add context", { exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: /Upload a file/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/screenshots/composer-menu-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Close dialog").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "output/screenshots/study-dark-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open workspace profile" }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByLabel("Close dialog").click();
});
test("create project, save message, task, note and preferences, then reopen", async ({
  page,
  request,
}) => {
  let projectId = "";
  const projectName = `QA workspace ${Date.now()}`;
  try {
    await page.goto("/projects");
    await expect(
      page.getByRole("heading", { name: "A place for every ambition." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill(projectName);
    await page
      .getByLabel("Subjects or courses", { exact: false })
      .fill("Physics");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects\/project-/);
    projectId = page.url().split("/projects/")[1];
    await page
      .getByRole("navigation", { name: "Project navigation", exact: true })
      .getByRole("link", { name: "Study", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Study message" })
      .fill("How does a projectile move?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page).toHaveURL(/\/study\/conversation-/);
    await expect(
      page.getByText("Your message is saved.", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .locator(".message-user")
        .getByText("How does a projectile move?", { exact: true }),
    ).toBeVisible();
    const noteResponse = await request.post(
      `/api/projects/${projectId}/resources`,
      {
        data: {
          title: "My connected note",
          type: "note",
          subject: "Physics",
          content: "Velocity has magnitude and direction.",
        },
      },
    );
    expect(noteResponse.ok()).toBeTruthy();
    const { item: note } = await noteResponse.json();
    await page.goto(`/projects/${projectId}/library/${note.id}`);
    await expect(
      page.getByRole("heading", { name: "My connected note" }),
    ).toBeVisible();
    await expect(
      page.getByText("Velocity has magnitude and direction.", { exact: true }),
    ).toBeVisible();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const taskResponse = await request.post(
      `/api/projects/${projectId}/tasks`,
      {
        data: {
          title: "Review connected learning",
          date: today,
          time: "17:00",
          duration: 20,
          subject: "Physics",
        },
      },
    );
    expect(taskResponse.ok()).toBeTruthy();
    await page.goto(`/projects/${projectId}`);
    await expect(
      page.getByRole("link", { name: "Review connected learning" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Complete Review connected learning" })
      .click();
    await expect(
      page.getByRole("button", { name: "Reopen Review connected learning" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Reopen Review connected learning" }),
    ).toBeVisible();
    await page.goto(`/projects/${projectId}/settings`);
    await page.getByLabel("Tutor tone").selectOption("Patient & detailed");
    await page
      .getByRole("button", { name: "Show Coverage & practice", exact: true })
      .click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByText("Changes saved", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Tutor tone")).toHaveValue(
      "Patient & detailed",
    );
    await page.goto(`/projects/${projectId}`);
    await expect(
      page.getByRole("heading", {
        name: "A little more understood.",
        exact: true,
      }),
    ).toBeVisible();
    const wrong = await request.get(
      `/api/projects/neet-2027/resources/${note.id}`,
    );
    expect(wrong.status()).toBe(404);
  } finally {
    if (projectId)
      await request.delete(`/api/projects/${projectId}`, {
        data: { confirmName: projectName },
      });
  }
});
test("failed sends retain drafts and selected project sources stay scoped", async ({
  page,
  request,
}) => {
  const name = `QA recoverable draft ${Date.now()}`;
  const { item: project } = await (
    await request.post("/api/projects", {
      data: { name, exam: "Custom", subjects: ["Physics"] },
    })
  ).json();
  try {
    const { item: source } = await (
      await request.post(`/api/projects/${project.id}/resources`, {
        data: {
          title: "Only in this project",
          type: "note",
          content: "An original source passage.",
        },
      })
    ).json();
    await page.goto(`/projects/${project.id}/study?resource=${source.id}`);
    await expect(page.getByLabel("Remove Only in this project")).toBeVisible();
    await page
      .getByRole("textbox", { name: "Study message" })
      .fill("Please help me understand this source.");
    await page.route(
      `**/api/projects/${project.id}/conversations/*/messages`,
      (route) => route.abort("failed"),
    );
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("main .error-box")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Study message" }),
    ).toHaveValue("Please help me understand this source.");
    await page.unroute(
      `**/api/projects/${project.id}/conversations/*/messages`,
    );
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByText("Your message is saved.", { exact: false }),
    ).toBeVisible();
    const { items } = await (
      await request.get(`/api/projects/${project.id}/conversations`)
    ).json();
    expect(items).toHaveLength(1);
    await page.goto("/projects/neet-2027/study");
    await expect(page.getByLabel("Remove Only in this project")).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Study message" }),
    ).toHaveValue("");
    await page.getByRole("button", { name: "Choose study tool" }).click();
    await expect(page.getByRole("menu", { name: "Study tools" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Choose study tool" }),
    ).toBeFocused();
  } finally {
    await request.delete(`/api/projects/${project.id}`, {
      data: { confirmName: name },
    });
  }
});
