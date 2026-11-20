import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import {
  ApiError,
  camel,
  currentStudentId,
  id,
  projectExists,
  query,
  transaction,
} from "./db";
import { insertRow } from "./entities";
import { consumeRequestBudget as enforceRequestBudget } from "./identity";
import {
  parseYouTubeLink,
  validVideoId,
  youtubeDuration,
} from "../domain/youtube";
export type YouTubeVideo = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  embeddable: boolean | null;
  description?: string;
  url: string;
  verification: "verified" | "unavailable";
  notice?: string;
};
type Fetcher = typeof fetch;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const unavailable =
  "YouTube search and playlist import are not connected. Add any public embeddable YouTube video by link, or configure a server-side YouTube Data API key.";
function parseLink(input: string) {
  try {
    return parseYouTubeLink(input);
  } catch (error) {
    throw new ApiError(400, (error as Error).message);
  }
}
async function cacheRead(projectId: string, key: string) {
  return (
    await query(
      "SELECT payload FROM youtube_cache WHERE project_id=$1 AND cache_key=$2 AND expires_at>now()",
      [projectId, key],
    )
  ).rows[0]?.payload;
}
async function cacheWrite(
  projectId: string,
  key: string,
  payload: unknown,
  seconds = 900,
) {
  await query(
    "DELETE FROM youtube_cache WHERE project_id=$1 AND expires_at<=now()",
    [projectId],
  );
  await query(
    "DELETE FROM youtube_cursors WHERE project_id=$1 AND expires_at<=now()",
    [projectId],
  );
  await query(
    "INSERT INTO youtube_cache(project_id,cache_key,payload,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second') ON CONFLICT(project_id,cache_key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at",
    [projectId, key, JSON.stringify(payload), seconds],
  );
}
async function fetchJson(url: URL, fetcher: Fetcher) {
  // Callers construct one of these exact HTTPS origins. Redirects never change trust boundaries.
  if (
    !["https://www.youtube.com", "https://www.googleapis.com"].includes(
      url.origin,
    )
  )
    throw new ApiError(400, "Unsupported metadata provider");
  let result: Response;
  try {
    result = await fetcher(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError(
      503,
      "YouTube could not be reached. Your saved lessons and notes remain available.",
    );
  }
  if (!result.ok) {
    if (result.status === 403 || result.status === 429)
      throw new ApiError(
        503,
        "YouTube metadata is unavailable or its API quota is exhausted. Try again later or add a link manually.",
      );
    if (result.status === 404 || result.status === 401)
      throw new ApiError(
        404,
        "This YouTube item is unavailable, private, or cannot be embedded.",
      );
    throw new ApiError(503, "YouTube could not complete this request.");
  }
  if (Number(result.headers.get("content-length") || 0) > 2_000_000)
    throw new ApiError(502, "The provider response was too large");
  const text = await result.text();
  if (text.length > 2_000_000)
    throw new ApiError(502, "The provider response was too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, "YouTube returned an invalid metadata response");
  }
}
function dataUrl(
  endpoint: "search" | "playlistItems" | "videos" | "playlists",
  params: Record<string, string>,
) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new ApiError(503, unavailable);
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, value);
  url.searchParams.set("key", key);
  return url;
}
function plainTitle(value: unknown) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .slice(0, 300);
}
function videoFromApi(row: any): YouTubeVideo {
  const snippet = row.snippet || {};
  return {
    videoId: row.id,
    title: plainTitle(snippet.title),
    channel: plainTitle(snippet.channelTitle),
    thumbnail: String(
      snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
    ),
    duration: youtubeDuration(row.contentDetails?.duration || ""),
    embeddable: row.status?.embeddable === true,
    url: `https://www.youtube.com/watch?v=${row.id}`,
    verification: "verified",
    description: String(snippet.description || "").slice(0, 5000),
  };
}
async function videoDetails(ids: string[], fetcher: Fetcher) {
  if (!ids.length) return [];
  const data = await fetchJson(
    dataUrl("videos", {
      part: "snippet,contentDetails,status",
      id: ids.join(","),
      maxResults: "50",
    }),
    fetcher,
  );
  return (Array.isArray(data.items) ? data.items : [])
    .filter(
      (item: any) =>
        validVideoId(item.id) &&
        item.status?.embeddable === true &&
        ["public", "unlisted"].includes(item.status?.privacyStatus),
    )
    .map(videoFromApi) as YouTubeVideo[];
}
export async function resolveYouTube(
  projectId: string,
  input: string,
  fetcher: Fetcher = fetch,
) {
  const link = parseLink(input);
  if (link.kind === "playlist")
    return {
      ...link,
      title: "YouTube playlist",
      verification: "unavailable" as const,
      embeddable: null,
      notice: process.env.YOUTUBE_API_KEY
        ? "Preview the playlist to choose which public embeddable videos to import."
        : unavailable,
    };
  const key = "oembed:" + link.videoId;
  const cached = await cacheRead(projectId, key);
  if (cached) return { ...cached, ...link };
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", link.url);
  url.searchParams.set("format", "json");
  try {
    const data = await fetchJson(url, fetcher);
    const item = {
      ...link,
      title: plainTitle(data.title),
      channel: plainTitle(data.author_name),
      thumbnail:
        typeof data.thumbnail_url === "string" ? data.thumbnail_url : "",
      duration: 0,
      verification: "verified" as const,
      embeddable: null,
      verifiedAt: new Date().toISOString(),
      notice:
        "Title and channel verified by YouTube. Playback availability and duration are confirmed by the player.",
    };
    if (!item.title) throw new ApiError(502, "YouTube did not return a title");
    await cacheWrite(projectId, key, item, 86400);
    return item;
  } catch (error) {
    return {
      ...link,
      title: "",
      channel: "",
      thumbnail: "",
      duration: 0,
      verification: "unavailable" as const,
      embeddable: null,
      notice:
        error instanceof ApiError
          ? error.message
          : "Metadata is unavailable. Enter a title to keep the link.",
    };
  }
}
async function providerCursor(
  projectId: string,
  kind: "search" | "playlist",
  queryHash: string,
  cursor?: string,
) {
  if (!cursor) return "";
  if (!/^ytcursor-[a-f0-9-]{36}$/.test(cursor))
    throw new ApiError(400, "Invalid YouTube page cursor");
  const row = (
    await query(
      "SELECT * FROM youtube_cursors WHERE id=$1 AND project_id=$2 AND kind=$3 AND query_hash=$4 AND expires_at>now()",
      [cursor, projectId, kind, queryHash],
    )
  ).rows[0];
  if (!row)
    throw new ApiError(
      400,
      "This page cursor expired or belongs to another search. Start from the first page.",
    );
  return row.provider_cursor;
}
async function makeCursor(
  projectId: string,
  kind: "search" | "playlist",
  queryHash: string,
  token: unknown,
) {
  if (typeof token !== "string" || !token || token.length > 500) return null;
  const cursor = id("ytcursor");
  await query(
    "INSERT INTO youtube_cursors(id,project_id,kind,query_hash,provider_cursor,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '30 minutes')",
    [cursor, projectId, kind, queryHash, token],
  );
  return cursor;
}
export async function searchYouTube(
  projectId: string,
  input: { q: string; cursor?: string },
  fetcher: Fetcher = fetch,
) {
  const parsed = z
    .object({
      q: z.string().trim().min(2).max(200),
      cursor: z.string().max(100).optional(),
    })
    .parse(input);
  const signature = hash(parsed.q.toLowerCase());
  const token = await providerCursor(
    projectId,
    "search",
    signature,
    parsed.cursor,
  );
  if (!process.env.YOUTUBE_API_KEY)
    return {
      available: false,
      items: [],
      nextCursor: null,
      notice: unavailable,
    };
  const key = "search:" + hash(signature + ":" + token);
  const cached = await cacheRead(projectId, key);
  if (cached) return { ...cached, cached: true };
  const data = await fetchJson(
    dataUrl("search", {
      part: "snippet",
      q: parsed.q,
      type: "video",
      videoEmbeddable: "true",
      maxResults: "20",
      safeSearch: "moderate",
      ...(token ? { pageToken: token } : {}),
    }),
    fetcher,
  );
  const ids = (data.items || [])
    .map((item: any) => item.id?.videoId)
    .filter(
      (value: unknown) => typeof value === "string" && validVideoId(value),
    );
  const details = await videoDetails(ids, fetcher);
  const byId = new Map(details.map((v) => [v.videoId, v]));
  const result = {
    available: true,
    items: ids.map((videoId: string) => byId.get(videoId)).filter(Boolean),
    nextCursor: await makeCursor(
      projectId,
      "search",
      signature,
      data.nextPageToken,
    ),
    notice:
      "Results are public embeddable videos supplied by YouTube. Regional or age restrictions may still affect playback.",
    fetchedAt: new Date().toISOString(),
  };
  await cacheWrite(projectId, key, result);
  return result;
}
export async function previewPlaylist(
  projectId: string,
  input: { url: string; cursor?: string },
  fetcher: Fetcher = fetch,
) {
  const parsed = z
    .object({
      url: z.string().min(1).max(3000),
      cursor: z.string().max(100).optional(),
    })
    .parse(input);
  const link = parseLink(parsed.url);
  if (!link.playlistId)
    throw new ApiError(400, "This link does not contain a YouTube playlist");
  const signature = hash(link.playlistId);
  const token = await providerCursor(
    projectId,
    "playlist",
    signature,
    parsed.cursor,
  );
  if (!process.env.YOUTUBE_API_KEY)
    return {
      available: false,
      playlistId: link.playlistId,
      title: "YouTube playlist",
      items: [],
      unavailableItems: [],
      nextCursor: null,
      totalResults: 0,
      complete: false,
      notice: unavailable,
    };
  const key = "playlist:" + hash(signature + ":" + token);
  const cached = await cacheRead(projectId, key);
  if (cached) return { ...cached, cached: true };
  const data = await fetchJson(
    dataUrl("playlistItems", {
      part: "snippet,contentDetails,status",
      playlistId: link.playlistId,
      maxResults: "50",
      ...(token ? { pageToken: token } : {}),
    }),
    fetcher,
  );
  const raw = Array.isArray(data.items) ? data.items : [];
  const ids = raw
    .map(
      (item: any) =>
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId,
    )
    .filter((v: unknown) => typeof v === "string" && validVideoId(v));
  const details = await videoDetails([...new Set<string>(ids)], fetcher);
  const byId = new Map(details.map((v) => [v.videoId, v]));
  const items: any[] = [],
    unavailableItems: any[] = [];
  for (const item of raw) {
    const videoId =
      item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    const video = byId.get(videoId);
    if (video && !items.some((v) => v.videoId === videoId))
      items.push({ ...video, playlistPosition: item.snippet?.position });
    else if (!video)
      unavailableItems.push({
        videoId: validVideoId(String(videoId)) ? videoId : null,
        title: plainTitle(item.snippet?.title) || "Unavailable video",
        reason: "Private, removed, unavailable, or embedding disabled",
      });
  }
  let title = "YouTube playlist";
  try {
    const metadata = await fetchJson(
      dataUrl("playlists", { part: "snippet", id: link.playlistId }),
      fetcher,
    );
    title = plainTitle(metadata.items?.[0]?.snippet?.title) || title;
  } catch {
    /* Individual video metadata is sufficient for a truthful page preview. */
  }
  const result = {
    available: true,
    playlistId: link.playlistId,
    title,
    items,
    unavailableItems,
    nextCursor: await makeCursor(
      projectId,
      "playlist",
      signature,
      data.nextPageToken,
    ),
    totalResults: Number(data.pageInfo?.totalResults) || raw.length,
    complete: !data.nextPageToken,
    notice:
      "Only the selected verified videos from this page will be imported. Other playlist pages are not imported automatically.",
    fetchedAt: new Date().toISOString(),
  };
  await cacheWrite(projectId, key, result);
  return result;
}
async function saveVerifiedLesson(
  projectId: string,
  video: YouTubeVideo,
  input: {
    title?: string;
    subject?: string;
    topic?: string;
    saved?: boolean;
    startSeconds?: number;
  },
  client: PoolClient,
) {
  const found = (
    await query(
      "SELECT * FROM lessons WHERE project_id=$1 AND video_id=$2 ORDER BY created_at LIMIT 1",
      [projectId, video.videoId],
      client,
    )
  ).rows[0];
  if (found) {
    if (input.saved && !found.saved)
      return {
        item: camel(
          (
            await query(
              "UPDATE lessons SET saved=true,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",
              [projectId, found.id],
              client,
            )
          ).rows[0],
        ),
        existing: true,
      };
    return { item: camel(found), existing: true };
  }
  const item = await insertRow(
    "lessons",
    {
      id: id("lesson"),
      projectId,
      title: input.title?.trim() || video.title,
      subject: input.subject ?? "",
      topic: input.topic ?? "",
      channel: video.channel,
      videoId: video.videoId,
      duration: video.duration,
      position: input.startSeconds ?? 0,
      saved: input.saved ?? true,
      description: video.description ?? "",
      metadata: {
        provider: "youtube",
        verification: video.verification,
        verifiedAt:
          video.verification === "verified" ? new Date().toISOString() : null,
        originalTitle: video.title,
        thumbnail: video.thumbnail,
        embeddable: video.embeddable,
        url: video.url,
        notice: video.notice,
        transcriptStatus: "not-available",
      },
    },
    client,
  );
  return { item, existing: false };
}
export async function importYouTubeLesson(
  projectId: string,
  body: unknown,
  fetcher: Fetcher = fetch,
) {
  const input = z
    .object({
      url: z.string().min(1).max(3000),
      title: z.string().trim().max(300).optional(),
      subject: z.string().max(200).optional(),
      topic: z.string().max(200).optional(),
      saved: z.boolean().optional(),
    })
    .parse(body);
  const link = parseLink(input.url);
  if (!link.videoId)
    throw new ApiError(
      400,
      "Preview and import this playlist to choose its videos.",
    );
  const resolved = await resolveYouTube(projectId, input.url, fetcher);
  if (!resolved.title && !input.title)
    throw new ApiError(
      422,
      "YouTube metadata is unavailable. Enter a title to save this link as unverified.",
    );
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      projectId + ":youtube-import",
    ]);
    const result = await saveVerifiedLesson(
      projectId,
      {
        videoId: link.videoId!,
        title: resolved.title || input.title!,
        channel: "channel" in resolved ? resolved.channel : "",
        thumbnail: "thumbnail" in resolved ? resolved.thumbnail : "",
        duration: "duration" in resolved ? resolved.duration : 0,
        embeddable: resolved.embeddable,
        url: link.url,
        verification: resolved.verification,
        notice: resolved.notice,
      },
      { ...input, startSeconds: link.startSeconds },
      client,
    );
    return { ...result, metadataStatus: resolved.verification };
  });
}
export async function importYouTubePlaylist(
  projectId: string,
  body: unknown,
  fetcher: Fetcher = fetch,
) {
  const input = z
    .object({
      url: z.string().min(1).max(3000),
      cursor: z.string().max(100).optional(),
      videoIds: z.array(z.string().refine(validVideoId)).max(50).optional(),
      title: z.string().trim().max(300).optional(),
      subject: z.string().max(200).optional(),
      topic: z.string().max(200).optional(),
    })
    .parse(body);
  const preview = await previewPlaylist(projectId, input, fetcher);
  if (!preview.available) throw new ApiError(503, unavailable);
  const selected: string[] =
    input.videoIds ?? preview.items.map((video: YouTubeVideo) => video.videoId);
  if (!selected.length)
    throw new ApiError(
      400,
      "Select at least one available video from this page",
    );
  const allowed = new Map<string, YouTubeVideo>(
    preview.items.map((video: YouTubeVideo) => [video.videoId, video]),
  );
  if (selected.some((videoId) => !allowed.has(videoId)))
    throw new ApiError(
      400,
      "A selected video is not part of this verified playlist page. Refresh the preview.",
    );
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      projectId + ":youtube-import",
    ]);
    const items: any[] = [];
    let imported = 0,
      existing = 0;
    for (const videoId of [...new Set(selected)]) {
      const saved = await saveVerifiedLesson(
        projectId,
        allowed.get(videoId)!,
        { subject: input.subject, topic: input.topic, saved: true },
        client,
      );
      items.push(saved.item);
      if (saved.existing) existing++;
      else imported++;
    }
    const prior = (
      await query(
        "SELECT * FROM resources WHERE project_id=$1 AND type='lesson-collection' AND deleted=false AND metadata->>'youtubePlaylistId'=$2 ORDER BY created_at LIMIT 1",
        [projectId, preview.playlistId],
        client,
      )
    ).rows[0];
    const oldIds = Array.isArray(prior?.metadata?.lessonIds)
      ? prior.metadata.lessonIds
      : [];
    const lessonIds = [...new Set([...oldIds, ...items.map((l) => l.id)])];
    const metadata = {
      ...(prior?.metadata || {}),
      youtubePlaylistId: preview.playlistId,
      lessonIds,
      importedCount: lessonIds.length,
      totalPlaylistItems: preview.totalResults,
      partialImport:
        lessonIds.length < preview.totalResults ||
        preview.unavailableItems.length > 0,
      lastImportedAt: new Date().toISOString(),
    };
    let item;
    if (prior) {
      item = camel(
        (
          await query(
            "UPDATE resources SET metadata=$3,revision=revision+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",
            [projectId, prior.id, JSON.stringify(metadata)],
            client,
          )
        ).rows[0],
      );
      await query(
        "INSERT INTO resource_versions(id,project_id,resource_id,version,content) VALUES($1,$2,$3,$4,$5)",
        [id("version"), projectId, item.id, item.revision, item.content],
        client,
      );
    } else {
      item = await insertRow(
        "resources",
        {
          id: id("collection"),
          projectId,
          title: input.title || preview.title,
          type: "lesson-collection",
          subject: input.subject ?? "",
          content: `Selected videos from https://www.youtube.com/playlist?list=${preview.playlistId}`,
          metadata,
        },
        client,
      );
      await query(
        "INSERT INTO resource_versions(id,project_id,resource_id,version,content) VALUES($1,$2,$3,1,$4)",
        [id("version"), projectId, item.id, item.content],
        client,
      );
    }
    return {
      item,
      items,
      imported,
      existing,
      skipped: preview.unavailableItems.length,
      nextCursor: preview.nextCursor,
      complete: !metadata.partialImport,
      notice: `${imported} new videos saved; ${existing} already belonged to this project. Only selected videos on this page were imported.`,
    };
  });
}
async function jsonBody(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 32000)
    throw new ApiError(413, "Request too large");
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Provide valid JSON");
  }
}
export async function youtubeHandler(
  request: Request,
  projectId: string,
  path: string[],
) {
  try {
    await projectExists(projectId);
    const action = path.join("/");
    const params = new URL(request.url).searchParams;
    if (action === "capabilities" && request.method === "GET")
      return response({
        metadata: true,
        search: Boolean(process.env.YOUTUBE_API_KEY),
        playlists: Boolean(process.env.YOUTUBE_API_KEY),
        notice: process.env.YOUTUBE_API_KEY
          ? "Public YouTube search and playlist import are connected."
          : unavailable,
      });
    // Discovery can incur provider quota even on GET; apply a separate persisted
    // student budget before any provider-dependent route, including cache reads.
    await enforceRequestBudget("youtube-discovery:" + currentStudentId(), 30);
    if (action === "resolve" && request.method === "POST") {
      const input = z
        .object({ url: z.string().min(1).max(3000) })
        .parse(await jsonBody(request));
      return response({ item: await resolveYouTube(projectId, input.url) });
    }
    if (action === "search" && request.method === "GET")
      return response(
        await searchYouTube(projectId, {
          q: params.get("q") || "",
          cursor: params.get("cursor") || undefined,
        }),
      );
    if (action === "playlist/preview" && request.method === "POST")
      return response(
        await previewPlaylist(projectId, await jsonBody(request)),
      );
    if (action === "playlist/import" && request.method === "POST")
      return response(
        await importYouTubePlaylist(projectId, await jsonBody(request)),
      );
    if (action === "import" && request.method === "POST")
      return response(
        await importYouTubeLesson(projectId, await jsonBody(request)),
        201,
      );
    throw new ApiError(404, "YouTube action not found");
  } catch (error) {
    if (error instanceof ApiError)
      return response({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return response(
        {
          error: "Check the YouTube link or search fields.",
          fields: error.flatten(),
        },
        400,
      );
    console.error(
      "YouTube operation failed",
      (error as any).code ?? (error as any).name,
    );
    return response(
      {
        error:
          "Could not complete the YouTube operation. Saved lessons and notes were not removed.",
      },
      500,
    );
  }
}
