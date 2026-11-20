"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Empty,
  ErrorMessage,
  Loading,
  Modal,
  PageHeading,
  formatDate,
  json,
  localDate,
  safeError,
  useRemote,
  type Project,
  type Task,
} from "./shared";

type Plan = {
  id: string;
  title: string;
  status: string;
  tasks: Array<Partial<Task>>;
  unscheduledMinutes: number;
  capacityMinutes: number;
  unscheduled?: Array<{ title: string; minutes: number; reason?: string }>;
  unmappedTopics?: string[];
};
function plusDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return plusDays(date, -((d.getDay() + 6) % 7));
}
function isDone(task: Task) {
  return ["completed", "done"].includes(task.status);
}
function timeMinutes(time = "09:00") {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export default function CalendarPage({ projectId }: { projectId: string }) {
  const remote = useRemote<{ items: Task[] }>(
    `/api/projects/${projectId}/tasks`,
  );
  const project = useRemote<{ project: Project }>(`/api/projects/${projectId}`);
  const sample = useRemote<{ sampleAnchor?: string }>(
    `/api/projects/${projectId}/progress`,
  );
  const [date, setDate] = useState(localDate());
  const [view, setView] = useState<"Week" | "Month" | "Agenda" | "Day">("Week");
  const [edit, setEdit] = useState<Task | "new" | null>(null);
  const [createDate, setCreateDate] = useState("");
  const [planner, setPlanner] = useState(false);
  const [error, setError] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [appliedPlan, setAppliedPlan] = useState<string | null>(null);
  const today = localDate();
  const [compact, setCompact] = useState(false);
  const [mobileMode, setMobileMode] = useState<"Agenda" | "Month">("Agenda");
  useEffect(() => {
    const saved = localStorage.getItem(`ingenium.calendar-view.${projectId}`);
    if (["Day", "Week", "Month", "Agenda"].includes(saved || ""))
      setView(saved as "Day" | "Week" | "Month" | "Agenda");
  }, [projectId]);
  function chooseView(value: "Day" | "Week" | "Month" | "Agenda") {
    setView(value);
    localStorage.setItem(`ingenium.calendar-view.${projectId}`, value);
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width:680px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const tasks = remote.data?.items || [];
  const shown = tasks.filter((t) => showCompleted || !isDone(t));
  const weekStart = startOfWeek(date);
  const week = Array.from({ length: 7 }, (_, i) => plusDays(weekStart, i));
  const monthStart = date.slice(0, 7) + "-01";
  const monthStartCell = startOfWeek(monthStart);
  const month = Array.from({ length: 42 }, (_, i) =>
    plusDays(monthStartCell, i),
  );
  const onDate = (d: string) =>
    shown
      .filter((t) => t.date?.slice(0, 10) === d)
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
  const weekTasks = tasks.filter((t) => t.date >= week[0] && t.date <= week[6]);
  const visibleTasks = shown.filter((t) =>
    (view === "Day" ? [date] : week).includes(t.date?.slice(0, 10)),
  );
  const gridStart = Math.max(
    0,
    Math.min(
      7,
      ...visibleTasks.map((t) => Math.floor(timeMinutes(t.time) / 60)),
    ),
  );
  const gridEnd = Math.min(
    24,
    Math.max(
      20,
      ...visibleTasks.map((t) =>
        Math.ceil((timeMinutes(t.time) + t.duration) / 60),
      ),
    ),
  );
  const gridHours = gridEnd - gridStart;
  async function update(task: Task, data: Partial<Task>) {
    setError("");
    try {
      await api(
        `/api/projects/${projectId}/tasks/${task.id}`,
        json("PATCH", data),
      );
      await remote.reload();
    } catch (e) {
      setError(safeError(e));
    }
  }
  function shift(dir: number) {
    if ((view === "Month" && !compact) || (compact && mobileMode === "Month")) {
      const d = new Date(`${date}T12:00:00`);
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
      setDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      );
    } else setDate(plusDays(date, dir * (compact || view === "Day" ? 1 : 7)));
  }
  async function exportCalendar() {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/calendar/export`,
      );
      if (!response.ok)
        throw new Error("Calendar export could not be generated.");
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.data?.project.name || "Ingenium"}-calendar.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
    } catch (e) {
      setError(safeError(e));
    }
  }
  const newTask = (d?: string) => {
    setCreateDate(d || date);
    setEdit("new");
  };
  return (
    <div className="cal-page">
      <PageHeading
        eyebrow="MAKE ROOM FOR WHAT MATTERS"
        title="A plan you can come back to."
        description="A little structure. A little breathing room. One day at a time."
      >
        <button
          className="button button-ghost"
          onClick={() => setPlanner(true)}
        >
          <Sparkles size={17} />
          Make a plan
        </button>
        <button className="button button-primary" onClick={() => newTask()}>
          <Plus size={18} />
          New task
        </button>
      </PageHeading>
      <div className="cal-workspace">
        <aside className="cal-sidebar">
          <div className="cal-mini-head">
            <strong>
              {formatDate(date, { month: "long", year: "numeric" })}
            </strong>
            <button
              className="page-icon-button"
              aria-label="Previous month"
              onClick={() => setDate(plusDays(monthStart, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="page-icon-button"
              aria-label="Next month"
              onClick={() => {
                const d = new Date(`${monthStart}T12:00:00`);
                d.setMonth(d.getMonth() + 1);
                setDate(
                  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
                );
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="cal-mini-grid">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
            {month.map((d) => (
              <button
                className={`${d === date ? "selected" : ""} ${d === today ? "today" : ""} ${d.slice(0, 7) !== date.slice(0, 7) ? "other" : ""}`}
                key={d}
                onClick={() => setDate(d)}
                aria-label={formatDate(d, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              >
                {Number(d.slice(8))}
                {tasks.some((t) => t.date?.slice(0, 10) === d) && <i />}
              </button>
            ))}
          </div>
          <div className="cal-sidebar-divider" />
          <h3>THIS WEEK, GENTLY</h3>
          <div className="cal-week-total">
            <strong>
              {weekTasks.reduce((n, t) => n + t.duration, 0)}
              <small>min</small>
            </strong>
            <span>of planned learning</span>
          </div>
          <div className="cal-completion-progress">
            <span
              style={{
                width: `${weekTasks.length ? (weekTasks.filter(isDone).length / weekTasks.length) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="cal-week-completed">
            {weekTasks.filter(isDone).length} of {weekTasks.length} tasks
            complete
          </p>
          <div className="cal-sidebar-divider" />
          <h3>YOUR SUBJECTS</h3>
          <div className="cal-subject-legend">
            {project.data?.project.subjects.map((s, i) => (
              <span key={s}>
                <i className={`subject-${i % 4}`} />
                {s}
              </span>
            ))}
          </div>
          <label className="cal-completed-toggle">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show completed tasks
          </label>
          <button
            className="button button-ghost cal-export"
            onClick={() => void exportCalendar()}
          >
            <ArrowDownToLine size={16} />
            Export calendar
          </button>
          <p className="page-help">Times shown in Australia/Sydney.</p>
          {tasks.length > 0 && !tasks.some((t) => t.date >= today) && (
            <button
              className="button button-ghost"
              onClick={() => setDate(tasks[0].date.slice(0, 10))}
            >
              View sample week
            </button>
          )}
        </aside>
        <section className="cal-main">
          <div className="cal-toolbar">
            <div className="cal-date-controls">
              <button
                className="page-icon-button"
                aria-label="Previous period"
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="page-icon-button"
                aria-label="Next period"
                onClick={() => shift(1)}
              >
                <ChevronRight size={19} />
              </button>
              <h2>
                {view === "Week" && !compact
                  ? `${formatDate(week[0], { day: "numeric" })}–${formatDate(week[6], { day: "numeric", month: "long", year: "numeric" })}`
                  : formatDate(
                      date,
                      view === "Month"
                        ? { month: "long", year: "numeric" }
                        : { day: "numeric", month: "long", year: "numeric" },
                    )}
              </h2>
              <button
                className="button button-ghost cal-today"
                onClick={() => setDate(today)}
              >
                Today
              </button>
            </div>
            <div className="page-segmented">
              {(["Day", "Week", "Month", "Agenda"] as const).map((v) => (
                <button
                  key={v}
                  className={v === view ? "active" : ""}
                  onClick={() => chooseView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <ErrorMessage
            message={error || remote.error}
            retry={() => void remote.reload()}
          />
          {appliedPlan && (
            <div className="cal-plan-applied">
              <Check size={17} />
              <span>Your plan is on the calendar.</span>
              <button
                className="button button-ghost"
                onClick={async () => {
                  try {
                    await api(
                      `/api/projects/${projectId}/plans/${appliedPlan}/undo`,
                      { method: "POST" },
                    );
                    setAppliedPlan(null);
                    await remote.reload();
                  } catch (e) {
                    setError(safeError(e));
                  }
                }}
              >
                <Undo2 size={16} />
                Undo plan
              </button>
            </div>
          )}
          {remote.loading && !remote.data ? (
            <Loading />
          ) : (
            <>
              <div
                className={`cal-desktop-view ${view === "Agenda" ? "cal-is-agenda" : ""}`}
              >
                {view === "Month" ? (
                  <div className="cal-month-grid">
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((d) => (
                      <div key={d} className="cal-month-day-label">
                        {d.slice(0, 3)}
                      </div>
                    ))}
                    {month.map((d) => (
                      <div
                        key={d}
                        className={`cal-month-cell ${d.slice(0, 7) !== date.slice(0, 7) ? "other" : ""}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const t = tasks.find(
                            (t) =>
                              t.id === e.dataTransfer.getData("text/plain"),
                          );
                          if (t && !t.fixed) void update(t, { date: d });
                        }}
                      >
                        <button
                          className={d === today ? "today" : ""}
                          onClick={() => newTask(d)}
                          aria-label={`Add task on ${formatDate(d)}`}
                        >
                          {Number(d.slice(8))}
                        </button>
                        {onDate(d)
                          .slice(0, 3)
                          .map((t) => (
                            <button
                              className={`cal-month-task ${isDone(t) ? "completed" : ""}`}
                              key={t.id}
                              onClick={() => setEdit(t)}
                            >
                              <span>{t.time?.slice(0, 5)}</span>
                              {t.title}
                            </button>
                          ))}
                        {onDate(d).length > 3 && (
                          <button
                            className="cal-more-tasks"
                            onClick={() => {
                              setDate(d);
                              setView("Day");
                            }}
                          >
                            +{onDate(d).length - 3} more
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : view === "Agenda" ? (
                  <Agenda
                    tasks={shown.filter(
                      (t) => t.date >= week[0] && t.date <= week[6],
                    )}
                    onEdit={setEdit}
                    onToggle={(t) =>
                      void update(t, {
                        status: isDone(t) ? "pending" : "completed",
                      })
                    }
                    onNew={() => newTask()}
                  />
                ) : (
                  <div
                    className={`cal-week-grid ${view === "Day" ? "cal-single-day" : ""}`}
                  >
                    <div className="cal-hours-label">SYD</div>
                    {(view === "Day" ? [date] : week).map((d) => (
                      <div
                        key={d}
                        className={`cal-week-day-head ${d === today ? "today" : ""}`}
                      >
                        <span>{formatDate(d, { weekday: "short" })}</span>
                        <button
                          onClick={() => {
                            setDate(d);
                            setView("Day");
                          }}
                        >
                          {Number(d.slice(8))}
                        </button>
                      </div>
                    ))}
                    <div className="cal-hours">
                      {Array.from({ length: gridHours }, (_, i) => (
                        <span key={i}>
                          {String(i + gridStart).padStart(2, "0")}:00
                        </span>
                      ))}
                    </div>
                    {(view === "Day" ? [date] : week).map((d) => (
                      <div
                        key={d}
                        className="cal-day-column"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const t = tasks.find(
                            (t) =>
                              t.id === e.dataTransfer.getData("text/plain"),
                          );
                          if (t && !t.fixed) {
                            const y =
                              e.clientY -
                              e.currentTarget.getBoundingClientRect().top;
                            const mins = Math.max(
                              gridStart * 60,
                              Math.min(
                                gridEnd * 60 - 15,
                                Math.round(
                                  ((y / 54) * 60 + gridStart * 60) / 15,
                                ) * 15,
                              ),
                            );
                            void update(t, {
                              date: d,
                              time: `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
                            });
                          }
                        }}
                      >
                        {Array.from({ length: gridHours }, (_, i) => (
                          <button
                            key={i}
                            aria-label={`Add task ${formatDate(d)} at ${i + gridStart}:00`}
                            className="cal-time-slot"
                            onClick={() => {
                              setCreateDate(d);
                              setEdit({
                                id: "",
                                projectId,
                                title: "",
                                date: d,
                                time: `${String(i + gridStart).padStart(2, "0")}:00`,
                                duration: 30,
                                type: "study",
                                status: "pending",
                              });
                            }}
                          />
                        ))}
                        {onDate(d).map((t) => {
                          const top =
                            ((timeMinutes(t.time) - gridStart * 60) / 60) * 54;
                          const index =
                            project.data?.project.subjects.indexOf(
                              t.subject || "",
                            ) ?? 0;
                          return (
                            <button
                              draggable={!t.fixed}
                              onDragStart={(e) =>
                                e.dataTransfer.setData("text/plain", t.id)
                              }
                              key={t.id}
                              className={`cal-event subject-${Math.max(0, index) % 4} ${isDone(t) ? "completed" : ""}`}
                              style={{
                                top: `${Math.max(0, Math.min(top, gridHours * 54 - 43))}px`,
                                height: `${Math.max(43, (t.duration / 60) * 54)}px`,
                              }}
                              onClick={() => setEdit(t)}
                            >
                              <span>
                                {t.time?.slice(0, 5)}
                                {isDone(t) && <Check size={12} />}
                              </span>
                              <strong>{t.title}</strong>
                              {t.duration >= 50 && (
                                <small>
                                  {t.duration} min · {t.subject || t.type}
                                </small>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="cal-mobile-agenda">
                <div className="cal-mobile-controls">
                  <label>
                    Jump to date
                    <input
                      aria-label="Jump to date"
                      type="date"
                      value={date}
                      onChange={(e) => {
                        if (e.target.value) setDate(e.target.value);
                      }}
                    />
                  </label>
                  <div className="page-segmented">
                    {(["Agenda", "Month"] as const).map((mode) => (
                      <button
                        key={mode}
                        className={mobileMode === mode ? "active" : ""}
                        onClick={() => setMobileMode(mode)}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                {mobileMode === "Month" && (
                  <div className="cal-mobile-month">
                    <div className="cal-mini-grid">
                      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                        <span key={i}>{d}</span>
                      ))}
                      {month.map((d) => (
                        <button
                          key={d}
                          className={`${d === date ? "selected" : ""} ${d.slice(0, 7) !== date.slice(0, 7) ? "other" : ""}`}
                          onClick={() => setDate(d)}
                          aria-label={`Show tasks on ${formatDate(d)}`}
                        >
                          {Number(d.slice(8))}
                          {tasks.some((t) => t.date?.slice(0, 10) === d) && (
                            <i />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="cal-mobile-date">
                  <CalendarDays size={19} />
                  <strong>
                    {formatDate(date, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </strong>
                </div>
                <Agenda
                  tasks={onDate(date)}
                  onEdit={setEdit}
                  onToggle={(t) =>
                    void update(t, {
                      status: isDone(t) ? "pending" : "completed",
                    })
                  }
                  onNew={() => newTask(date)}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {Boolean(sample.data?.sampleAnchor) && (
        <button
          className="button button-ghost cal-sample-week"
          onClick={() =>
            setDate(sample.data?.sampleAnchor?.slice(0, 10) || today)
          }
        >
          <CalendarDays size={16} />
          View sample week
        </button>
      )}
      {edit && (
        <TaskEditor
          projectId={projectId}
          task={edit === "new" ? undefined : edit}
          date={createDate || date}
          subjects={project.data?.project.subjects || []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void remote.reload();
          }}
        />
      )}
      {planner && (
        <PlanBuilder
          projectId={projectId}
          subjects={project.data?.project.subjects || []}
          defaultMinutes={Number(
            project.data?.project.settings?.minutesPerDay ||
              project.data?.project.settings?.availableMinutes ||
              120,
          )}
          defaultStart={String(
            project.data?.project.settings?.studyStart || "16:00",
          )}
          date={date}
          onClose={() => setPlanner(false)}
          onApplied={(id) => {
            setAppliedPlan(id);
            setPlanner(false);
            void remote.reload();
          }}
        />
      )}
    </div>
  );
}
function Agenda({
  tasks,
  onEdit,
  onToggle,
  onNew,
}: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onToggle: (t: Task) => void;
  onNew: () => void;
}) {
  const days = [...new Set(tasks.map((t) => t.date.slice(0, 10)))].sort();
  return (
    <div className="cal-agenda">
      {days.map((d) => (
        <section key={d}>
          <h3>
            {formatDate(d, { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {tasks
            .filter((t) => t.date.slice(0, 10) === d)
            .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
            .map((t) => (
              <div
                className={`cal-agenda-task ${isDone(t) ? "completed" : ""}`}
                key={t.id}
              >
                <button
                  className="cal-check"
                  aria-label={`${isDone(t) ? "Reopen" : "Complete"} ${t.title}`}
                  onClick={() => onToggle(t)}
                >
                  {isDone(t) && <Check size={14} />}
                </button>
                <span>{t.time?.slice(0, 5) || "All day"}</span>
                <button
                  className="cal-agenda-task-title"
                  onClick={() => onEdit(t)}
                >
                  <strong>{t.title}</strong>
                  <small>
                    {t.subject || t.type}
                    {t.fixed ? " · Fixed commitment" : ""}
                  </small>
                </button>
                <span className="cal-agenda-duration">{t.duration} min</span>
              </div>
            ))}
        </section>
      ))}
      {!tasks.length && (
        <Empty
          title="A little space in your day."
          action={
            <button className="button button-primary" onClick={onNew}>
              <Plus size={17} />
              Plan a study session
            </button>
          }
        >
          Add a task or keep some time open. Both are part of a good plan.
        </Empty>
      )}
    </div>
  );
}
function TaskEditor({
  projectId,
  task,
  date,
  subjects,
  onClose,
  onSaved,
}: {
  projectId: string;
  task?: Task;
  date: string;
  subjects: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [taskDate, setTaskDate] = useState(task?.date?.slice(0, 10) || date);
  const [time, setTime] = useState(task?.time?.slice(0, 5) || "09:00");
  const [duration, setDuration] = useState(task?.duration || 30);
  const [subject, setSubject] = useState(task?.subject || subjects[0] || "");
  const [type, setType] = useState(task?.type || "study");
  const [repeat, setRepeat] = useState(false);
  const [count, setCount] = useState(4);
  const [scope, setScope] = useState("occurrence");
  const [status, setStatus] = useState(task?.status || "pending");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function save(duplicate = false) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/projects/${projectId}/tasks${task?.id && !duplicate ? `/${task.id}` : ""}`,
        json(task?.id && !duplicate ? "PATCH" : "POST", {
          force: duplicate,
          title,
          date: taskDate,
          time,
          duration,
          subject,
          type,
          status: duplicate ? "pending" : status,
          timezone: "Australia/Sydney",
          fixed: type === "commitment",
          recurrence: repeat ? { frequency: "weekly", count } : undefined,
          scope,
          resourceId: task?.resourceId,
          questionId: task?.questionId,
          attemptId: task?.attemptId,
          sessionId: task?.sessionId,
        }),
      );
      onSaved();
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task?.id ? "Your study session" : "Make a little time"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="page-field">
          What will you work on?
          <input
            autoFocus
            required
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Practise electrostatics"
          />
        </label>
        <div className="page-form-grid">
          <label className="page-field">
            Date
            <input
              required
              type="date"
              value={taskDate}
              onChange={(e) => setTaskDate(e.target.value)}
            />
          </label>
          <label className="page-field">
            Start time
            <input
              required
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
        <div className="page-form-grid">
          <label className="page-field">
            Duration, minutes
            <input
              type="number"
              required
              min={5}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
          <label className="page-field">
            Subject
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">General</option>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="page-form-grid">
          <label className="page-field">
            Session type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="study">Study</option>
              <option value="practice">Practice</option>
              <option value="revision">Revision</option>
              <option value="test">Test</option>
              <option value="commitment">Fixed commitment</option>
              <option value="assignment">Assignment</option>
            </select>
          </label>
          <label className="page-field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Planned</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>
        {task?.seriesId ? (
          <label className="page-field">
            Apply changes to
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="occurrence">This occurrence</option>
              <option value="series">The whole series</option>
            </select>
          </label>
        ) : (
          !task?.id && (
            <div className="cal-recurrence">
              <label>
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                />
                Repeat weekly
              </label>
              {repeat && (
                <label>
                  for{" "}
                  <input
                    aria-label="Number of weekly occurrences"
                    type="number"
                    min={2}
                    max={52}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />{" "}
                  weeks
                </label>
              )}
            </div>
          )
        )}
        <p className="page-help">
          Australia/Sydney · Rescheduling is also available by dragging a
          flexible task in the week view.
        </p>
        {task?.questionId && (
          <Link
            className="button button-ghost"
            href={`/projects/${projectId}/study?tool=practice&question=${task.questionId}`}
          >
            Open linked question
            <ExternalLink size={15} />
          </Link>
        )}
        {!task?.questionId && task?.sessionId && (
          <Link
            className="button button-ghost"
            href={`/projects/${projectId}/tests/${task.sessionId}`}
          >
            Open linked test
            <ExternalLink size={15} />
          </Link>
        )}
        {task?.resourceId && (
          <Link
            className="button button-ghost"
            href={`/projects/${projectId}/library/${task.resourceId}`}
          >
            Open linked resource
            <ExternalLink size={15} />
          </Link>
        )}
        <ErrorMessage message={error} />
        <div className="page-dialog-actions cal-editor-actions">
          {task?.id && (
            <>
              <button
                type="button"
                className="page-icon-button"
                aria-label="Duplicate task"
                onClick={() => void save(true)}
                disabled={busy}
              >
                <Copy size={17} />
              </button>
              <button
                type="button"
                className="page-icon-button page-danger-text"
                aria-label="Delete task"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={17} />
              </button>
            </>
          )}
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : task?.id ? "Save changes" : "Add to calendar"}
          </button>
        </div>
        {confirmDelete && (
          <div className="cal-delete-confirm">
            <p>
              Delete “{title}”
              {scope === "series" ? " and all occurrences in its series" : ""}?
            </p>
            <button
              type="button"
              className="button page-danger"
              onClick={async () => {
                try {
                  await api(
                    `/api/projects/${projectId}/tasks/${task?.id}?scope=${scope}`,
                    { method: "DELETE" },
                  );
                  onSaved();
                } catch (e) {
                  setError(safeError(e));
                }
              }}
            >
              Delete task
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setConfirmDelete(false)}
            >
              Keep task
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
function PlanBuilder({
  projectId,
  subjects,
  date,
  defaultMinutes,
  defaultStart,
  onClose,
  onApplied,
}: {
  projectId: string;
  subjects: string[];
  date: string;
  defaultMinutes: number;
  defaultStart: string;
  onClose: () => void;
  onApplied: (id: string) => void;
}) {
  const [start, setStart] = useState(date);
  const [end, setEnd] = useState(plusDays(date, 6));
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [startTime, setStartTime] = useState(defaultStart);
  const [session, setSession] = useState(30);
  const [topics, setTopics] = useState(
    subjects.map((s) => `${s} | 90`).join("\n"),
  );
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={plan ? "Your week, before you commit" : "Build a manageable plan"}
      onClose={onClose}
      wide
    >
      {plan ? (
        <>
          <p>
            The planner fits sessions around your existing commitments. Review
            the proposed sessions before adding them.
          </p>
          <div className="cal-plan-summary">
            <span>
              <strong>{plan.tasks?.length || 0}</strong> sessions
            </span>
            <span>
              <strong>{plan.capacityMinutes}</strong> minutes available
            </span>
            <span>
              <strong>{plan.unscheduledMinutes || 0}</strong> minutes
              unscheduled
            </span>
          </div>
          {plan.unscheduledMinutes > 0 && (
            <p className="cal-plan-warning">
              Some work will not fit. Extend the date range or reduce the
              workload; your available hours have not been changed.
            </p>
          )}
          {(plan.unscheduled?.length || 0) > 0 && (
            <ul className="cal-plan-unscheduled">
              {plan.unscheduled?.map((item, i) => (
                <li key={i}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.minutes} min remaining
                    {item.reason ? ` · ${item.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="cal-plan-preview">
            {plan.tasks?.map((t, i) => (
              <div key={i}>
                <span>{t.date ? formatDate(t.date) : ""}</span>
                <span>{t.time}</span>
                <strong>{t.title}</strong>
                <span>{t.duration} min</span>
              </div>
            ))}
          </div>
          <ErrorMessage message={error} />
          <div className="page-dialog-actions">
            <button
              className="button button-ghost"
              onClick={() => setPlan(null)}
            >
              <ArrowLeft size={16} />
              Adjust plan
            </button>
            <button
              className="button button-primary"
              disabled={busy || !plan.tasks?.length}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(
                    `/api/projects/${projectId}/plans/${plan.id}/apply`,
                    { method: "POST" },
                  );
                  onApplied(plan.id);
                } catch (e) {
                  setError(safeError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Applying…" : "Add to my calendar"}
              <ArrowRight size={17} />
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              const r = await api<{ item: Plan }>(
                `/api/projects/${projectId}/plans`,
                json("POST", {
                  startDate: start,
                  endDate: end,
                  minutesPerDay: minutes,
                  sessionMinutes: session,
                  startTime,
                  topics: topics
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [title, estimate] = line
                        .split("|")
                        .map((x) => x.trim());
                      const workload = estimate ? Number(estimate) : session;
                      if (
                        !Number.isFinite(workload) ||
                        workload < 1 ||
                        workload > 10000
                      )
                        throw new Error(
                          "Use a positive minute estimate, e.g. Electrostatics | 90.",
                        );
                      return {
                        title,
                        subject: subjects.includes(title) ? title : "",
                        minutes: workload,
                      };
                    }),
                }),
              );
              setPlan(r.item);
            } catch (e) {
              setError(safeError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            A practical schedule, built around the time you actually have.
            Nothing is added until you apply it.
          </p>
          <div className="page-form-grid">
            <label className="page-field">
              From
              <input
                required
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="page-field">
              To
              <input
                required
                type="date"
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="page-form-grid">
            <label className="page-field">
              Available minutes per day
              <input
                required
                type="number"
                min={15}
                max={480}
                step={15}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
            <label className="page-field">
              Session length
              <select
                value={session}
                onChange={(e) => setSession(Number(e.target.value))}
              >
                <option value={25}>25 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          </div>
          <label className="page-field">
            Study window starts
            <input
              required
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="page-field">
            Topics and workload, one per line
            <textarea
              rows={5}
              required
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
            />
            <small>
              Use Topic | estimated minutes, e.g. Electrostatics | 90. Without
              an estimate, one session is scheduled.
            </small>
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
              <Sparkles size={17} />
              {busy ? "Finding a good fit…" : "Preview plan"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export { CalendarPage };
