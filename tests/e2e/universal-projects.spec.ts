import { expect, test } from "@playwright/test";

test("INFO1110 course creation, text syllabus import and metadata edits preserve learning history", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const name = `INFO1110 acceptance ${Date.now()}`;
  let projectId = "";
  try {
    await page.goto("/projects");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    await page
      .getByLabel("Starting template", { exact: true })
      .selectOption("info1110");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill(name);
    await expect(
      page.getByLabel("School or institution", { exact: true }),
    ).toHaveValue("University of Sydney");
    await expect(page.getByLabel("Course code", { exact: true })).toHaveValue(
      "INFO1110",
    );
    await page
      .getByLabel("Academic year or session", { exact: true })
      .fill("Semester 1 2027");
    await page
      .getByLabel("Subjects or courses", { exact: false })
      .fill("Programming, Software testing");
    await page.screenshot({
      path: "output/screenshots/universal-course-creation-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByLabel("Your learning goal", { exact: true })
      .fill("Understand functions and test my own programs");
    await page
      .getByLabel("Import syllabus text file", { exact: true })
      .setInputFiles({
        name: "my-course-outline.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Programming | Functions\nProgramming | Loops"),
      });
    await expect(
      page.getByText("2 topics in this outline", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects\/project-/);
    projectId = page.url().split("/projects/")[1];
    await expect(page.locator(".overview-hero")).toContainText("INFO1110");
    await expect(page.locator(".trajectory")).toHaveCount(0);
    await expect(
      page.getByText("Your next discovery", { exact: true }),
    ).toBeVisible();
    const project = (
      await (await request.get(`/api/projects/${projectId}`)).json()
    ).project;
    expect(project).toMatchObject({
      projectKind: "course",
      institution: "University of Sydney",
      courseCode: "INFO1110",
      academicYear: "Semester 1 2027",
    });
    for (const entity of [
      "questions",
      "attempts",
      "resources",
      "lessons",
      "tasks",
      "flashcards",
    ])
      expect(
        (
          await (
            await request.get(`/api/projects/${projectId}/${entity}`)
          ).json()
        ).items,
      ).toHaveLength(0);
    const original = await (
      await request.get(`/api/projects/${projectId}/curriculum`)
    ).json();
    expect(original.topics).toHaveLength(2);
    const functions = original.topics.find(
      (t: { title: string }) => t.title === "Functions",
    );
    expect(
      (
        await request.patch(`/api/projects/${projectId}/curriculum`, {
          data: { ...functions, action: "update-topic", coverage: "covered" },
        })
      ).ok(),
    ).toBeTruthy();
    await page.screenshot({
      path: "output/screenshots/universal-course-overview-desktop.png",
      fullPage: true,
    });
    await page.goto(`/projects/${projectId}/settings`);
    await page
      .getByLabel("Subjects or courses", { exact: false })
      .fill("Software testing");
    await page
      .getByLabel("Qualification or exam board", { exact: true })
      .fill("My course outline v2");
    await page
      .getByLabel("Academic year or session", { exact: true })
      .fill("Semester 2 2027");
    await page
      .getByLabel("Syllabus or topic outline", { exact: false })
      .fill("Programming | Functions\nSoftware testing | Test cases");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText("Changes saved", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Academic year or session", { exact: true }),
    ).toHaveValue("Semester 2 2027");
    await expect(
      page.getByLabel("Subjects or courses", { exact: false }),
    ).toHaveValue("Software testing");
    const updated = await (
      await request.get(`/api/projects/${projectId}/curriculum`)
    ).json();
    expect(updated.topics).toHaveLength(3);
    expect(
      updated.topics.find((t: { id: string }) => t.id === functions.id)
        ?.coverage,
    ).toBe("covered");
    expect(
      updated.topics.some((t: { title: string }) => t.title === "Loops"),
    ).toBeTruthy();
    await page.goto(`/projects/${projectId}/progress`);
    await page.getByRole("button", { name: "Syllabus", exact: true }).click();
    await expect(page.locator(".curriculum-topics")).toContainText(
      "Test cases",
    );
    await expect(page.locator(".curriculum-template")).toContainText(
      "Not an official INFO1110",
    );
    await page.screenshot({
      path: "output/screenshots/universal-course-syllabus-desktop.png",
      fullPage: true,
    });
  } finally {
    if (projectId)
      await request.delete(`/api/projects/${projectId}`, {
        data: { confirmName: name },
      });
  }
});

test("mobile school project permits humanities subjects and a named board without science defaults", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const name = `A-level humanities ${Date.now()}`;
  let projectId = "";
  try {
    await page.goto("/projects");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    await page
      .getByLabel("Starting template", { exact: true })
      .selectOption("alevel");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByLabel("Subjects or courses", { exact: false }),
    ).toHaveValue("");
    await page.getByLabel("Project name", { exact: true }).fill(name);
    await page
      .getByLabel("Subjects or courses", { exact: false })
      .fill("History, English Literature");
    await page
      .getByLabel("Qualification or exam board", { exact: true })
      .fill("A-levels · my exam board");
    await page
      .getByLabel("Level or year of study", { exact: true })
      .fill("Year 13");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByLabel("Your learning goal", { exact: true })
      .fill("Write clear arguments supported by evidence");
    await page.screenshot({
      path: "output/screenshots/universal-school-creation-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects\/project-/);
    projectId = page.url().split("/projects/")[1];
    await expect(
      page.getByText("Your next discovery", { exact: true }),
    ).toBeVisible();
    const project = (
      await (await request.get(`/api/projects/${projectId}`)).json()
    ).project;
    expect(project.subjects).toEqual(["History", "English Literature"]);
    expect(project.projectKind).toBe("school");
    expect(
      (
        await (
          await request.get(`/api/projects/${projectId}/curriculum`)
        ).json()
      ).topics,
    ).toHaveLength(0);
    await expect(page.locator(".trajectory")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: "output/screenshots/universal-school-overview-mobile.png",
      fullPage: true,
    });
  } finally {
    if (projectId)
      await request.delete(`/api/projects/${projectId}`, {
        data: { confirmName: name },
      });
  }
});
