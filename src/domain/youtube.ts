export type YouTubeLink = {
  kind: "video" | "playlist";
  videoId?: string;
  playlistId?: string;
  url: string;
  startSeconds: number;
};
export const validVideoId = (value: string) =>
  /^[A-Za-z0-9_-]{11}$/.test(value);
export const validPlaylistId = (value: string) =>
  /^[A-Za-z0-9_-]{10,100}$/.test(value);
const hosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
function timestamp(value: string | null) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Math.min(604800, Number(value));
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return 0;
  return Math.min(
    604800,
    Number(match[1] || 0) * 3600 +
      Number(match[2] || 0) * 60 +
      Number(match[3] || 0),
  );
}
export function parseYouTubeLink(input: string): YouTubeLink {
  const raw = input.trim();
  if (raw.length > 3000) throw new Error("The YouTube link is too long.");
  if (validVideoId(raw))
    return {
      kind: "video",
      videoId: raw,
      url: `https://www.youtube.com/watch?v=${raw}`,
      startSeconds: 0,
    };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("Paste a valid YouTube video or playlist link.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !hosts.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443" && url.port !== "80")
  )
    throw new Error("Use a youtube.com or youtu.be link.");
  const segments = url.pathname.split("/").filter(Boolean);
  let videoId: string | undefined;
  if (url.hostname.endsWith("youtu.be") && segments.length === 1)
    videoId = segments[0];
  else if (segments[0] === "watch" && segments.length === 1)
    videoId = url.searchParams.get("v") || undefined;
  else if (
    ["shorts", "embed", "live"].includes(segments[0]) &&
    segments.length === 2
  )
    videoId = segments[1];
  const rawPlaylist = url.searchParams.get("list");
  const playlistId =
    rawPlaylist && validPlaylistId(rawPlaylist) ? rawPlaylist : undefined;
  if (videoId) {
    if (!validVideoId(videoId))
      throw new Error("This YouTube video ID is invalid.");
    return {
      kind: "video",
      videoId,
      playlistId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      startSeconds: timestamp(
        url.searchParams.get("t") || url.searchParams.get("start"),
      ),
    };
  }
  if (segments[0] === "playlist" && playlistId)
    return {
      kind: "playlist",
      playlistId,
      url: `https://www.youtube.com/playlist?list=${playlistId}`,
      startSeconds: 0,
    };
  throw new Error(
    "Paste a YouTube watch, short, live, embed or playlist link.",
  );
}
export function youtubeDuration(value: string) {
  const match = value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  return match
    ? Number(match[1] || 0) * 86400 +
        Number(match[2] || 0) * 3600 +
        Number(match[3] || 0) * 60 +
        Number(match[4] || 0)
    : 0;
}
