import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { id, pool, query } from "../src/server/db";
import { insertRow, updateEntity } from "../src/server/entities";
import {
  importYouTubeLesson,
  importYouTubePlaylist,
  previewPlaylist,
  resolveYouTube,
  searchYouTube,
} from "../src/server/youtube";
import {
  clearWatchHistory,
  recordPlayback,
  watchHistory,
} from "../src/server/playback";
import { parseYouTubeLink, youtubeDuration } from "../src/domain/youtube";
const projectId = id("youtube-fixture"),
  otherId = id("youtube-other");
const videoA = "AAAAAAAAAAA",
  videoB = "BBBBBBBBBBB",
  videoC = "CCCCCCCCCCC";
let historyLessonId = "";
beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("YOUTUBE_API_KEY", "");
  if (
    (await query("SELECT current_database() AS name")).rows[0].name !==
    "ingenium_demo"
  )
    throw new Error("Use the isolated demo database");
  for (const pid of [projectId, otherId])
    await insertRow("projects", {
      id: pid,
      studentId: "adi-demo",
      name: "YouTube test fixture",
      exam: "Any course",
      subjects: ["Literature", "History"],
    });
});
afterAll(async () => {
  await query("DELETE FROM projects WHERE id=ANY($1::text[])", [
    [projectId, otherId],
  ]);
  await pool.end();
  vi.unstubAllEnvs();
});
function fixtureFetcher() {
  const calls: URL[] = [];
  const fetcher = vi.fn(
    async (input: URL | string | Request, options?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url);
      expect([
        "https://www.youtube.com",
        "https://www.googleapis.com",
      ]).toContain(url.origin);
      expect(options?.redirect).toBe("error");
      if (url.pathname === "/oembed") {
        const videoId = new URL(url.searchParams.get("url")!).searchParams.get(
          "v",
        );
        if (videoId === "PPPPPPPPPPP")
          return Response.json({ error: "not found" }, { status: 404 });
        return Response.json({
          title: "A lesson for any learner",
          author_name: "Fixture educator",
          thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          html: "<iframe>not used</iframe>",
        });
      }
      if (url.pathname.endsWith("/search"))
        return Response.json({
          items: [{ id: { videoId: videoA } }, { id: { videoId: videoB } }],
          ...(url.searchParams.has("pageToken")
            ? {}
            : { nextPageToken: "NEXT_SEARCH_TOKEN" }),
        });
      if (url.pathname.endsWith("/videos"))
        return Response.json({
          items: (url.searchParams.get("id") || "")
            .split(",")
            .map((videoId) => ({
              id: videoId,
              snippet: {
                title: `Fixture ${videoId}`,
                channelTitle: "Fixture educator",
                description: "Fixture API content",
                thumbnails: {
                  medium: {
                    url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                  },
                },
              },
              contentDetails: { duration: "PT12M30S" },
              status: {
                embeddable: videoId !== videoB,
                privacyStatus: "public",
              },
            })),
        });
      if (url.pathname.endsWith("/playlistItems"))
        return Response.json({
          items: [videoA, videoB, videoC].map((videoId, position) => ({
            snippet: {
              title: `Fixture ${videoId}`,
              position,
              resourceId: { videoId },
            },
            contentDetails: { videoId },
          })),
          pageInfo: { totalResults: 4 },
          nextPageToken: "NEXT_PLAYLIST_TOKEN",
        });
      if (url.pathname.endsWith("/playlists"))
        return Response.json({
          items: [{ snippet: { title: "An interdisciplinary playlist" } }],
        });
      throw new Error("Unexpected fixture endpoint");
    },
  ) as unknown as typeof fetch;
  return { fetcher, calls };
}
describe("YouTube URL handling", () => {
  it("accepts watch, short, live, embed and short-link formats without an exam filter", () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${videoA}`,
      `https://youtu.be/${videoA}?t=1m2s`,
      `https://youtube.com/shorts/${videoA}`,
      `https://m.youtube.com/live/${videoA}`,
      `https://www.youtube-nocookie.com/embed/${videoA}`,
    ])
      expect(parseYouTubeLink(link).videoId).toBe(videoA);
    expect(
      parseYouTubeLink(`https://youtu.be/${videoA}?t=1m2s`).startSeconds,
    ).toBe(62);
    expect(
      parseYouTubeLink("https://youtube.com/playlist?list=PLabcdefghij12345")
        .kind,
    ).toBe("playlist");
    expect(youtubeDuration("PT1H2M3S")).toBe(3723);
  });
  it("rejects arbitrary URLs, misleading hosts, userinfo and malformed IDs", () => {
    for (const value of [
      "http://127.0.0.1/secret",
      "https://youtube.com.attacker.test/watch?v=" + videoA,
      "https://user:pass@youtube.com/watch?v=" + videoA,
      "https://youtu.be/short",
      "javascript:alert(1)",
      "https://youtube.com:444/watch?v=" + videoA,
    ])
      expect(() => parseYouTubeLink(value)).toThrow();
  });
});
describe("YouTube provider adapters — deterministic fixture responses, no API key used", () => {
  it("resolves oEmbed metadata from a fixed host and caches it", async () => {
    const { fetcher, calls } = fixtureFetcher();
    const first = await resolveYouTube(
      projectId,
      `https://youtu.be/${videoA}`,
      fetcher,
    );
    expect(first.verification).toBe("verified");
    expect(first.title).toBe("A lesson for any learner");
    await resolveYouTube(
      projectId,
      `https://youtube.com/shorts/${videoA}`,
      fetcher,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].origin).toBe("https://www.youtube.com");
  });
  it("shows unconfigured search and playlist state without pretending to search", async () => {
    const { fetcher, calls } = fixtureFetcher();
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const result = await searchYouTube(
      projectId,
      { q: "Any public topic" },
      fetcher,
    );
    expect(result.available).toBe(false);
    expect(result.items).toEqual([]);
    const playlist = await previewPlaylist(
      projectId,
      { url: "https://youtube.com/playlist?list=PLabcdefghij12345" },
      fetcher,
    );
    expect(playlist.available).toBe(false);
    expect(playlist.complete).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("filters non-embeddable API results and scopes cached pagination cursors", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "fixture-not-a-real-key");
    const { fetcher, calls } = fixtureFetcher();
    const result = await searchYouTube(
      projectId,
      { q: "Literature across cultures" },
      fetcher,
    );
    expect(result.items.map((v: any) => v.videoId)).toEqual([videoA]);
    expect(result.items[0].duration).toBe(750);
    const count = calls.length;
    await searchYouTube(
      projectId,
      { q: "Literature across cultures" },
      fetcher,
    );
    expect(calls).toHaveLength(count);
    await expect(
      searchYouTube(
        otherId,
        { q: "Literature across cultures", cursor: result.nextCursor! },
        fetcher,
      ),
    ).rejects.toThrow("expired or belongs");
    await expect(
      searchYouTube(
        projectId,
        { q: "Different query", cursor: result.nextCursor! },
        fetcher,
      ),
    ).rejects.toThrow("expired or belongs");
    await searchYouTube(
      projectId,
      { q: "Literature across cultures", cursor: result.nextCursor! },
      fetcher,
    );
    expect(
      calls.some(
        (u) => u.searchParams.get("pageToken") === "NEXT_SEARCH_TOKEN",
      ),
    ).toBe(true);
  });
  it("imports a general-topic video once per project and allows explicit unverified manual metadata", async () => {
    const { fetcher } = fixtureFetcher();
    const first = await importYouTubeLesson(
      projectId,
      { url: `https://www.youtube.com/live/${videoA}`, subject: "Literature" },
      fetcher,
    );
    historyLessonId = first.item.id;
    expect(first.existing).toBe(false);
    expect(first.item.subject).toBe("Literature");
    const second = await importYouTubeLesson(
      projectId,
      { url: `https://youtu.be/${videoA}` },
      fetcher,
    );
    expect(second.item.id).toBe(first.item.id);
    expect(second.existing).toBe(true);
    const separate = await importYouTubeLesson(
      otherId,
      { url: `https://youtu.be/${videoA}` },
      fetcher,
    );
    expect(separate.item.id).not.toBe(first.item.id);
    const manual = await importYouTubeLesson(
      projectId,
      {
        url: "https://youtu.be/PPPPPPPPPPP",
        title: "My manually labelled link",
      },
      fetcher,
    );
    expect(manual.metadataStatus).toBe("unavailable");
    expect(manual.item.metadata.verifiedAt).toBeNull();
  });
  it("imports only selected verified playlist videos and reports skipped/remaining items", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "fixture-not-a-real-key");
    const { fetcher } = fixtureFetcher();
    const url = "https://youtube.com/playlist?list=PLabcdefghij12345";
    const preview = await previewPlaylist(projectId, { url }, fetcher);
    expect(preview.items.map((v: any) => v.videoId)).toEqual([videoA, videoC]);
    expect(preview.unavailableItems).toHaveLength(1);
    const imported = await importYouTubePlaylist(
      projectId,
      { url, videoIds: [videoC], subject: "History" },
      fetcher,
    );
    expect(imported.imported).toBe(1);
    expect(imported.items).toHaveLength(1);
    expect(imported.complete).toBe(false);
    expect(imported.item.metadata.partialImport).toBe(true);
    const repeated = await importYouTubePlaylist(
      projectId,
      { url, videoIds: [videoC] },
      fetcher,
    );
    expect(repeated.imported).toBe(0);
    expect(repeated.existing).toBe(1);
    expect(repeated.item.metadata.lessonIds).toHaveLength(1);
    await expect(
      importYouTubePlaylist(projectId, { url, videoIds: [videoB] }, fetcher),
    ).rejects.toThrow("not part of this verified");
  });
});
describe("durable playback history", () => {
  it("saves resume position, measured time and distinct sessions idempotently", async () => {
    const event = {
      eventId: "event-one",
      sessionId: "session-one",
      position: 12,
      duration: 750,
      watchedSeconds: 10,
      state: "playing",
    };
    const first = await recordPlayback(projectId, historyLessonId, event);
    const retry = await recordPlayback(projectId, historyLessonId, event);
    expect(first.watchedSeconds).toBe(10);
    expect(retry.watchedSeconds).toBe(10);
    await recordPlayback(projectId, historyLessonId, {
      ...event,
      eventId: "event-two",
      position: 42,
      watchedSeconds: 8,
      state: "paused",
    });
    await recordPlayback(projectId, historyLessonId, {
      ...event,
      eventId: "event-three",
      sessionId: "session-two",
      position: 50,
      watchedSeconds: 5,
      state: "closed",
    });
    const history = await watchHistory(projectId);
    const item = history.items.find((row: any) => row.id === historyLessonId);
    expect(item.position).toBe(50);
    expect(item.watchedSeconds).toBe(23);
    expect(item.sessionCount).toBe(2);
    expect(item.lastWatchedAt).toBeTruthy();
    const sessions = await watchHistory(projectId, historyLessonId);
    expect(sessions.items).toHaveLength(2);
    expect((await watchHistory(otherId)).items).toHaveLength(0);
  });
  it("does not count seeking as viewing and rejects cross-project event writes", async () => {
    const before = (await watchHistory(projectId)).items.find(
      (i: any) => i.id === historyLessonId,
    ).watchedSeconds;
    const after = await recordPlayback(projectId, historyLessonId, {
      eventId: "seek-event",
      sessionId: "session-two",
      position: 749,
      watchedSeconds: 0,
      state: "seeked",
    });
    expect(after.watchedSeconds).toBe(before);
    expect(after.completed).toBe(false);
    await expect(
      recordPlayback(otherId, historyLessonId, {
        eventId: "bad-scope",
        sessionId: "session-three",
        position: 5,
        watchedSeconds: 5,
        state: "playing",
      }),
    ).rejects.toThrow("not found in this project");
  });
  it("keeps legacy PATCH playback compatible with the same history records", async () => {
    const result = await updateEntity("lessons", projectId, historyLessonId, {
      position: 75,
      watchedSeconds: 2,
    });
    expect(result.position).toBe(75);
    expect(result.watchedSeconds).toBe(25);
    expect(
      (await watchHistory(projectId)).items.some(
        (i: any) => i.id === historyLessonId,
      ),
    ).toBe(true);
  });
  it("counts delayed event deltas once without rolling the resume position or session state backward", async () => {
    const lesson = await insertRow("lessons", {
      id: id("ordering-lesson"),
      projectId,
      title: "Ordered playback fixture",
      videoId: videoC,
    });
    const base = Date.now() - 10000;
    const event = {
      sessionId: "ordered-session",
      watchedSeconds: 4,
      state: "playing",
      duration: 400,
    };
    await recordPlayback(projectId, lesson.id, {
      ...event,
      eventId: "ordered-new",
      position: 40,
      sequence: 2,
      occurredAt: new Date(base + 2000).toISOString(),
      state: "paused",
    });
    const late = await recordPlayback(projectId, lesson.id, {
      ...event,
      eventId: "ordered-old",
      position: 10,
      sequence: 1,
      occurredAt: new Date(base).toISOString(),
    });
    expect(late.position).toBe(40);
    expect(late.watchedSeconds).toBe(8);
    const sessions = await watchHistory(projectId, lesson.id);
    expect(sessions.items[0].state).toBe("paused");
    await recordPlayback(projectId, lesson.id, {
      ...event,
      sessionId: "new-tab-session",
      eventId: "new-tab-first",
      position: 80,
      sequence: 1,
      occurredAt: new Date(base + 4000).toISOString(),
    });
    const oldTab = await recordPlayback(projectId, lesson.id, {
      ...event,
      eventId: "old-tab-last",
      position: 60,
      sequence: 3,
      occurredAt: new Date(base + 3000).toISOString(),
      state: "closed",
    });
    expect(oldTab.position).toBe(80);
    expect(oldTab.watchedSeconds).toBe(16);
    await clearWatchHistory(projectId, lesson.id);
  });
  it("clears viewing history while retaining lessons, notes and manual completion", async () => {
    await updateEntity("lessons", projectId, historyLessonId, {
      completed: true,
    });
    const note = await insertRow("resources", {
      id: id("video-note"),
      projectId,
      title: "My durable video note",
      type: "video-note",
      content: "I understood this example.",
      metadata: { lessonId: historyLessonId, timestamp: 42 },
    });
    await clearWatchHistory(projectId, historyLessonId);
    expect((await watchHistory(projectId)).items).toEqual([]);
    const lesson = (
      await query("SELECT * FROM lessons WHERE id=$1", [historyLessonId])
    ).rows[0];
    expect(lesson.completed).toBe(true);
    expect(Number(lesson.position)).toBe(0);
    expect(Number(lesson.watched_seconds)).toBe(0);
    expect(
      (await query("SELECT id FROM resources WHERE id=$1", [note.id])).rowCount,
    ).toBe(1);
    expect(
      Number(
        (
          await query(
            "SELECT count(*) FROM lesson_playback_events WHERE lesson_id=$1",
            [historyLessonId],
          )
        ).rows[0].count,
      ),
    ).toBe(0);
  });
});
