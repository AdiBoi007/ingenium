"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ArrowRight,
  BookOpen,
  Layers,
  Play,
  Check,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Clock3,
  Timer,
  Pause,
  RotateCcw,
} from "lucide-react";
import { api, json } from "@/lib/api";
import type {
  Project,
  Task,
  Resource,
  Lesson,
  Conversation,
} from "@/lib/types";
import { Modal, ErrorBox } from "./ui";
import Composer from "./study/Composer";
import { projectContextLabel } from "@/domain/project-context";
import type { CurriculumTopic } from "@/domain/curriculum";
import "./project-context.css";
export function MotionThumbnail({ type = "mechanics" }: { type?: string }) {
  return (
    <div className={`motion-thumbnail ${type}`}>
      <svg
        viewBox="0 0 340 190"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="thumb-bg" x2="1" y2="1">
            <stop stopColor="#b8cddb" />
            <stop offset="1" stopColor="#91afc4" />
          </linearGradient>
        </defs>
        <rect width="340" height="190" fill="url(#thumb-bg)" />
        <path
          d="M0 174L44 150H294L340 174V190H0Z"
          fill="#a4bdcf"
          stroke="#678ca2"
        />
        <path
          d="M44 150H294M92 150V110Q92 106 97 106H155Q160 106 160 111V150M160 121H252L245 115M252 121L245 127"
          fill="none"
          stroke="#36596c"
          strokeWidth="2.2"
        />
        <circle
          cx="171"
          cy="94"
          r="26"
          fill="#203541"
          fillOpacity=".6"
          stroke="white"
          strokeWidth="3"
        />
        <path d="M166 83L182 94L166 105Z" fill="white" />
      </svg>
    </div>
  );
}
export function Trajectory() {
  return (
    <svg
      className="trajectory"
      viewBox="0 0 280 135"
      aria-label="A parabolic projectile trajectory"
      role="img"
    >
      <path d="M6 121H274" stroke="currentColor" opacity=".4" />
      <path
        d="M20 121Q158 -53 260 121"
        stroke="currentColor"
        opacity=".48"
        fill="none"
        strokeDasharray="6 5"
        strokeWidth="1.3"
      />
      <circle cx="155" cy="34" r="6" fill="var(--blue)" />
    </svg>
  );
}
export default function Overview({
  project,
  studentName = "Adi",
}: {
  project: Project;
  studentName?: string;
}) {
  const base = `/projects/${project.id}`;
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]),
    [resources, setResources] = useState<Resource[]>([]),
    [lessons, setLessons] = useState<Lesson[]>([]),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [customize, setCustomize] = useState(false),
    [widgets, setWidgets] = useState<string[]>(
      project.settings?.widgets || ["study", "plan", "watch", "resources"],
    ),
    [focus, setFocus] = useState(false),
    [running, setRunning] = useState(false),
    [seconds, setSeconds] = useState(0),
    [focusError, setFocusError] = useState(""),
    [summary, setSummary] = useState<any>(null);
  const [topics, setTopics] = useState<CurriculumTopic[]>([]);
  useEffect(() => {
    Promise.all([
      api(`${base.replace("/projects", "/api/projects")}/tasks`),
      api(`/api/projects/${project.id}/resources`),
      api(`/api/projects/${project.id}/lessons`),
      api(`/api/projects/${project.id}/conversations`),
      api(`/api/projects/${project.id}/curriculum`),
    ])
      .then(([t, r, l, c, curriculum]) => {
        setTasks(t.items);
        setResources(r.items);
        setLessons(l.items);
        setConversations(c.items);
        setTopics(curriculum.topics);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [project.id]);
  useEffect(() => {
    if (!running) return;
    const start = Date.now() - seconds * 1000;
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [running]);
  const recent = conversations[0],
    lesson = lessons.find((l) => l.position > 0 && !l.completed) || lessons[0];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todaysTasks = tasks
    .filter((t) => t.date?.slice(0, 10) === today)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const toggle = async (t: Task) => {
    try {
      const { item } = await api(`/api/projects/${project.id}/tasks/${t.id}`, {
        method: "PATCH",
        body: json({
          status: t.status === "completed" ? "pending" : "completed",
        }),
      });
      setTasks((ts) => ts.map((x) => (x.id === t.id ? item : x)));
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    if (widgets.some((w) => ["progress", "next"].includes(w)))
      api(`/api/projects/${project.id}/progress`)
        .then(setSummary)
        .catch((e) => setError(e.message));
  }, [project.id, widgets]);
  const targetDays = project.targetDate
    ? Math.ceil(
        (new Date(project.targetDate.slice(0, 10) + "T12:00:00").getTime() -
          Date.now()) /
          86400000,
      )
    : null;
  const chooseTool = (tool: string) =>
    router.push(`${base}/study?tool=${tool}`);
  const send = (text: string, tool: string) => {
    sessionStorage.setItem(`ingenium-draft-${project.id}-new`, text);
    router.push(`${base}/study?tool=${tool}`);
  };
  const saveWidgets = async () => {
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: json({ settings: { ...project.settings, widgets } }),
      });
      setCustomize(false);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const nextTopic = topics.find(
    (t) =>
      t.active &&
      t.coverage !== "covered" &&
      t.prerequisiteIds.every((id) =>
        topics.some((p) => p.id === id && p.coverage === "covered"),
      ),
  );
  const nextSource =
    resources.find(
      (r) =>
        nextTopic &&
        r.subject === nextTopic.subject &&
        r.title.toLowerCase().includes(nextTopic.title.toLowerCase()),
    ) ||
    resources.find((r) => nextTopic && r.subject === nextTopic.subject) ||
    resources[0];
  const cards: Record<string, React.ReactNode> = {
    progress: (
      <section className="panel overview-extra" key="progress">
        <span className="eyebrow">COVERAGE & PRACTICE</span>
        <h2>A little more understood.</h2>
        <p>
          {summary?.coverageTopics?.coveredTopics || 0} of{" "}
          {summary?.coverageTopics?.totalTopics || 0} topics marked covered.
        </p>
        <p>
          {summary?.correct || 0} unaided correct answers from{" "}
          {summary?.assessedAttempts || 0} assessed attempts.
        </p>
        <small>
          Coverage is marked by you. Practice provides separate evidence.
        </small>
        <Link className="text-link" href={`${base}/progress`}>
          See the evidence
          <ArrowRight size={18} />
        </Link>
      </section>
    ),
    recent: (
      <section className="panel overview-extra" key="recent">
        <h2>Ideas to come back to</h2>
        {conversations.slice(0, 3).map((c) => (
          <Link
            className="recent-thought"
            key={c.id}
            href={`${base}/study/${c.id}`}
          >
            <BookOpen size={18} />
            <span>
              {c.title}
              <small>
                {c.subject}
                {c.sample ? " · Sample history" : ""}
              </small>
            </span>
            <ArrowRight size={16} />
          </Link>
        ))}
        {!conversations.length && (
          <p>Your conversations will find a home here.</p>
        )}
      </section>
    ),
    next: (
      <section className="panel overview-extra" key="next">
        <span className="eyebrow">A USEFUL NEXT STEP</span>
        <h2>
          {summary?.mistakes?.length
            ? "See a mistake differently."
            : nextSource
              ? `Explore ${nextSource.title}`
              : nextTopic
                ? `Make time for ${nextTopic.title}`
                : "Make this space yours."}
        </h2>
        <p>
          {summary?.mistakes?.length
            ? `${summary.mistakes.length} saved mistakes have a question worth revisiting.`
            : nextSource
              ? `A resource from your ${nextSource.subject || "project"} library is ready to read.`
              : nextTopic
                ? `From your own syllabus outline · ${nextTopic.subject}. Plan a session or add a source to begin.`
                : "Add your course notes, reading, or syllabus to build a starting point around what you study."}
        </p>
        <Link
          className="text-link"
          href={
            summary?.mistakes?.length
              ? `${base}/progress?view=mistakes`
              : nextSource
                ? `${base}/library/${nextSource.id}`
                : nextTopic
                  ? `${base}/calendar`
                  : `${base}/library`
          }
        >
          {summary?.mistakes?.length
            ? "Open your mistake book"
            : nextSource
              ? "Open your resource"
              : nextTopic
                ? "Plan a study session"
                : "Add your first resource"}
          <ArrowRight size={18} />
        </Link>
      </section>
    ),
    study: (
      <section className="panel continue-panel" key="study">
        <div className="continue-copy">
          <span className="eyebrow">CONTINUE STUDYING</span>
          <h2>{recent?.title || "Your next discovery"}</h2>
          <p>
            {recent?.subject || project.subjects[0]}
            {recent ? " · Your study workspace" : ""}
          </p>
          <p className="continue-detail">
            {recent
              ? "Pick up your last conversation."
              : "Start with a question, an idea, or a little curiosity."}
          </p>
          <Link
            className="text-link"
            href={`${base}/study${recent ? "/" + recent.id : ""}`}
          >
            {recent ? "Continue in Study" : "Open Study"}
            <ArrowRight size={20} />
          </Link>
        </div>
        {recent?.subject === "Physics" ? (
          <Trajectory />
        ) : (
          <div className="context-art" aria-hidden="true">
            <BookOpen />
          </div>
        )}
        <Composer
          compact
          projectId={project.id}
          onSend={send}
          onTool={chooseTool}
        />
      </section>
    ),
    plan: (
      <section className="panel today-panel" key="plan">
        <div className="panel-heading">
          <h2>Today’s plan</h2>
          <Link className="text-link small" href={`${base}/calendar`}>
            <CalendarDays size={19} />
            <span>View calendar</span>
          </Link>
        </div>
        <div className="today-tasks">
          {todaysTasks.length ? (
            todaysTasks.slice(0, 4).map((t) => (
              <div
                className={`today-task ${t.status === "completed" ? "completed" : ""}`}
                key={t.id}
              >
                <button
                  className="task-check"
                  aria-label={`${t.status === "completed" ? "Reopen" : "Complete"} ${t.title}`}
                  aria-pressed={t.status === "completed"}
                  onClick={() => toggle(t)}
                >
                  {t.status === "completed" && <Check size={14} />}
                </button>
                <time>{t.time?.slice(0, 5) || "Anytime"}</time>
                <Link href={`${base}/calendar?task=${t.id}`}>{t.title}</Link>
                <span>{t.duration} min</span>
              </div>
            ))
          ) : (
            <div className="plan-empty">
              <CalendarDays size={26} />
              <p>A little room to make progress.</p>
              <Link className="text-link" href={`${base}/calendar`}>
                Plan a study session <ArrowRight size={17} />
              </Link>
            </div>
          )}
        </div>
        <div className="plan-footer">
          {todaysTasks.length
            ? `${todaysTasks.length} study sessions · ${todaysTasks.reduce((s, t) => s + t.duration, 0)} min`
            : "Your day, at your pace."}
        </div>
      </section>
    ),
    watch: (
      <section className="panel watch-panel" key="watch">
        <h2>Continue watching</h2>
        {lesson ? (
          <div className="watch-content">
            <Link
              href={`${base}/cramazon/${lesson.id}`}
              aria-label={`Play ${lesson.title}`}
            >
              {lesson.subject === "Physics" ? (
                <MotionThumbnail />
              ) : (
                <div className="generic-lesson-thumbnail">
                  <Play />
                </div>
              )}
            </Link>
            <div className="watch-info">
              <h3>{lesson.title}</h3>
              <p>{lesson.subject} · Saved lesson</p>
              <div
                className="progress-track"
                aria-label={`Playback position ${Math.round(lesson.position || 0)} seconds`}
              >
                <span
                  style={{
                    width: lesson.duration
                      ? `${Math.min(100, (lesson.position / lesson.duration) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <Link
                className="text-link"
                href={`${base}/cramazon/${lesson.id}`}
              >
                Open Cramazon Prime <ArrowRight size={20} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty-note">
            <p>A new way to see a familiar idea.</p>
            <Link className="text-link" href={`${base}/cramazon`}>
              Find your first lesson <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </section>
    ),
    resources: (
      <section className="panel resources-panel" key="resources">
        <h2>Your resources</h2>
        <div className="overview-resources">
          {[...resources]
            .sort(
              (a, b) =>
                Number(
                  ["book", "module", "coaching", "collection"].includes(b.type),
                ) -
                Number(
                  ["book", "module", "coaching", "collection"].includes(a.type),
                ),
            )
            .slice(0, 3)
            .map((r) => (
              <Link key={r.id} href={`${base}/library/${r.id}`}>
                {["module", "coaching", "collection"].includes(r.type) ? (
                  <Layers size={29} />
                ) : (
                  <BookOpen size={29} />
                )}
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.type === "book"
                      ? "Book reference"
                      : ["module", "coaching", "collection"].includes(r.type)
                        ? "Coaching material"
                        : r.type === "note"
                          ? "Study note"
                          : "Project resource"}
                  </small>
                </span>
              </Link>
            ))}
        </div>
        <Link className="text-link" href={`${base}/library`}>
          {resources.length ? "Open Library" : "Add your first resource"}
          <ArrowRight size={20} />
        </Link>
      </section>
    ),
  };
  return (
    <>
      <section className="overview-hero">
        <img className="island-art" src="/island.png" alt="" />
        <div>
          <h1>
            {studentName
              ? `Make today count, ${studentName}.`
              : "Make today count."}
          </h1>
          <p>{projectContextLabel(project)} · Your learning, in one place.</p>
          {targetDays !== null && targetDays >= 0 && (
            <span className="target-countdown">
              <CalendarDays size={12} />
              {targetDays} days to your personal target
            </span>
          )}
        </div>
      </section>
      {error && <ErrorBox message={error} />}
      <div className="overview-grid" aria-busy={loading}>
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <section
                className="panel overview-skeleton"
                key={i}
                aria-label="Loading your workspace"
              >
                <span />
                <span />
                <span />
              </section>
            ))
          : widgets.map((id) => cards[id])}
      </div>
      <div className="overview-actions">
        <button className="quiet-button" onClick={() => setFocus(true)}>
          <Timer size={16} />
          Focus for a while
        </button>
        <button className="quiet-button" onClick={() => setCustomize(true)}>
          <SlidersHorizontal size={16} />
          Make this space yours
        </button>
      </div>
      {customize && (
        <Modal
          title="Your Overview, your way"
          onClose={() => setCustomize(false)}
        >
          <p className="muted">
            Choose the things you want to see. Use the arrows to change their
            order.
          </p>
          <div className="widget-settings">
            {[
              "study",
              "plan",
              "watch",
              "resources",
              "progress",
              "recent",
              "next",
            ]
              .sort(
                (a, b) =>
                  (widgets.indexOf(a) < 0 ? 99 : widgets.indexOf(a)) -
                  (widgets.indexOf(b) < 0 ? 99 : widgets.indexOf(b)),
              )
              .map((id) => (
                <div key={id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={widgets.includes(id)}
                      onChange={(e) =>
                        setWidgets((w) =>
                          e.target.checked
                            ? [...w, id]
                            : w.filter((x) => x !== id),
                        )
                      }
                    />
                    {
                      {
                        study: "Continue studying",
                        plan: "Today’s plan",
                        watch: "Continue watching",
                        resources: "Your resources",
                        progress: "Coverage & practice",
                        recent: "Recent conversations",
                        next: "Recommended next step",
                      }[id]
                    }
                  </label>
                  <button
                    className="icon-button"
                    aria-label={`Move ${id} up`}
                    disabled={widgets.indexOf(id) <= 0}
                    onClick={() =>
                      setWidgets((w) => {
                        const copy = [...w],
                          i = copy.indexOf(id);
                        [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                        return copy;
                      })
                    }
                  >
                    <ChevronUp size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Move ${id} down`}
                    disabled={
                      widgets.indexOf(id) < 0 ||
                      widgets.indexOf(id) === widgets.length - 1
                    }
                    onClick={() =>
                      setWidgets((w) => {
                        const copy = [...w],
                          i = copy.indexOf(id);
                        [copy[i + 1], copy[i]] = [copy[i], copy[i + 1]];
                        return copy;
                      })
                    }
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>
              ))}
          </div>
          <button className="button button-primary" onClick={saveWidgets}>
            Save Overview
          </button>
        </Modal>
      )}
      {focus && (
        <Modal
          title="One thing at a time"
          onClose={() => {
            setFocus(false);
            setRunning(false);
          }}
        >
          <div className="focus-timer">
            <Clock3 size={28} />
            <strong>
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </strong>
            <p>Give your attention a little space.</p>
            <div>
              <button className="button" onClick={() => setRunning(!running)}>
                {running ? <Pause size={18} /> : <Play size={18} />}
                {running ? "Pause" : "Start focus"}
              </button>
              <button
                className="button"
                onClick={() => {
                  setSeconds(0);
                  setRunning(false);
                }}
              >
                <RotateCcw size={17} />
                Reset
              </button>
            </div>
            <button
              className="button button-primary"
              disabled={!seconds}
              onClick={async () => {
                setRunning(false);
                try {
                  await api(`/api/projects/${project.id}/focus`, {
                    method: "POST",
                    body: json({ seconds, title: "Focus session" }),
                  });
                  setFocus(false);
                  setSeconds(0);
                } catch (e: any) {
                  setFocusError(e.message);
                }
              }}
            >
              Save session
            </button>
            {focusError && <ErrorBox message={focusError} />}
          </div>
        </Modal>
      )}
    </>
  );
}
