"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCircle2,
  Clock3,
  Film,
  History,
  RotateCcw,
  ListVideo,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import YouTubeDiscovery from "./YouTubeDiscovery";
import {
  Empty,
  ErrorMessage,
  Loading,
  Modal,
  PageHeading,
  SearchField,
  StudyLink,
  json,
  safeError,
  secondsLabel,
  useRemote,
  type Lesson,
  type Project,
  type Resource,
} from "./shared";

type Player = {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getIframe?: () => HTMLIFrameElement;
  seekTo: (time: number, allow: boolean) => void;
  destroy: () => void;
};
type YTGlobal = {
  Player: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => Player;
};
declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let youtubePromise: Promise<YTGlobal> | null = null;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubePromise)
    youtubePromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        youtubePromise = null;
        reject(
          new Error(
            "The video player is taking too long to load. Retry it or open the lesson on YouTube.",
          ),
        );
      }, 15000);
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) {
          window.clearTimeout(timeout);
          resolve(window.YT);
        }
      };
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        window.clearTimeout(timeout);
        youtubePromise = null;
        script.remove();
        reject(
          new Error(
            "The video player could not load. You can still open the lesson on YouTube.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return youtubePromise;
}

type WatchedLesson = Lesson & {
  lastWatchedAt?: string;
  watchedSeconds?: number;
  sessionCount?: number;
};
const VIDEO_TABS = [
  "Discover",
  "Library",
  "Continue watching",
  "History",
  "Watch later",
  "Collections",
] as const;
type VideoTab = (typeof VIDEO_TABS)[number];

export default function CramazonPage({
  projectId,
  lessonId,
}: {
  projectId: string;
  lessonId?: string;
}) {
  return lessonId ? (
    <LessonPlayer projectId={projectId} lessonId={lessonId} />
  ) : (
    <CramazonHome projectId={projectId} />
  );
}

function CramazonHome({ projectId }: { projectId: string }) {
  const remote = useRemote<{ items: Lesson[] }>(
    `/api/projects/${projectId}/lessons`,
  );
  const project = useRemote<{ project: Project }>(`/api/projects/${projectId}`);
  const collectionRemote = useRemote<{ items: Resource[] }>(
    `/api/projects/${projectId}/resources?type=lesson-collection`,
  );
  const history = useRemote<{ items: WatchedLesson[] }>(
    `/api/projects/${projectId}/lessons/history`,
  );
  const params = useSearchParams();
  const view = params.get("view");
  const tab: VideoTab =
    VIDEO_TABS.find((t) => t.toLowerCase().replaceAll(" ", "-") === view) ||
    "Discover";
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("All subjects");
  const [add, setAdd] = useState(false);
  const [error, setError] = useState("");
  const [collection, setCollection] = useState<Resource | "new" | null>(null);
  const [duration, setDuration] = useState("Any length");
  const [historyRange, setHistoryRange] = useState("All time");
  const [clearHistory, setClearHistory] = useState<
    WatchedLesson | "all" | null
  >(null);
  const [clearing, setClearing] = useState(false);
  const router = useRouter();
  const lessons = remote.data?.items || [];
  const matches = (l: Lesson) =>
    (subject === "All subjects" || l.subject === subject) &&
    (duration !== "Under 20 min" || (l.duration || Infinity) < 1200) &&
    `${l.title} ${l.subject} ${l.topic || ""} ${l.channel || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const continued = (history.data?.items || []).filter(
    (l) => (l.position || 0) > 0 && !l.completed,
  );
  const filtered = (tab === "Continue watching" ? continued : lessons).filter(
    (l) => matches(l) && (tab !== "Watch later" || l.saved),
  );
  const watched = (history.data?.items || [])
    .filter((l) => {
      const days =
        historyRange === "Today"
          ? 1
          : historyRange === "This week"
            ? 7
            : historyRange === "This month"
              ? 30
              : Infinity;
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - (days - 1));
      return (
        matches(l) &&
        (days === Infinity ||
          new Date(l.lastWatchedAt || 0).getTime() >= cutoff.getTime())
      );
    })
    .sort(
      (a, b) =>
        new Date(b.lastWatchedAt || 0).getTime() -
        new Date(a.lastWatchedAt || 0).getTime(),
    );
  const historyGroups = Map.groupBy(watched, (l) =>
    l.lastWatchedAt
      ? new Date(l.lastWatchedAt).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Earlier viewing",
  );
  const toggleSaved = async (lesson: Lesson) => {
    setError("");
    try {
      await api(
        `/api/projects/${projectId}/lessons/${lesson.id}`,
        json("PATCH", { saved: !lesson.saved }),
      );
      await Promise.all([remote.reload(), history.reload()]);
    } catch (e) {
      setError(safeError(e));
    }
  };
  const openLesson = (lesson: Lesson) =>
    router.push(`/projects/${projectId}/cramazon/${lesson.id}`);
  return (
    <div className="video-page">
      <PageHeading
        eyebrow="CRAMAZON PRIME"
        title="Follow your curiosity."
        description="A home for the videos, ideas, and notes that move you forward."
      >
        <button className="button button-primary" onClick={() => setAdd(true)}>
          <Plus size={18} />
          Add a lesson
        </button>
      </PageHeading>
      <nav
        className="video-top-tabs video-library-tabs"
        aria-label="Video workspace"
      >
        {VIDEO_TABS.map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            aria-current={t === tab ? "page" : undefined}
            onClick={() =>
              router.replace(
                `/projects/${projectId}/cramazon?view=${t.toLowerCase().replaceAll(" ", "-")}`,
              )
            }
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "Discover" ? (
        <YouTubeDiscovery
          projectId={projectId}
          subjects={project.data?.project.subjects || []}
          onAdded={openLesson}
          onImported={(resource) => {
            void remote.reload();
            void collectionRemote.reload();
            setCollection(resource);
          }}
        />
      ) : (
        <>
          {tab !== "Collections" && (
            <div className="page-toolbar">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder={
                  tab === "History"
                    ? "Search your watch history…"
                    : "Search your saved lessons…"
                }
              />
              <select
                aria-label="Lesson subject"
                className="page-select"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option>All subjects</option>
                {[
                  ...new Set([
                    ...(project.data?.project.subjects || []),
                    ...lessons.map((l) => l.subject).filter(Boolean),
                  ]),
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {tab === "History" ? (
                <select
                  aria-label="History period"
                  className="page-select"
                  value={historyRange}
                  onChange={(e) => setHistoryRange(e.target.value)}
                >
                  {["All time", "Today", "This week", "This month"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <select
                  aria-label="Lesson duration"
                  className="page-select"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  <option>Any length</option>
                  <option>Under 20 min</option>
                </select>
              )}
            </div>
          )}
          <ErrorMessage
            message={
              error ||
              remote.error ||
              (tab === "History" || tab === "Continue watching"
                ? history.error
                : "")
            }
            retry={() => {
              void remote.reload();
              void history.reload();
            }}
          />
          {remote.loading && !remote.data ? (
            <Loading />
          ) : tab === "Collections" ? (
            <>
              <div className="video-section-head">
                <h2>A good learning sequence.</h2>
                <button
                  className="button button-ghost"
                  onClick={() => setCollection("new")}
                >
                  <Plus size={17} />
                  New collection
                </button>
              </div>
              <ErrorMessage
                message={collectionRemote.error}
                retry={() => void collectionRemote.reload()}
              />
              <div className="video-collections">
                {collectionRemote.data?.items.map((c) => (
                  <button
                    className="video-collection"
                    key={c.id}
                    onClick={() => setCollection(c)}
                  >
                    <ListVideo size={30} />
                    <span>
                      <h3>{c.title}</h3>
                      <p>
                        {Array.isArray(c.metadata?.lessonIds)
                          ? c.metadata.lessonIds.length
                          : 0}{" "}
                        lessons · {c.subject || "Your collection"}
                      </p>
                    </span>
                    <ArrowUpRight size={20} />
                  </button>
                ))}
              </div>
              {!collectionRemote.loading &&
                !collectionRemote.data?.items.length && (
                  <Empty
                    title="Learn in your own order."
                    action={
                      <button
                        className="button button-primary"
                        onClick={() => setCollection("new")}
                      >
                        Create a collection
                      </button>
                    }
                  >
                    Bring related lessons together or import a YouTube playlist
                    from Discover.
                  </Empty>
                )}
            </>
          ) : tab === "History" ? (
            <>
              <div className="video-section-head">
                <div>
                  <h2>Your learning trail.</h2>
                  <p className="page-help">
                    Most recently watched first. Playback history stays with
                    this project.
                  </p>
                </div>
                {Boolean(history.data?.items.length) && (
                  <button
                    className="button button-ghost"
                    onClick={() => {
                      setError("");
                      setClearHistory("all");
                    }}
                  >
                    <Trash2 size={15} />
                    Clear history
                  </button>
                )}
              </div>
              {history.loading && !history.data ? (
                <Loading />
              ) : (
                [...historyGroups.entries()].map(([day, items]) => (
                  <section className="video-history-group" key={day}>
                    <h3>
                      <History size={16} />
                      {day}
                    </h3>
                    {items.map((l) => (
                      <article className="video-history-item" key={l.id}>
                        <Link
                          className="video-history-thumb"
                          href={`/projects/${projectId}/cramazon/${l.id}`}
                          aria-label={`Resume ${l.title}`}
                        >
                          <LessonArtwork lesson={l} />
                          <Play size={18} />
                        </Link>
                        <div className="video-history-info">
                          <Link
                            href={`/projects/${projectId}/cramazon/${l.id}`}
                          >
                            <h4>{l.title}</h4>
                          </Link>
                          <p>
                            {l.channel || l.subject} ·{" "}
                            {l.lastWatchedAt
                              ? new Date(l.lastWatchedAt).toLocaleTimeString(
                                  undefined,
                                  { hour: "numeric", minute: "2-digit" },
                                )
                              : "Time unavailable"}
                          </p>
                          <span>
                            {secondsLabel(l.position)}
                            {l.duration ? ` / ${secondsLabel(l.duration)}` : ""}
                            {l.completed ? " · Completed" : " · Resume here"}
                          </span>
                          <WatchProgress lesson={l} />
                        </div>
                        <button
                          className={`page-icon-button ${l.saved ? "active" : ""}`}
                          aria-label={`${l.saved ? "Remove from" : "Save to"} watch later: ${l.title}`}
                          onClick={() => void toggleSaved(l)}
                        >
                          <Bookmark
                            size={17}
                            fill={l.saved ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          className="page-icon-button"
                          aria-label={`Remove ${l.title} from history`}
                          onClick={() => {
                            setError("");
                            setClearHistory(l);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))}
                  </section>
                ))
              )}
              {!history.loading && !watched.length && (
                <Empty
                  title={
                    search || historyRange !== "All time"
                      ? "No viewing matches these filters."
                      : "Your next chapter starts here."
                  }
                >
                  Play a saved lesson and your viewing history will appear here.
                  Merely opening a video does not mark it as watched.
                </Empty>
              )}
            </>
          ) : (
            <>
              <div className="video-section-head">
                <h2>
                  {tab === "Watch later"
                    ? "For your next moment of curiosity"
                    : tab === "Continue watching"
                      ? "Pick up where you left off"
                      : "Your video library"}
                </h2>
                <span>{filtered.length} lessons</span>
              </div>
              {tab === "Continue watching" &&
              history.loading &&
              !history.data ? (
                <Loading />
              ) : (
                <LessonGrid
                  lessons={filtered}
                  projectId={projectId}
                  onToggleSaved={toggleSaved}
                />
              )}
              {!filtered.length &&
                !(tab === "Continue watching" && history.loading) && (
                  <Empty
                    title={
                      tab === "Continue watching"
                        ? "A fresh start, whenever you’re ready."
                        : "Something worth watching is next."
                    }
                    action={
                      <button
                        className="button button-primary"
                        onClick={() =>
                          router.replace(
                            `/projects/${projectId}/cramazon?view=discover`,
                          )
                        }
                      >
                        Discover a lesson
                        <ArrowRight size={16} />
                      </button>
                    }
                  >
                    {tab === "Continue watching"
                      ? "Partially watched lessons appear here with their saved playback position."
                      : "Save a YouTube lesson or try another filter. Your notes and watchlist stay with this project."}
                  </Empty>
                )}
            </>
          )}
        </>
      )}
      {add && (
        <AddLesson
          projectId={projectId}
          subjects={project.data?.project.subjects || []}
          onClose={() => setAdd(false)}
          onAdded={(l) => {
            setAdd(false);
            openLesson(l);
          }}
        />
      )}
      {collection && (
        <CollectionEditor
          projectId={projectId}
          resource={collection === "new" ? undefined : collection}
          lessons={lessons}
          onClose={() => setCollection(null)}
          onSave={() => {
            setCollection(null);
            void collectionRemote.reload();
          }}
        />
      )}
      {clearHistory && (
        <Modal
          title={
            clearHistory === "all"
              ? "Clear watch history?"
              : "Remove from watch history?"
          }
          onClose={() => {
            if (!clearing) setClearHistory(null);
          }}
        >
          <p>
            {clearHistory === "all"
              ? "This clears viewing history and saved playback positions for this project."
              : `This clears the viewing history and saved playback position for “${clearHistory.title}”.`}{" "}
            Your lessons, watch later list, collections, and notes remain in
            your library.
          </p>
          <ErrorMessage message={error} />
          <div className="page-dialog-actions">
            <button
              className="button button-ghost"
              disabled={clearing}
              onClick={() => setClearHistory(null)}
            >
              Cancel
            </button>
            <button
              className="button button-danger"
              disabled={clearing}
              onClick={async () => {
                setClearing(true);
                setError("");
                try {
                  await api(
                    clearHistory === "all"
                      ? `/api/projects/${projectId}/lessons/history`
                      : `/api/projects/${projectId}/lessons/${clearHistory.id}/history`,
                    { method: "DELETE" },
                  );
                  await Promise.all([history.reload(), remote.reload()]);
                  setClearHistory(null);
                } catch (e) {
                  setError(safeError(e));
                } finally {
                  setClearing(false);
                }
              }}
            >
              {clearing
                ? "Clearing…"
                : clearHistory === "all"
                  ? "Clear watch history"
                  : "Remove from history"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function WatchProgress({ lesson }: { lesson: Lesson }) {
  return (
    <div
      className="video-watch-progress"
      aria-label={`${Math.round(lesson.duration ? Math.min(100, ((lesson.position || 0) / lesson.duration) * 100) : 0)}% playback position`}
    >
      <span
        style={{
          width: `${lesson.duration ? Math.min(100, ((lesson.position || 0) / lesson.duration) * 100) : 0}%`,
        }}
      />
    </div>
  );
}
function LessonGrid({
  lessons,
  projectId,
  onToggleSaved,
}: {
  lessons: Lesson[];
  projectId: string;
  onToggleSaved: (lesson: Lesson) => Promise<void>;
}) {
  return (
    <div className="video-grid">
      {lessons.map((l) => (
        <article className="video-card" key={l.id}>
          <Link
            href={`/projects/${projectId}/cramazon/${l.id}`}
            className="video-thumbnail"
            aria-label={`Watch ${l.title}`}
          >
            <LessonArtwork lesson={l} />
            <span className="video-play">
              <Play size={21} fill="currentColor" />
            </span>
            {l.duration ? (
              <span className="video-duration">{secondsLabel(l.duration)}</span>
            ) : null}
            {l.completed && (
              <span className="video-complete">
                <Check size={14} />
                Completed
              </span>
            )}
          </Link>
          <div className="video-card-info">
            <span className="page-eyebrow">
              {l.subject}
              {l.topic ? ` · ${l.topic}` : ""}
            </span>
            <h3>
              <Link href={`/projects/${projectId}/cramazon/${l.id}`}>
                {l.title}
              </Link>
            </h3>
            <p>{l.channel || "Manually added lesson"}</p>
            {Boolean(l.position) && (
              <>
                <WatchProgress lesson={l} />
                <span className="video-resume-label">
                  Resume at {secondsLabel(l.position)}
                </span>
              </>
            )}
            <button
              className={`page-icon-button video-save ${l.saved ? "active" : ""}`}
              aria-label={`${l.saved ? "Remove from" : "Save to"} watch later: ${l.title}`}
              onClick={() => void onToggleSaved(l)}
            >
              <Bookmark size={18} fill={l.saved ? "currentColor" : "none"} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function LessonArtwork({
  lesson,
  large,
}: {
  lesson: Lesson;
  large?: boolean;
}) {
  return (
    <div
      className={`video-artwork video-art-${lesson.subject?.toLowerCase() || "physics"} ${large ? "video-art-large" : ""}`}
    >
      {lesson.videoId ? (
        <img
          src={`https://i.ytimg.com/vi/${encodeURIComponent(lesson.videoId)}/hqdefault.jpg`}
          alt=""
          loading="lazy"
        />
      ) : (
        <Film className="video-artwork-placeholder" size={46} strokeWidth={1} />
      )}
    </div>
  );
}

