"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Compass,
  Link2,
  ListVideo,
  LoaderCircle,
  Play,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Empty,
  ErrorMessage,
  json,
  secondsLabel,
  useRemote,
  safeError,
  type Lesson,
  type Resource,
} from "./shared";

type VideoResult = {
  videoId: string;
  title: string;
  channel?: string;
  thumbnail?: string;
  duration?: number;
  embeddable?: boolean | null;
};
type Resolved = Partial<VideoResult> & {
  kind: "video" | "playlist";
  playlistId?: string;
  url: string;
  verification: "verified" | "unavailable";
  notice?: string;
};
type PlaylistPage = {
  available: boolean;
  playlistId?: string;
  title?: string;
  items: VideoResult[];
  unavailableItems?: Array<{ videoId?: string; title: string; reason: string }>;
  nextCursor?: string;
  totalResults?: number;
  complete?: boolean;
  notice?: string;
};
type SearchResults = {
  available: boolean;
  items: VideoResult[];
  nextCursor?: string;
  notice?: string;
};

export default function YouTubeDiscovery({
  projectId,
  subjects,
  onAdded,
  onImported,
}: {
  projectId: string;
  subjects: string[];
  onAdded: (lesson: Lesson) => void;
  onImported: (collection: Resource) => void;
}) {
  const capabilities = useRemote<{
    metadata: boolean;
    search: boolean;
    playlists: boolean;
    notice?: string;
  }>(`/api/projects/${projectId}/youtube/capabilities`);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistPage | null>(null);
  const [playlistCursor, setPlaylistCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState(subjects[0] || "General");
  const [manualTitle, setManualTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestGeneration = useRef(0);
  const base = `/api/projects/${projectId}`;
  const youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(submitted || query || subjects[0] || "learning")}`;

  async function discover(value: string, cursor?: string) {
    if (!value.trim()) return;
    const generation = ++requestGeneration.current;
    setBusy(true);
    setError("");
    setNotice("");
    if (!cursor) {
      setResults(null);
      setResolved(null);
      setPlaylist(null);
      setSelected([]);
      setPlaylistCursor(undefined);
    }
    setSubmitted(value.trim());
    try {
      if (
        /^(https?:\/\/|(?:www\.)?(?:youtube\.com|youtu\.be)\/)/i.test(
          value.trim(),
        )
      ) {
        const url = /^https?:\/\//i.test(value.trim())
          ? value.trim()
          : `https://${value.trim()}`;
        const data = await api<{ item: Resolved }>(
          `${base}/youtube/resolve`,
          json("POST", { url }),
        );
        if (generation !== requestGeneration.current) return;
        setResolved(data.item);
        setManualTitle(data.item.title || "");
        if (data.item.kind === "playlist") {
          const page = await api<PlaylistPage>(
            `${base}/youtube/playlist/preview`,
            json("POST", { url }),
          );
          if (generation !== requestGeneration.current) return;
          setPlaylist(page);
          setSelected(page.items.map((v) => v.videoId));
        }
      } else {
        const data = await api<SearchResults>(
          `${base}/youtube/search?q=${encodeURIComponent(value.trim())}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (generation !== requestGeneration.current) return;
        setResults((prior) => ({
          ...data,
          items: cursor
            ? [
                ...(prior?.items || []),
                ...data.items.filter(
                  (v) => !prior?.items.some((p) => p.videoId === v.videoId),
                ),
              ]
            : data.items,
        }));
      }
    } catch (e) {
      if (generation === requestGeneration.current) setError(safeError(e));
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }
  async function importVideo(video: Partial<VideoResult>, url?: string) {
    setImporting(video.videoId || "video");
    setError("");
    try {
      const response = await api<{ item: Lesson; existing: boolean }>(
        `${base}/lessons/import`,
        json("POST", {
          url: url || `https://www.youtube.com/watch?v=${video.videoId}`,
          ...(resolved?.verification === "unavailable" && manualTitle.trim()
            ? { title: manualTitle.trim() }
            : {}),
          subject,
          saved: true,
        }),
      );
      onAdded(response.item);
    } catch (e) {
      setError(safeError(e));
    } finally {
      setImporting("");
    }
  }
  async function nextPlaylistPage() {
    if (!resolved || !playlist?.nextCursor) return;
    setBusy(true);
    setError("");
    try {
      const cursor = playlist.nextCursor;
      const response = await api<PlaylistPage>(
        `${base}/youtube/playlist/preview`,
        json("POST", { url: resolved.url, cursor }),
      );
      setPlaylist(response);
      setPlaylistCursor(cursor);
      setSelected(response.items.map((v) => v.videoId));
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="video-discovery">
      <div className="video-discovery-hero">
        <div className="video-discovery-emblem">
          <Compass size={31} strokeWidth={1.3} />
        </div>
        <span className="page-eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</span>
        <h2>
          What would you like
          <br />
          to understand next?
        </h2>
        <p>
          Explore a topic, bring a favourite video, or turn a playlist into your
          next learning journey.
        </p>
        <form
          className="video-discovery-search"
          onSubmit={(e) => {
            e.preventDefault();
            void discover(query);
          }}
        >
          <Search size={21} />
          <input
            aria-label="Search YouTube or paste a link"
            placeholder="Search YouTube or paste a video / playlist link…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            maxLength={1000}
          />
          <button
            className="button button-primary"
            disabled={busy || !query.trim()}
            type="submit"
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ArrowRight size={18} />
            )}
            <span>{busy ? "Finding…" : "Explore"}</span>
          </button>
        </form>
        <div className="video-discovery-suggestions">
          {(subjects.length
            ? subjects.slice(0, 4)
            : ["Creative thinking", "Learning a language", "How things work"]
          ).map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => {
                setQuery(s);
                void discover(s);
              }}
            >
              {s}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      </div>
      <div className="video-discovery-capabilities">
        <span>
          <Link2 size={15} />
          Video links can be imported directly
        </span>
        <span>
          {capabilities.loading
            ? "Checking search availability…"
            : capabilities.data?.search
              ? "In-app search enabled"
              : "In-app search is not connected"}
        </span>
      </div>
      <ErrorMessage
        message={error || capabilities.error}
        retry={
          error
            ? () => void discover(submitted || query)
            : () => void capabilities.reload()
        }
      />
      {notice && (
        <p className="page-success" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      {!capabilities.loading &&
        !capabilities.data?.search &&
        !results &&
        !resolved && (
          <div className="video-search-unavailable">
            <div>
              <h3>Already found something good?</h3>
              <p>
                Paste its YouTube link above to save it with your notes and
                playback position. You can also search on YouTube and bring a
                link back here.
              </p>
            </div>
            <a
              className="button button-ghost"
              href={youtubeSearch}
              target="_blank"
              rel="noreferrer"
            >
              Search on YouTube
              <ArrowUpRight size={16} />
            </a>
          </div>
        )}
      {resolved?.kind === "video" ||
      results?.items.length ||
      playlist?.available ? (
        <div className="video-discovery-results-heading">
          <h3>
            {playlist
              ? playlist.title || "Playlist preview"
              : resolved
                ? "A new idea for your library"
                : `Results for “${submitted}”`}
          </h3>
          <label>
            Save under
            <select
              className="page-select"
              aria-label="Import subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {[...new Set(["General", ...subjects])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {resolved?.kind === "video" && (
        <article className="video-link-preview">
          <div className="video-link-image">
            {resolved.videoId && (
              <img
                alt=""
                src={
                  resolved.thumbnail ||
                  `https://i.ytimg.com/vi/${resolved.videoId}/hqdefault.jpg`
                }
              />
            )}
            <Play size={34} fill="currentColor" />
          </div>
          <div>
            <span className="page-eyebrow">
              {resolved.verification === "verified"
                ? "DETAILS FROM YOUTUBE"
                : "VIDEO LINK"}
            </span>
            {resolved.title ? (
              <h3>{resolved.title}</h3>
            ) : (
              <h3>Add a title for this video</h3>
            )}
            <p>
              {resolved.channel || "Creator details unavailable"}
              {resolved.duration ? ` · ${secondsLabel(resolved.duration)}` : ""}
            </p>
            {resolved.verification !== "verified" && (
              <label className="page-field">
                Lesson title
                <input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Name this lesson"
                  maxLength={200}
                />
              </label>
            )}
            {(resolved.notice || resolved.embeddable === false) && (
              <p className="page-help">
                {resolved.notice ||
                  "This video cannot play here. You can save your notes and open it on YouTube."}
              </p>
            )}
            <div className="video-link-actions">
              <button
                className="button button-primary"
                disabled={
                  Boolean(importing) ||
                  (resolved.verification !== "verified" && !manualTitle.trim())
                }
                onClick={() => void importVideo(resolved, resolved.url)}
              >
                {importing ? "Saving…" : "Save & open lesson"}
                <ArrowRight size={16} />
              </button>
              <a
                className="button button-ghost"
                href={resolved.url}
                target="_blank"
                rel="noreferrer"
              >
                View on YouTube
                <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
        </article>
      )}
      {results && !results.available && (
        <div className="video-search-unavailable">
          <div>
            <h3>YouTube search isn’t connected yet.</h3>
            <p>
              {results.notice ||
                "Search on YouTube, then paste a video link here. Direct-link imports and your saved library remain available."}
            </p>
          </div>
          <a
            className="button button-primary"
            href={youtubeSearch}
            target="_blank"
            rel="noreferrer"
          >
            Search “{submitted}”<ArrowUpRight size={16} />
          </a>
        </div>
      )}
      {results?.available && (
        <>
          <div className="video-grid video-search-results">
            {results.items.map((video) => (
              <article className="video-card" key={video.videoId}>
                <div className="video-thumbnail">
                  <img
                    src={
                      video.thumbnail ||
                      `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`
                    }
                    alt=""
                    loading="lazy"
                  />
                  {video.duration ? (
                    <span className="video-duration">
                      {secondsLabel(video.duration)}
                    </span>
                  ) : null}
                </div>
                <div className="video-card-info">
                  <span className="page-eyebrow">YOUTUBE</span>
                  <h3>{video.title}</h3>
                  <p>{video.channel}</p>
                  <button
                    className="button button-ghost"
                    disabled={Boolean(importing)}
                    onClick={() => void importVideo(video)}
                  >
                    {importing === video.videoId ? "Saving…" : "Save & watch"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!results.items.length && (
            <Empty title="No videos matched that search.">
              Try a different phrase, creator name, or paste a direct video
              link.
            </Empty>
          )}
          {results.nextCursor && (
            <button
              className="button button-ghost video-load-more"
              disabled={busy}
              onClick={() => void discover(submitted, results.nextCursor)}
            >
              {busy ? "Loading…" : "Load more videos"}
            </button>
          )}
        </>
      )}
      {playlist &&
        (!playlist.available ? (
          <div className="video-search-unavailable">
            <ListVideo size={30} />
            <div>
              <h3>Playlist import isn’t connected.</h3>
              <p>
                {playlist.notice ||
                  "Playlist import needs a YouTube connection. You can still import individual video links."}
              </p>
            </div>
            <a
              className="button button-ghost"
              href={resolved?.url}
              target="_blank"
              rel="noreferrer"
            >
              Open playlist
              <ArrowUpRight size={15} />
            </a>
          </div>
        ) : (
          <div className="video-playlist-preview">
            <div className="video-playlist-summary">
              <span>
                {playlist.items.length} videos on this page
                {playlist.totalResults
                  ? ` · ${playlist.totalResults} in playlist`
                  : ""}
                {playlist.unavailableItems?.length
                  ? ` · ${playlist.unavailableItems?.length} unavailable`
                  : ""}
              </span>
              <button
                className="button button-ghost"
                onClick={() =>
                  setSelected(
                    selected.length === playlist.items.length
                      ? []
                      : playlist.items.map((v) => v.videoId),
                  )
                }
              >
                {selected.length === playlist.items.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>
            {playlist.notice && <p className="page-help">{playlist.notice}</p>}
            {playlist.items.map((video) => (
              <label className="video-playlist-choice" key={video.videoId}>
                <input
                  type="checkbox"
                  checked={selected.includes(video.videoId)}
                  onChange={(e) =>
                    setSelected((prior) =>
                      e.target.checked
                        ? [...prior, video.videoId]
                        : prior.filter((id) => id !== video.videoId),
                    )
                  }
                />
                <img
                  src={
                    video.thumbnail ||
                    `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`
                  }
                  alt=""
                  loading="lazy"
                />
                <span>
                  <strong>{video.title}</strong>
                  <small>
                    {video.channel}
                    {video.duration ? ` · ${secondsLabel(video.duration)}` : ""}
                  </small>
                </span>
              </label>
            ))}
            <div className="video-playlist-actions">
              <button
                className="button button-primary"
                disabled={Boolean(importing) || !selected.length}
                onClick={async () => {
                  if (!resolved) return;
                  setImporting("playlist");
                  setError("");
                  try {
                    const response = await api<{
                      item: Resource;
                      imported: number;
                      existing: number;
                      skipped: number;
                    }>(
                      `${base}/youtube/playlist/import`,
                      json("POST", {
                        url: resolved.url,
                        videoIds: selected,
                        cursor: playlistCursor,
                        subject,
                      }),
                    );
                    setNotice(
                      `${response.imported} new lessons saved; ${response.existing} already in your library${response.skipped ? `; ${response.skipped} skipped` : ""}.`,
                    );
                    onImported(response.item);
                  } catch (e) {
                    setError(safeError(e));
                  } finally {
                    setImporting("");
                  }
                }}
              >
                <ListVideo size={16} />
                {importing
                  ? "Importing…"
                  : `Import ${selected.length} selected`}
              </button>
              {playlist.nextCursor && (
                <button
                  className="button button-ghost"
                  disabled={busy || Boolean(importing)}
                  onClick={() => void nextPlaylistPage()}
                >
                  Next page
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
    </section>
  );
}
