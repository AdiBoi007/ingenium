"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarPlus,
  Check,
  CircleCheck,
  Clock3,
  Layers,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import CurriculumPanel from "@/components/learning/CurriculumPanel";
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
} from "./shared";

type Attempt = {
  id: string;
  questionId?: string;
  question?: { prompt?: string; subject?: string; topic?: string };
  prompt?: string;
  subject?: string;
  topic?: string;
  correct?: boolean;
  status?: string;
  outcome?: string;
  score?: number;
  maxScore?: number;
  answer?: unknown;
  studentAnswer?: unknown;
  expectedAnswer?: unknown;
  explanation?: string;
  createdAt?: string;
  timeSpent?: number;
  hintUsed?: boolean;
  revealed?: boolean;
  testSessionId?: string;
  sample?: boolean;
};
type Mistake = {
  id: string;
  questionId?: string;
  attemptId?: string;
  prompt?: string;
  question?: { prompt?: string; subject?: string; topic?: string };
  subject?: string;
  topic?: string;
  category?: string;
  reflection?: string;
  explanation?: string;
  answer?: unknown;
  expectedAnswer?: unknown;
  nextReviewDate?: string;
  status?: string;
};
type Progress = {
  assessedAttempts?: number;
  accuracyDefinition?: string;
  attempts: number;
  correct: number;
  accuracy: number;
  subjects: Array<{
    subject: string;
    attempts: number;
    assessedAttempts?: number;
    correct: number;
  }>;
  recentAttempts: Attempt[];
  mistakes: Mistake[];
  studyMinutes: number;
  completedTasks?: number;
  watchedLessons?: number;
  coverage?: unknown;
  reviewCount?: number;
  unanswered?: number;
  hinted?: number;
  sampleAnchor?: string;
};
type Review = {
  id: string;
  title?: string;
  front?: string;
  back?: string;
  question?: string;
  answer?: string;
  subject?: string;
  dueDate?: string;
  nextReviewDate?: string;
  status?: string;
};
export default function ProgressPage({ projectId }: { projectId: string }) {
  const remote = useRemote<Progress>(`/api/projects/${projectId}/progress`);
  const mistakes = useRemote<{ items: Mistake[] }>(
    `/api/projects/${projectId}/mistakes`,
  );
  const reviews = useRemote<{ items: Review[] }>(
    `/api/projects/${projectId}/reviews`,
  );
  const params = useSearchParams();
  const [tab, setTab] = useState(
    params.get("view") === "mistakes" ? "Mistake book" : "Overview",
  );
  const [subject, setSubject] = useState("All subjects");
  const [period, setPeriod] = useState("All time");
  const [error, setError] = useState("");
  const [selectedMistake, setSelectedMistake] = useState<Mistake | null>(null);
  const [schedule, setSchedule] = useState<Mistake | null>(null);
  const [reviewDate, setReviewDate] = useState(localDate());
  const [scheduled, setScheduled] = useState<string[]>([]);
  const progress = remote.data;
  const allMistakes = mistakes.data?.items || progress?.mistakes || [];
  const allAttempts = progress?.recentAttempts || [];
  const start = new Date();
  start.setDate(start.getDate() - (period === "Last 7 days" ? 7 : 30));
  const attempts = allAttempts.filter(
    (a) =>
      (subject === "All subjects" ||
        a.subject === subject ||
        a.question?.subject === subject) &&
      (period === "All time" ||
        (a.createdAt && new Date(a.createdAt) >= start)),
  );
  const subjectStats =
    period === "All time"
      ? subject === "All subjects"
        ? progress?.subjects || []
        : progress?.subjects.filter((s) => s.subject === subject) || []
      : Object.values(
          attempts.reduce<
            Record<
              string,
              {
                subject: string;
                attempts: number;
                assessedAttempts: number;
                correct: number;
              }
            >
          >((all, a) => {
            const name = a.subject || a.question?.subject || "General";
            all[name] ??= {
              subject: name,
              attempts: 0,
              assessedAttempts: 0,
              correct: 0,
            };
            all[name].attempts++;
            if (
              ["correct", "incorrect"].includes(a.status || "") &&
              !a.hintUsed &&
              !a.revealed
            ) {
              all[name].assessedAttempts++;
              if (a.correct) all[name].correct++;
            }
            return all;
          }, {}),
        );
  const shownMistakes = allMistakes.filter(
    (m) =>
      subject === "All subjects" ||
      m.subject === subject ||
      m.question?.subject === subject,
  );
  const total =
    subject === "All subjects" && period === "All time"
      ? progress?.attempts || 0
      : attempts.length;
  const correct =
    subject === "All subjects" && period === "All time"
      ? progress?.correct || 0
      : attempts.filter((a) => a.correct && !a.hintUsed && !a.revealed).length;
  const assessed =
    subject === "All subjects" && period === "All time"
      ? (progress?.assessedAttempts ?? total)
      : attempts.filter(
          (a) =>
            ["correct", "incorrect"].includes(a.status || "") &&
            !a.hintUsed &&
            !a.revealed,
        ).length;
  const accuracy = assessed ? Math.round((correct / assessed) * 100) : 0;
  const dueReviews = (reviews.data?.items || []).filter(
    (r) =>
      !["suspended", "completed"].includes(r.status || "") &&
      ((!r.dueDate && !r.nextReviewDate) ||
        (r.dueDate || r.nextReviewDate || "").slice(0, 10) <= localDate()),
  );
  const activityDays = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 27 + i);
        const key = localDate(d);
        return {
          date: key,
          count: allAttempts.filter((a) => a.createdAt?.slice(0, 10) === key)
            .length,
        };
      }),
    [allAttempts],
  );
  return (
    <div className="progress-page">
      <PageHeading
        eyebrow="YOUR EFFORT, MADE VISIBLE"
        title="Small steps. Real progress."
        description="See what is getting clearer, and where a little practice will help."
      >
        <Link
          className="button button-primary"
          href={`/projects/${projectId}/study?tool=practice`}
        >
          <PlusMark />
          Start practising
        </Link>
      </PageHeading>
      <div className="progress-topbar">
        <div className="video-top-tabs">
          {["Overview", "Syllabus", "Attempts", "Mistake book", "Revision"].map(
            (t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
                {t === "Revision" && dueReviews.length > 0 && (
                  <span className="progress-tab-count">
                    {dueReviews.length}
                  </span>
                )}
              </button>
            ),
          )}
        </div>
        <div className="progress-filters">
          <select
            className="page-select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Progress subject"
          >
            <option>All subjects</option>
            {progress?.subjects.map((s) => (
              <option key={s.subject}>{s.subject}</option>
            ))}
          </select>
          <select
            className="page-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Progress date range"
          >
            <option>All time</option>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
        </div>
      </div>
      <ErrorMessage
        message={error || remote.error}
        retry={() => void remote.reload()}
      />
      {remote.loading && !progress ? (
        <Loading />
      ) : !progress ? (
        <Empty
          title="Your progress begins with one question."
          action={
            <Link
              className="button button-primary"
              href={`/projects/${projectId}/study?tool=practice`}
            >
              Try a practice question
            </Link>
          }
        >
          We will build a picture from the work you actually do.
        </Empty>
      ) : (
        <>
          {tab === "Overview" && (
            <>
              <div className="progress-summary">
                <div className="progress-primary-stat">
                  <span className="page-eyebrow">PRACTICE ACCURACY</span>
                  <div>
                    <strong>
                      {total ? accuracy : "—"}
                      <small>{total ? "%" : ""}</small>
                    </strong>
                    <span>
                      {correct} unaided correct
                      <br />
                      from {assessed} assessed attempts
                    </span>
                  </div>
                  <p>
                    {total < 5
                      ? "A few more questions will give you a clearer picture."
                      : "Each attempt is another chance to understand."}
                  </p>
                </div>
                <div className="progress-summary-divider" />
                <div className="progress-other-stats">
                  <div>
                    <span>
                      <BookOpen size={18} />
                      Questions attempted
                    </span>
                    <strong>{total}</strong>
                  </div>
                  <div>
                    <span>
                      <Clock3 size={18} />
                      Recorded study time
                    </span>
                    <strong>
                      {progress.studyMinutes || 0}
                      <small> min</small>
                    </strong>
                  </div>
                  <div>
                    <span>
                      <CircleCheck size={18} />
                      Tasks completed
                    </span>
                    <strong>{progress.completedTasks || 0}</strong>
                  </div>
                </div>
              </div>
              <p className="progress-evidence-note">
                {period} · Accuracy excludes blank, malformed, hinted and
                revealed answers. Watching lessons and completed tasks are
                recorded separately.
              </p>
              <div className="progress-overview-grid">
                <section className="progress-subject-panel panel">
                  <div className="progress-panel-head">
                    <h2>A subject at a time</h2>
                    <span>{subjectStats.length} subjects</span>
                  </div>
                  <div className="progress-subject-list">
                    {subjectStats.map((s, i) => {
                      const denominator = s.assessedAttempts ?? s.attempts;
                      const a = denominator
                        ? Math.round((s.correct / denominator) * 100)
                        : 0;
                      return (
                        <div key={s.subject}>
                          <div className="progress-subject-title">
                            <span
                              className={`progress-subject-dot subject-${i % 4}`}
                            />
                            <h3>{s.subject}</h3>
                            <strong>{s.attempts ? a + "%" : "—"}</strong>
                          </div>
                          <div className="progress-subject-bar">
                            <span style={{ width: `${a}%` }} />
                          </div>
                          <div className="progress-subject-foot">
                            <span>
                              {s.correct} correct / {denominator} assessed
                            </span>
                            <span>
                              {s.attempts < 5
                                ? "Insufficient evidence"
                                : a < 60
                                  ? "Needs practice"
                                  : "Improving"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!subjectStats.length && (
                    <p className="page-help">
                      Answer a few questions to start seeing subject evidence.
                    </p>
                  )}
                  <Link
                    className="progress-panel-link"
                    href={`/projects/${projectId}/study?tool=practice`}
                  >
                    Find your next question
                    <ArrowRight size={17} />
                  </Link>
                </section>
                <section className="progress-next-panel">
                  <span className="progress-next-icon">
                    <RotateCcw size={25} />
                  </span>
                  <span className="page-eyebrow">A USEFUL NEXT STEP</span>
                  <h2>
                    {allMistakes.length
                      ? "Go back. See it differently."
                      : "Keep your curiosity going."}
                  </h2>
                  <p>
                    {allMistakes.length
                      ? `${allMistakes.length} question${allMistakes.length === 1 ? "" : "s"} in your mistake book. Revisit one while the idea is still fresh.`
                      : "Try a few questions in a topic you are learning. Your attempts will help you choose what to do next."}
                  </p>
                  <button
                    className="button button-primary"
                    onClick={() =>
                      setTab(allMistakes.length ? "Mistake book" : "Attempts")
                    }
                  >
                    {allMistakes.length
                      ? "Open mistake book"
                      : "Explore attempts"}
                    <ArrowRight size={16} />
                  </button>
                  <div className="progress-next-bottom">
                    <Layers size={18} />
                    <span>
                      {dueReviews.length} review
                      {dueReviews.length === 1 ? "" : "s"} ready when you are.
                    </span>
                  </div>
                </section>
              </div>
              <section className="progress-consistency panel">
                <div>
                  <h2>Showing up adds up.</h2>
                  <p>Question attempts over the last four weeks.</p>
                </div>
                <div className="progress-activity">
                  <div className="progress-activity-grid">
                    {activityDays.map((d) => (
                      <div
                        key={d.date}
                        className={`level-${Math.min(3, d.count)}`}
                        title={`${formatDate(d.date)}: ${d.count} attempts`}
                        aria-label={`${formatDate(d.date)}: ${d.count} attempts`}
                      />
                    ))}
                  </div>
                  <div className="progress-activity-labels">
                    <span>{formatDate(activityDays[0].date)}</span>
                    <span>Today</span>
                  </div>
                </div>
              </section>
              <div className="progress-footnote">
                <Check size={14} />
                <span>
                  All figures come from saved project activity, including
                  clearly labelled synthetic sample history. No predicted ranks
                  or exam scores.
                </span>
              </div>
            </>
          )}
          {tab === "Attempts" && (
            <section className="progress-attempts panel">
              <div className="progress-panel-head">
                <h2>The work behind the numbers</h2>
                <span>{attempts.length} recorded attempts shown</span>
              </div>
              {attempts.length ? (
                <div className="progress-table-wrap">
                  <table className="progress-table">
                    <thead>
                      <tr>
                        <th>Question / topic</th>
                        <th>Subject</th>
                        <th>Result</th>
                        <th>Date</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>
                              {a.prompt ||
                                a.question?.prompt ||
                                a.topic ||
                                "Practice question"}
                            </strong>
                            <small>
                              {a.topic || a.question?.topic}
                              {a.sample || a.id.startsWith("sample-")
                                ? " · Sample history"
                                : ""}
                              {a.hintUsed ? " · Hint used" : ""}
                              {a.revealed ? " · Answer revealed" : ""}
                            </small>
                          </td>
                          <td>{a.subject || a.question?.subject || "—"}</td>
                          <td>
                            <span
                              className={`progress-result ${a.correct ? "correct" : "incorrect"}`}
                            >
                              {a.correct
                                ? a.hintUsed || a.revealed
                                  ? "Assisted correct"
                                  : "Correct"
                                : a.status === "unanswered" ||
                                    a.status === "blank" ||
                                    a.outcome === "unanswered"
                                  ? "Unanswered"
                                  : "Needs review"}
                            </span>
                          </td>
                          <td>{a.createdAt ? formatDate(a.createdAt) : "—"}</td>
                          <td>
                            <Link
                              aria-label="Retry this question"
                              className="page-icon-button"
                              href={`/projects/${projectId}/study?tool=practice${a.questionId ? `&question=${a.questionId}` : ""}`}
                            >
                              <ArrowUpRight size={17} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Your first attempt is a good start."
                  action={
                    <Link
                      className="button button-primary"
                      href={`/projects/${projectId}/study?tool=practice`}
                    >
                      Try a question
                    </Link>
                  }
                >
                  Completed practice and tests will appear here.
                </Empty>
              )}
            </section>
          )}
          {tab === "Mistake book" && (
            <section className="progress-mistakes">
              <div className="progress-section-intro">
                <h2>Every mistake has something to teach.</h2>
                <p>
                  Keep the question, understand the why, and try again. Earlier
                  attempts stay in your history.
                </p>
              </div>
              {shownMistakes.length ? (
                shownMistakes.map((m, i) => (
                  <article className="progress-mistake" key={m.id}>
                    <div className="progress-mistake-number">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="progress-mistake-body">
                      <span className="page-eyebrow">
                        {m.subject || m.question?.subject || "Practice"}
                        {m.topic ? ` · ${m.topic}` : ""}
                      </span>
                      <h3>
                        {m.prompt ||
                          m.question?.prompt ||
                          "A question worth another look"}
                      </h3>
                      {m.explanation && <p>{m.explanation}</p>}
                      <div className="progress-mistake-meta">
                        <span>{m.category || "Not categorised"}</span>
                        {m.reflection && <span>{m.reflection}</span>}
                      </div>
                      <div className="progress-mistake-actions">
                        <Link
                          className="button button-ghost"
                          href={`/projects/${projectId}/study?tool=practice${m.questionId ? `&question=${m.questionId}` : ""}`}
                        >
                          <RotateCcw size={16} />
                          Try again
                        </Link>
                        <button
                          className="button button-ghost"
                          onClick={() => setSelectedMistake(m)}
                        >
                          Add a reflection
                        </button>
                        <button
                          className="button button-ghost"
                          onClick={() => setSchedule(m)}
                          disabled={scheduled.includes(m.id)}
                        >
                          {scheduled.includes(m.id) ? (
                            <Check size={16} />
                          ) : (
                            <CalendarPlus size={16} />
                          )}{" "}
                          {scheduled.includes(m.id)
                            ? "Review scheduled"
                            : "Schedule review"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="A fresh mistake book."
                  action={
                    <Link
                      className="button button-primary"
                      href={`/projects/${projectId}/study?tool=practice`}
                    >
                      Start practising
                    </Link>
                  }
                >
                  Questions that need another look will collect here, with your
                  working and reflections.
                </Empty>
              )}
            </section>
          )}
          {tab === "Syllabus" && <CurriculumPanel projectId={projectId} />}
          {tab === "Revision" && (
            <section className="progress-revision">
              <div className="progress-revision-hero">
                <div>
                  <span className="page-eyebrow">
                    REVISIT. RECALL. REMEMBER.
                  </span>
                  <h2>
                    {dueReviews.length
                      ? `${dueReviews.length} small chances to remember.`
                      : "Make an idea stay."}
                  </h2>
                  <p>
                    Review a card, then rate your recall honestly. Opening a
                    card alone does not count as a review.
                  </p>
                </div>
                <Link
                  className="button button-primary"
                  href={`/projects/${projectId}/study?tool=revise`}
                >
                  Open flashcards
                  <ArrowRight size={17} />
                </Link>
              </div>
              <div className="progress-review-list">
                {(reviews.data?.items || []).map((r) => (
                  <Link
                    className="progress-review-row"
                    href={`/projects/${projectId}/study?tool=revise&review=${r.id}`}
                    key={r.id}
                  >
                    <span className="progress-review-icon">
                      <Layers size={20} />
                    </span>
                    <div>
                      <h3>
                        {r.title || r.front || r.question || "Review card"}
                      </h3>
                      <p>
                        {r.subject || "General"} ·{" "}
                        {r.dueDate || r.nextReviewDate
                          ? `Due ${formatDate(r.dueDate || r.nextReviewDate || "")}`
                          : "Ready to review"}
                      </p>
                    </div>
                    <ArrowRight size={18} />
                  </Link>
                ))}
              </div>
              {!reviews.data?.items.length && (
                <Empty
                  title="Build your first little deck."
                  action={
                    <Link
                      className="button button-primary"
                      href={`/projects/${projectId}/study?tool=revise`}
                    >
                      Create flashcards
                    </Link>
                  }
                >
                  Collect the formulas, ideas and questions you want to
                  remember.
                </Empty>
              )}
            </section>
          )}
        </>
      )}
      {selectedMistake && (
        <MistakeEditor
          projectId={projectId}
          mistake={selectedMistake}
          onClose={() => setSelectedMistake(null)}
          onSaved={() => {
            setSelectedMistake(null);
            void mistakes.reload();
          }}
        />
      )}
      {schedule && (
        <Modal title="Give it another go" onClose={() => setSchedule(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  `/api/projects/${projectId}/tasks`,
                  json("POST", {
                    title:
                      `Review: ${schedule.topic || schedule.prompt || "Practice mistake"}`.slice(
                        0,
                        180,
                      ),
                    date: reviewDate,
                    time: "16:00",
                    duration: 20,
                    subject: schedule.subject,
                    type: "revision",
                    status: "pending",
                    metadata: {
                      mistakeId: schedule.id,
                      questionId: schedule.questionId,
                    },
                  }),
                );
                setScheduled((s) => [...s, schedule.id]);
                setSchedule(null);
              } catch (e) {
                setError(safeError(e));
              }
            }}
          >
            <p>Add a short review session to your project calendar.</p>
            <label className="page-field">
              Date
              <input
                required
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
              />
            </label>
            <ErrorMessage message={error} />
            <div className="page-dialog-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setSchedule(null)}
              >
                Cancel
              </button>
              <button className="button button-primary">Schedule review</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function PlusMark() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 17 17"
      fill="none"
      aria-hidden="true"
    >
      <path d="M8.5 2v13M2 8.5h13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function MistakeEditor({
  projectId,
  mistake,
  onClose,
  onSaved,
}: {
  projectId: string;
  mistake: Mistake;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(mistake.category || "concept");
  const [reflection, setReflection] = useState(mistake.reflection || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="What would you try differently?" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              `/api/projects/${projectId}/mistakes/${mistake.id}`,
              json("PATCH", { category, reflection }),
            );
            onSaved();
          } catch (e) {
            setError(safeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {mistake.prompt ||
            mistake.question?.prompt ||
            "A short reflection can make your next attempt more useful."}
        </p>
        <label className="page-field">
          What got in the way?
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "concept",
              "setup",
              "calculation",
              "units",
              "misreading",
              "time",
              "custom",
            ].map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="page-field">
          Your reflection
          <textarea
            autoFocus
            rows={5}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="Next time, I’ll…"
          />
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
          <button disabled={busy} className="button button-primary">
            {busy ? "Saving…" : "Save reflection"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export { ProgressPage };