function AddLesson({
  projectId,
  subjects,
  onClose,
  onAdded,
}: {
  projectId: string;
  subjects: string[];
  onClose: () => void;
  onAdded: (l: Lesson) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(subjects[0] || "General");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [details, setDetails] = useState<{
    title?: string;
    channel?: string;
    verification?: string;
    notice?: string;
  } | null>(null);
  return (
    <Modal title="Save a lesson" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            const response = await api<{ item: Lesson }>(
              `/api/projects/${projectId}/lessons/import`,
              json("POST", {
                url,
                title: title.trim() || undefined,
                subject,
                topic,
                saved: true,
              }),
            );
            onAdded(response.item);
          } catch (e) {
            setError(safeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Bring a YouTube video into your project. Its playback position and
          timestamped notes stay together.
        </p>
        <label className="page-field">
          YouTube video link
          <input
            autoFocus
            required
            type="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setDetails(null);
            }}
          />
        </label>
        <button
          type="button"
          className="button button-ghost video-fetch-details"
          disabled={resolving || !url.trim()}
          onClick={async () => {
            setResolving(true);
            setError("");
            try {
              const response = await api<{
                item: {
                  kind: string;
                  title?: string;
                  channel?: string;
                  verification?: string;
                  notice?: string;
                };
              }>(
                `/api/projects/${projectId}/youtube/resolve`,
                json("POST", { url }),
              );
              if (response.item.kind === "playlist")
                throw new Error(
                  "Paste a playlist in Discover to preview and choose its videos.",
                );
              setDetails(response.item);
              if (response.item.title && !title.trim())
                setTitle(response.item.title);
            } catch (e) {
              setError(safeError(e));
            } finally {
              setResolving(false);
            }
          }}
        >
          {resolving ? "Fetching details…" : "Fetch YouTube details"}
          <ArrowDown size={15} />
        </button>
        {details && (
          <p className="page-help">
            {details.verification === "verified"
              ? `Details from YouTube${details.channel ? ` · ${details.channel}` : ""}`
              : details.notice ||
                "Metadata is unavailable. You can enter a title yourself."}
          </p>
        )}
        <label className="page-field">
          Lesson title
          <input
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Use the YouTube title, or add your own"
          />
        </label>
        <div className="page-form-grid">
          <label className="page-field">
            Subject
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {[...new Set(["General", ...subjects])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="page-field">
            Topic
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="An idea to come back to"
            />
          </label>
        </div>
        <p className="page-help">
          We fetch the title and creator when available. A custom title is
          labelled as yours. Saving a link does not import a transcript.
        </p>
        <ErrorMessage message={error} />
        <div className="page-dialog-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={busy || resolving}
          >
            {busy ? "Saving…" : "Save lesson"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LessonPlayer({
  projectId,
  lessonId,
}: {
  projectId: string;
  lessonId: string;
}) {
  const remote = useRemote<{ item: Lesson }>(
    `/api/projects/${projectId}/lessons/${lessonId}`,
  );
  const notes = useRemote<{ items: Resource[] }>(
    `/api/projects/${projectId}/lessons/${lessonId}/notes`,
  );
  const [content, setContent] = useState("");
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const lesson = remote.data?.item;
  const params = useSearchParams();
  const requestedStart = params.get("t");
  const seekStart =
    requestedStart !== null && Number.isFinite(Number(requestedStart))
      ? Math.max(0, Number(requestedStart))
      : undefined;
  const [playerGeneration, setPlayerGeneration] = useState(0);
  const [playbackError, setPlaybackError] = useState("");
  const retryPlayback = useRef<() => void>(() => {});
  useEffect(() => {
    if (!lesson?.videoId || !container.current) return;
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastSaved = Date.now();
    let lastPosition = seekStart ?? lesson.position ?? 0;
    let measuredSeconds = 0;
    let lastTick = Date.now();
    let hasPlayed = false;
    let processing = false;
    const sessionId = crypto.randomUUID();
    let sequence = 0;
    type PlaybackEvent = {
      eventId: string;
      sessionId: string;
      occurredAt: string;
      sequence: number;
      position: number;
      duration?: number;
      watchedSeconds: number;
      state: "playing" | "paused" | "ended" | "seeked" | "closed";
    };
    const queue: PlaybackEvent[] = [];
    const endpoint = `/api/projects/${projectId}/lessons/${lessonId}/playback`;
    const processQueue = async () => {
      if (processing || !queue.length) return;
      processing = true;
      while (queue.length) {
        const event = queue[0];
        try {
          await api(endpoint, json("POST", event));
          if (queue[0]?.eventId === event.eventId) queue.shift();
          if (!disposed) {
            setSaved("Playback saved");
            setPlaybackError("");
          }
        } catch (e) {
          if (!disposed)
            setPlaybackError(`Playback has not synced. ${safeError(e)}`);
          break;
        }
      }
      processing = false;
    };
    retryPlayback.current = () => {
      void processQueue();
    };
    const sample = () => {
      const current = player.current;
      if (!current) return;
      const p = Math.max(0, current.getCurrentTime() || 0);
      const elapsed = Math.min(3, Math.max(0, (Date.now() - lastTick) / 1000));
      if (
        current.getPlayerState() === 1 &&
        p >= lastPosition &&
        p - lastPosition <= elapsed * 4 + 1
      )
        measuredSeconds += Math.min(elapsed, p - lastPosition);
      lastPosition = p;
      lastTick = Date.now();
      if (!disposed) setPosition(p);
    };
    const flush = (state: PlaybackEvent["state"], leaving = false) => {
      const current = player.current;
      if (!current || !hasPlayed) return;
      sample();
      const watchedSeconds = Math.min(60, Math.floor(measuredSeconds));
      measuredSeconds = Math.max(0, measuredSeconds - watchedSeconds);
      const duration = current.getDuration();
      queue.push({
        eventId: crypto.randomUUID(),
        sessionId,
        occurredAt: new Date().toISOString(),
        sequence: ++sequence,
        position: Math.floor(lastPosition),
        ...(Number.isFinite(duration) && duration > 0
          ? { duration: Math.floor(duration) }
          : {}),
        watchedSeconds,
        state,
      });
      lastSaved = Date.now();
      if (leaving) {
        for (const event of queue) {
          const payload = JSON.stringify(event);
          const accepted = navigator.sendBeacon?.(
            endpoint,
            new Blob([payload], { type: "application/json" }),
          );
          if (!accepted)
            void fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            }).catch(() => {});
        }
      } else void processQueue();
    };
    const onPageHide = () => flush("closed", true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden")
        flush(
          player.current?.getPlayerState() === 1 ? "playing" : "paused",
          true,
        );
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const mount = document.createElement("div");
    container.current.replaceChildren(mount);
    setReady(false);
    setPlayerError("");
    setPlaybackError("");
    setSaved("");
    setPosition(lastPosition);
    const readyTimeout = setTimeout(() => {
      if (!disposed)
        setPlayerError(
          "The embedded player hasn’t responded. You can retry or continue on YouTube.",
        );
    }, 20000);
    void loadYouTube()
      .then((YT) => {
        if (disposed) return;
        player.current = new YT.Player(mount, {
          width: "100%",
          height: "100%",
          videoId: lesson.videoId,
          playerVars: {
            playsinline: 1,
            origin: window.location.origin,
            start: Math.floor(lastPosition),
          },
          events: {
            onReady: () => {
              if (disposed) return;
              if (readyTimeout) clearTimeout(readyTimeout);
              setReady(true);
              setPlayerError("");
              player.current
                ?.getIframe?.()
                .setAttribute("title", `YouTube player: ${lesson.title}`);
              timer = setInterval(() => {
                sample();
                if (
                  Date.now() - lastSaved > 10000 &&
                  player.current?.getPlayerState() === 1
                )
                  flush("playing");
              }, 1000);
            },
            onStateChange: (event: { data: number }) => {
              if (disposed) return;
              if (event.data === 1) {
                hasPlayed = true;
                lastTick = Date.now();
                lastPosition = player.current?.getCurrentTime() || lastPosition;
                flush("playing");
              }
              if (event.data === 0 || event.data === 2)
                flush(event.data === 0 ? "ended" : "paused");
            },
            onError: (event: { data: number }) => {
              if (readyTimeout) clearTimeout(readyTimeout);
              const message =
                event.data === 100
                  ? "This video has been removed or made private."
                  : [101, 150].includes(event.data)
                    ? "The creator does not allow this video to play in embedded players."
                    : event.data === 153
                      ? "YouTube could not verify this embedded player."
                      : "This video is unavailable in the embedded player.";
              setPlayerError(
                `${message} Open it on YouTube; your notes remain available here.`,
              );
            },
          },
        });
      })
      .catch((e) => {
        if (!disposed) {
          if (readyTimeout) clearTimeout(readyTimeout);
          setPlayerError(safeError(e));
        }
      });
    return () => {
      flush("closed", true);
      disposed = true;
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer) clearInterval(timer);
      if (readyTimeout) clearTimeout(readyTimeout);
      if (player.current) {
        try {
          player.current.destroy();
        } catch {}
        player.current = null;
      }
    };
  }, [lesson?.videoId, lessonId, projectId, playerGeneration, seekStart]);
  if (remote.loading && !lesson) return <Loading />;
  if (!lesson)
    return (
      <ErrorMessage
        message={remote.error || "This lesson does not belong to this project."}
      />
    );
  return (
    <div className="video-player-page">
      <Link href={`/projects/${projectId}/cramazon`} className="page-back">
        <ArrowLeft size={17} />
        Cramazon Prime
      </Link>
      <div className="video-player-layout">
        <section>
          <div className="video-player-frame">
            <div ref={container} className="video-iframe-mount" />
            {!lesson.videoId && (
              <div className="video-player-missing">
                <Film size={36} />
                <p>No supported video is attached to this lesson.</p>
              </div>
            )}
          </div>
          {playerError && (
            <div className="video-player-fallback">
              <ErrorMessage message={playerError} />
              <div>
                <button
                  className="button button-ghost"
                  onClick={() => setPlayerGeneration((g) => g + 1)}
                >
                  <RotateCcw size={15} />
                  Retry player
                </button>
                <a
                  className="button button-primary"
                  href={`https://www.youtube.com/watch?v=${lesson.videoId}&t=${Math.floor(position)}s`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Continue on YouTube
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
          )}
          <ErrorMessage
            message={playbackError}
            retry={() => retryPlayback.current()}
          />
          <div className="video-player-title">
            <span className="page-eyebrow">
              {lesson.subject}
              {lesson.topic ? ` · ${lesson.topic}` : ""}
            </span>
            <h1>{lesson.title}</h1>
            <p>
              {lesson.channel || "Manually added lesson"}
              {lesson.metadata?.verification === "manual" ||
              (lesson.metadata?.originalTitle &&
                lesson.metadata.originalTitle !== lesson.title)
                ? " · Title entered by you"
                : ""}
              {lesson.metadata?.verification === "unavailable"
                ? " · Metadata unverified"
                : ""}
            </p>
          </div>
          <div className="video-player-actions">
            <StudyLink projectId={projectId} lessonId={lesson.id} />
            <button
              className="button button-ghost"
              onClick={async () => {
                try {
                  await api(
                    `/api/projects/${projectId}/lessons/${lessonId}`,
                    json("PATCH", { saved: !lesson.saved }),
                  );
                  await remote.reload();
                } catch (e) {
                  setError(safeError(e));
                }
              }}
            >
              <Bookmark
                size={17}
                fill={lesson.saved ? "currentColor" : "none"}
              />
              {lesson.saved ? "Saved" : "Save for later"}
            </button>
            <button
              className="button button-ghost"
              onClick={async () => {
                try {
                  await api(
                    `/api/projects/${projectId}/lessons/${lessonId}`,
                    json("PATCH", { completed: !lesson.completed }),
                  );
                  await remote.reload();
                } catch (e) {
                  setError(safeError(e));
                }
              }}
            >
              <CheckCircle2 size={17} />
              {lesson.completed ? "Marked complete" : "Mark complete"}
            </button>
            <a
              className="button button-ghost"
              href={`https://www.youtube.com/watch?v=${lesson.videoId}&t=${Math.floor(position)}s`}
              target="_blank"
              rel="noreferrer"
            >
              YouTube
              <ArrowUpRight size={16} />
            </a>
          </div>
          <ErrorMessage message={error} />
          <div className="video-lesson-description">
            <h2>A little context</h2>
            <p>
              {lesson.description ||
                "Pause whenever an idea needs more time. Add a note, explore it in Study, or come back to the lesson later."}
            </p>
            <p className="page-help">
              Playback is recorded from the player. Manual completion is
              separate from measured viewing. A transcript is not available for
              this lesson.
            </p>
            <span className="video-saved-status" role="status">
              {saved && (
                <>
                  <Check size={14} />
                  {saved}
                </>
              )}
            </span>
          </div>
          <div className="video-next-step">
            <span className="video-next-icon">
              <ArrowRight size={21} />
            </span>
            <div>
              <h3>Turn understanding into practice.</h3>
              <p>Try a question to see what has stuck.</p>
            </div>
            <Link
              href={`/projects/${projectId}/study?tool=practice&topic=${encodeURIComponent(lesson.topic || lesson.subject)}`}
              className="button button-ghost"
            >
              Practise this topic
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
        <aside className="video-note-panel">
          <div className="video-note-heading">
            <h2>Your lesson notes</h2>
            <span>{notes.data?.items.length || 0}</span>
          </div>
          <p>Capture the part that makes it click.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setError("");
              try {
                await api(
                  `/api/projects/${projectId}/lessons/${lessonId}/notes`,
                  json("POST", {
                    content,
                    timestamp: Math.floor(
                      player.current?.getCurrentTime?.() ?? position,
                    ),
                    title: `${lesson.title} — ${secondsLabel(position)}`,
                    subject: lesson.subject,
                  }),
                );
                setContent("");
                await notes.reload();
              } catch (e) {
                setError(safeError(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            <label className="video-note-time">
              <Clock3 size={14} />
              {secondsLabel(position)}
              <span>
                {ready
                  ? "Current playback position"
                  : position > 0
                    ? "Saved playback position"
                    : "Playback has not started"}
              </span>
            </label>
            <textarea
              aria-label="Timestamped lesson note"
              placeholder="An insight, a question, a reminder…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
            />
            <button
              className="button button-primary"
              disabled={saving || !content.trim()}
            >
              <Plus size={16} />
              {saving ? "Saving…" : "Add note"}
            </button>
          </form>
          <div className="video-notes-list">
            {notes.data?.items.map((n) => (
              <article key={n.id}>
                <button
                  className="video-timestamp"
                  disabled={!ready || Boolean(playerError)}
                  title={
                    ready && !playerError
                      ? "Jump to this moment"
                      : "Open this moment on YouTube below"
                  }
                  onClick={() => {
                    player.current?.seekTo(
                      Number(n.metadata?.timestamp || 0),
                      true,
                    );
                    setPosition(Number(n.metadata?.timestamp || 0));
                  }}
                >
                  {secondsLabel(Number(n.metadata?.timestamp || 0))}
                </button>
                <p>{n.content}</p>
                {(!ready || playerError) && (
                  <a
                    href={`https://www.youtube.com/watch?v=${lesson.videoId}&t=${Math.floor(Number(n.metadata?.timestamp || 0))}s`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open timestamp on YouTube
                    <ArrowUpRight size={13} />
                  </a>
                )}
                <Link href={`/projects/${projectId}/library/${n.id}`}>
                  Open in Library
                  <ArrowUpRight size={13} />
                </Link>
              </article>
            ))}
            {!notes.data?.items.length && (
              <div className="video-note-empty">
                <PencilMark />
                <p>Your notes will appear here and in your project library.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
function PencilMark() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m9 30 3-9L28 5l7 7-16 16-10 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m24 9 7 7M12 21l7 7M8 35h27"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
function CollectionEditor({
  projectId,
  resource,
  lessons,
  onClose,
  onSave,
}: {
  projectId: string;
  resource?: Resource;
  lessons: Lesson[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [title, setTitle] = useState(resource?.title || "");
  const [ids, setIds] = useState<string[]>(
    Array.isArray(resource?.metadata?.lessonIds)
      ? (resource.metadata.lessonIds as string[])
      : [],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function move(i: number, d: number) {
    setIds((all) => {
      const next = [...all];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  }
  return (
    <Modal
      title={resource ? "Edit collection" : "Create a collection"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              `/api/projects/${projectId}/resources${resource ? `/${resource.id}` : ""}`,
              json(resource ? "PATCH" : "POST", {
                title,
                type: "lesson-collection",
                metadata: { lessonIds: ids },
                revision: resource?.revision,
              }),
            );
            onSave();
          } catch (e) {
            setError(safeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="page-field">
          Collection name
          <input
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mechanics, from the beginning"
          />
        </label>
        <div className="video-collection-items">
          {ids.map((id, i) => {
            const lesson = lessons.find((l) => l.id === id);
            return (
              <div key={id}>
                <span>{i + 1}</span>
                <Link href={`/projects/${projectId}/cramazon/${id}`}>
                  {lesson?.title || "Unavailable lesson"}
                </Link>
                <button
                  type="button"
                  className="page-icon-button"
                  aria-label={`Move ${lesson?.title} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="page-icon-button"
                  aria-label={`Move ${lesson?.title} down`}
                  disabled={i === ids.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="page-icon-button"
                  aria-label={`Remove ${lesson?.title}`}
                  onClick={() => setIds((all) => all.filter((x) => x !== id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
        <label className="page-field">
          Add a lesson
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setIds((all) => [...all, e.target.value]);
            }}
          >
            <option value="">Choose from your lessons…</option>
            {lessons
              .filter((l) => !ids.includes(l.id))
              .map((l) => (
                <option value={l.id} key={l.id}>
                  {l.title}
                </option>
              ))}
          </select>
        </label>
        <ErrorMessage message={error} />
        <div className="page-dialog-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save collection"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export { CramazonPage };
