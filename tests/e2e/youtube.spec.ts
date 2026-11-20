import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

let projectId = "";
let projectName = "";
const apiBase = () => `/api/projects/${projectId}`;
async function history(request: APIRequestContext) {
  const response = await request.get(`${apiBase()}/lessons/history`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).items as Array<{
    id: string;
    position: number;
    watchedSeconds: number;
    lastWatchedAt: string;
  }>;
}
async function createLesson(
  request: APIRequestContext,
  title = "Understanding an idea",
) {
  const response = await request.post(`${apiBase()}/lessons`, {
    data: {
      title,
      subject: "Creative thinking",
      videoId: "kKKM8Y-u7ds",
      duration: 300,
      saved: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).item as { id: string };
}
async function recordPlayback(
  request: APIRequestContext,
  id: string,
  position: number,
) {
  const response = await request.post(`${apiBase()}/lessons/${id}/playback`, {
    data: {
      sessionId: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      position,
      duration: 300,
      watchedSeconds: 10,
      state: "paused",
    },
  });
  expect(response.ok()).toBeTruthy();
}
async function installPlayerFixture(page: Page) {
  // Exercise the real playback/history API with deterministic IFrame API events.
  // This fixture does not claim to verify YouTube's external streaming service.
  await page.addInitScript(() => {
    const host = window as unknown as {
      YT: unknown;
      __player: {
        position: number;
        state: number;
        start: number;
        emit: (state: number) => void;
        fail: () => void;
      };
    };
    host.YT = {
      Player: class {
        position: number;
        state = -1;
        start: number;
        events: {
          onReady: () => void;
          onStateChange: (event: { data: number }) => void;
          onError: (event: { data: number }) => void;
        };
        interval: ReturnType<typeof setInterval>;
        constructor(
          element: HTMLElement,
          options: {
            playerVars: { start: number };
            events: {
              onReady: () => void;
              onStateChange: (event: { data: number }) => void;
              onError: (event: { data: number }) => void;
            };
          },
        ) {
          this.position = options.playerVars.start || 0;
          this.start = this.position;
          this.events = options.events;
          element.textContent = "Controlled video player fixture";
          host.__player = this;
          this.interval = setInterval(() => {
            if (this.state === 1) this.position += 0.25;
          }, 250);
          queueMicrotask(() => this.events.onReady());
        }
        getCurrentTime() {
          return this.position;
        }
        getDuration() {
          return 300;
        }
        getPlayerState() {
          return this.state;
        }
        seekTo(position: number) {
          this.position = position;
        }
        emit(state: number) {
          this.state = state;
          this.events.onStateChange({ data: state });
        }
        fail() {
          this.events.onError({ data: 101 });
        }
        destroy() {
          clearInterval(this.interval);
        }
      },
    };
  });
}

test.beforeEach(async ({ request }) => {
  projectId = "";
  projectName = `YouTube acceptance ${Date.now()}`;
  const response = await request.post("/api/projects", {
    data: {
      name: projectName,
      exam: "Custom",
      subjects: ["Creative thinking"],
      settings: { enabledTools: ["ask", "notes", "lessons"] },
    },
  });
  expect(response.ok()).toBeTruthy();
  projectId = (await response.json()).project.id;
});
test.afterEach(async ({ request }) => {
  if (projectId)
    await request.delete(apiBase(), { data: { confirmName: projectName } });
});

test("watch history persists, resumes, and clears only viewing state after confirmation", async ({
  page,
  request,
}) => {
  const first = await createLesson(request, "A useful creative process");
  const second = await createLesson(request, "Making space for ideas");
  await recordPlayback(request, first.id, 65);
  await recordPlayback(request, second.id, 120);
  await request.post(`${apiBase()}/lessons/${first.id}/notes`, {
    data: {
      content: "Keep this insight after clearing history.",
      timestamp: 40,
    },
  });
  await page.goto(`/projects/${projectId}/cramazon?view=history`);
  await expect(
    page.getByRole("heading", { name: "Your learning trail.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".video-history-item")).toHaveCount(2);
  await expect(page.locator(".video-history-item").first()).toContainText(
    "Making space for ideas",
  );
  await page.reload();
  await expect(page.locator(".video-history-item")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Continue watching", exact: true })
    .click();
  await expect(page.getByText("Resume at 1:05", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByLabel("History period", { exact: true })
    .selectOption("Today");
  await expect(page.locator(".video-history-item")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Remove A useful creative process from history",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(await history(request)).toHaveLength(2);
  await page
    .getByRole("button", {
      name: "Remove A useful creative process from history",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove from history", exact: true })
    .click();
  await expect(page.locator(".video-history-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clear watch history", exact: true })
    .click();
  await expect.poll(async () => (await history(request)).length).toBe(0);
  const lessons = (await (await request.get(`${apiBase()}/lessons`)).json())
    .items;
  expect(lessons).toHaveLength(2);
  expect(
    lessons.every(
      (lesson: { saved: boolean; position: number }) =>
        lesson.saved && lesson.position === 0,
    ),
  ).toBeTruthy();
  const notes = (
    await (await request.get(`${apiBase()}/lessons/${first.id}/notes`)).json()
  ).items;
  expect(notes[0].content).toBe("Keep this insight after clearing history.");
  await page.getByRole("button", { name: "Watch later", exact: true }).click();
  await expect(page.locator(".video-card")).toHaveCount(2);
});

test("player events save progress, pagehide flushes, reload resumes, and blocked embeds keep notes usable", async ({
  page,
  request,
}) => {
  const lesson = await createLesson(request);
  await installPlayerFixture(page);
  await page.goto(`/projects/${projectId}/cramazon/${lesson.id}`);
  await expect(
    page.getByText("Controlled video player fixture", { exact: true }),
  ).toBeVisible();
  expect(await history(request)).toHaveLength(0);
  await page.evaluate(() => (window as any).__player.emit(1));
  await expect.poll(async () => (await history(request)).length).toBe(1);
  await expect
    .poll(async () => page.evaluate(() => (window as any).__player.position))
    .toBeGreaterThan(2);
  await page.evaluate(() => (window as any).__player.emit(2));
  await expect
    .poll(async () => (await history(request))[0]?.watchedSeconds)
    .toBeGreaterThanOrEqual(1);
  await page.evaluate(() => {
    const player = (window as any).__player;
    player.position = 73;
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
  });
  await expect.poll(async () => (await history(request))[0]?.position).toBe(73);
  await page.reload();
  await expect(
    page.getByText("Controlled video player fixture", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__player.start)).toBe(73);
  await page
    .getByLabel("Timestamped lesson note", { exact: true })
    .fill("This timestamp is worth revisiting.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page.getByText("This timestamp is worth revisiting.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (window as any).__player.fail());
  const external = page.getByRole("link", {
    name: "Continue on YouTube",
    exact: true,
  });
  await expect(external).toBeVisible();
  await expect(external).toHaveAttribute("href", /[?&]t=73s/);
  await expect(
    page.getByRole("link", { name: "Open timestamp on YouTube", exact: true }),
  ).toHaveAttribute("href", /[?&]t=73s/);
  const notes = (
    await (await request.get(`${apiBase()}/lessons/${lesson.id}/notes`)).json()
  ).items;
  expect(notes[0].metadata.timestamp).toBe(73);
});

test("discovery reports search availability and imports a real YouTube URL without duplicate lessons", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const capabilities = await (
    await request.get(`${apiBase()}/youtube/capabilities`)
  ).json();
  await page.goto(`/projects/${projectId}/cramazon`);
  const search = page.getByRole("textbox", {
    name: "Search YouTube or paste a link",
    exact: true,
  });
  if (!capabilities.search) {
    await search.fill("creative thinking");
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "YouTube search isn’t connected yet.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Search “creative thinking”",
        exact: true,
      }),
    ).toHaveAttribute(
      "href",
      "https://www.youtube.com/results?search_query=creative%20thinking",
    );
    await expect(page.locator(".video-search-results .video-card")).toHaveCount(
      0,
    );
  }
  await search.fill("https://www.youtube.com/watch?v=kKKM8Y-u7ds");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.locator(".video-link-preview")).toBeVisible({
    timeout: 20000,
  });
  const manual = page.getByRole("textbox", {
    name: "Lesson title",
    exact: true,
  });
  if (await manual.count()) await manual.fill("A public lesson to revisit");
  await page
    .getByRole("button", { name: "Save & open lesson", exact: true })
    .click();
  await expect(page).toHaveURL(/\/cramazon\/lesson-/, { timeout: 20000 });
  const lessons = (await (await request.get(`${apiBase()}/lessons`)).json())
    .items;
  expect(lessons).toHaveLength(1);
  expect(lessons[0].videoId).toBe("kKKM8Y-u7ds");
  const repeated = await request.post(`${apiBase()}/lessons/import`, {
    data: {
      url: "https://youtu.be/kKKM8Y-u7ds",
      title: "Same video",
      saved: true,
    },
  });
  expect(repeated.ok()).toBeTruthy();
  expect((await repeated.json()).existing).toBe(true);
  expect(
    (await (await request.get(`${apiBase()}/lessons`)).json()).items,
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("notes save while the external player is still initializing", async ({
  page,
  request,
}) => {
  const lesson = await createLesson(request, "A video with a slow player");
  await page.addInitScript(() => {
    (window as any).YT = {
      Player: class {
        constructor() {}
        destroy() {}
      },
    };
  });
  await page.goto(`/projects/${projectId}/cramazon/${lesson.id}`);
  await page
    .getByRole("textbox", { name: "Timestamped lesson note", exact: true })
    .fill("An insight before playback begins.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page
      .locator(".video-notes-list")
      .getByText("An insight before playback begins.", { exact: true }),
  ).toBeVisible();
  const notes = (
    await (await request.get(`${apiBase()}/lessons/${lesson.id}/notes`)).json()
  ).items;
  expect(notes[0].metadata.timestamp).toBe(0);
  expect(await history(request)).toHaveLength(0);
});
