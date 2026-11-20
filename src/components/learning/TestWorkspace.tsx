"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Send,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { api, json } from "../../lib/api";
import { ErrorBox, Loading, Modal } from "../ui";
import {
  AnswerInput,
  type PublicQuestion,
  type Attempt,
} from "./PracticeWorkspace";
type Response = { answer: unknown; flagged?: boolean };
type Session = {
  id: string;
  title: string;
  status: string;
  deadline: string;
  startedAt: string;
  remainingSeconds?: number;
  questions: PublicQuestion[];
  responses: Record<string, Response>;
  attempts?: Attempt[];
  score?: number;
  maxScore?: number;
  automaticScore?: number;
  automaticMaxScore?: number;
  ungradedQuestionCount?: number;
  pendingSelfReviewCount?: number;
  historicalScoreProvisional?: boolean;
  policy?: Record<string, number>;
};
export function TestWorkspace({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId?: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!sessionId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(5);
  const [duration, setDuration] = useState(15);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [seconds, setSeconds] = useState(0);
  const [saveStatus, setSaveStatus] = useState("All answers saved");
  const [confirm, setConfirm] = useState(false);
  const [recent, setRecent] = useState<Session[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState("");
  const [submissionNotice, setSubmissionNotice] = useState("");
  const [unsavedAtExpiry, setUnsavedAtExpiry] = useState<
    Record<string, unknown>
  >({});
  const responseDrafts = useRef<Record<string, Response>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const failedSave = useRef(false);
  const failedQuestions = useRef(new Set<string>());
  const submission = useRef(false);
  const deadline = useRef(0);
  const currentSession = useRef<string | undefined>(sessionId);
  const base = `/api/projects/${projectId}/tests`;
  useEffect(() => {
    api<{ project: { subjects: string[] } }>(`/api/projects/${projectId}`)
      .then((r) => setSubjects(r.project.subjects))
      .catch(() => {});
    if (!sessionId)
      api<{ items: Session[] }>(base)
        .then((r) => setRecent(r.items))
        .catch(() => {});
  }, [projectId, sessionId, base]);
  const applySession = useCallback((item: Session) => {
    setSession(item);
    setResponses(item.responses ?? {});
    responseDrafts.current = item.responses ?? {};
    setSeconds(
      item.remainingSeconds ??
        Math.max(
          0,
          Math.floor((Date.parse(item.deadline) - Date.now()) / 1000),
        ),
    );
    deadline.current =
      Date.now() +
      (item.remainingSeconds ??
        Math.max(
          0,
          Math.floor((Date.parse(item.deadline) - Date.now()) / 1000),
        )) *
        1000;
    currentSession.current = item.id;
  }, []);
  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const r = await api<{ item: Session }>(`${base}/${sessionId}`);
      applySession(r.item);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, base, applySession]);
  useEffect(() => {
    void load();
  }, [load]);
  const submit = useCallback(async () => {
    const id = currentSession.current;
    if (!id || submission.current) return;
    submission.current = true;
    setBusy(true);
    setError("");
    try {
      await saveQueue.current;
      const expired = deadline.current > 0 && Date.now() >= deadline.current;
      if (failedSave.current && !expired)
        throw new Error(
          "An answer has not saved. Retry the save before submitting; your draft is still visible.",
        );
      const unsaved = expired
        ? Object.fromEntries(
            [...failedQuestions.current].map((questionId) => [
              questionId,
              responseDrafts.current[questionId]?.answer,
            ]),
          )
        : {};
      const r = await api<{ item: Session }>(`${base}/${id}/submit`, {
        method: "POST",
        body: "{}",
      });
      setUnsavedAtExpiry(unsaved);
      setSubmissionNotice(
        Object.keys(unsaved).length
          ? "The deadline was reached. Your last saved answers were graded; unsaved drafts are shown in question review and were not included."
          : expired
            ? "The deadline was reached. Your saved answers were submitted automatically."
            : "",
      );
      applySession(r.item);
      setConfirm(false);
      setSaveStatus("Test submitted and graded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      submission.current = false;
    }
  }, [base, applySession]);
  useEffect(() => {
    if (session?.status !== "active") return;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (remaining <= 0) void submit();
    };
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [session?.status, submit]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ item: Session }>(base, {
        method: "POST",
        body: json({
          subject: subject || undefined,
          count,
          durationMinutes: duration,
          title: subject
            ? `${subject} · custom practice`
            : "Custom practice test",
        }),
      });
      applySession(r.item);
      router.push(`/projects/${projectId}/tests/${r.item.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveResponse(
    questionId: string,
    answer: unknown,
    flagged?: boolean,
  ) {
    const targetSessionId = currentSession.current;
    const targetBase = base;
    if (!targetSessionId || busy || seconds <= 0) return;
    responseDrafts.current = {
      ...responseDrafts.current,
      [questionId]: {
        answer,
        flagged:
          flagged ?? responseDrafts.current[questionId]?.flagged ?? false,
      },
    };
    setResponses(responseDrafts.current);
    pending.current++;
    setSaveStatus("Saving your answer…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        try {
          await api(`${targetBase}/${targetSessionId}`, {
            method: "PATCH",
            body: json({ questionId, answer, flagged }),
          });
          pending.current--;
          failedQuestions.current.delete(questionId);
          failedSave.current = failedQuestions.current.size > 0;
          if (!pending.current && !failedSave.current)
            setSaveStatus("All answers saved");
        } catch (e) {
          pending.current--;
          failedQuestions.current.add(questionId);
          failedSave.current = true;
          setSaveStatus("Not saved · retry below");
          setError((e as Error).message);
        }
      });
  }
  async function retrySaves() {
    setError("");
    failedSave.current = false;
    for (const [id, response] of Object.entries(responses))
      saveResponse(id, response.answer, response.flagged);
  }
  const hasAnswer = (value: unknown) =>
    Array.isArray(value)
      ? value.length > 0
      : value !== null &&
        value !== undefined &&
        String(value).trim().length > 0;
  const answered = Object.values(responses).filter((r) =>
    hasAnswer(r.answer),
  ).length;
  const active = session?.questions[index];
  if (loading) return <Loading label="Resuming your test…" />;
  if (!session)
    return (
      <section className="test-workspace">
        <div className="learn-breadcrumb">
          <Link href={`/projects/${projectId}/study`}>
            <ArrowLeft size={16} />
            Study
          </Link>
          <span>/</span>
          <span>Take a test</span>
        </div>
        <div className="test-start panel">
          <div className="test-start-symbol">
            <Timer size={32} />
          </div>
          <p className="learn-eyebrow">A LITTLE FOCUS. A CLEARER PICTURE.</p>
          <h1>Make room for a challenge.</h1>
          <p className="test-start-intro">
            A focused session with original questions from this project.
            <br />
            Your answers and timer stay with you, even after a refresh.
          </p>
          <div className="test-configuration">
            <label>
              Subject
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">All project subjects</option>
                {subjects.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Questions
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                <option value={5}>5 questions</option>
                <option value={10}>10 questions</option>
                <option value={20}>20 questions</option>
              </select>
            </label>
            <label>
              Time limit
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          </div>
          <div className="test-rules">
            <div>
              <ShieldCheck size={19} />
              <span>
                <strong>Custom marking</strong>+4 correct · −1 incorrect · 0
                blank. Multiple answers require an exact match. Free responses
                require self-review.
              </span>
            </div>
            <div>
              <Clock size={19} />
              <span>
                <strong>A real deadline</strong>The timer starts when you begin
                and continues if you close this page. Unanswered questions
                submit at expiry.
              </span>
            </div>
            <div>
              <BookOpenIcon />
              <span>
                <strong>Original practice</strong>This is not an official-format
                exam. If fewer eligible questions exist, your test uses those
                available.
              </span>
            </div>
          </div>
          {error && <ErrorBox message={error} />}
          <button
            className="button button-primary test-start-button"
            onClick={start}
            disabled={busy}
          >
            {busy ? "Preparing your test…" : "Begin practice test"}
            <ArrowRight size={18} />
          </button>
        </div>
        {recent.length > 0 && (
          <div className="test-history panel">
            <h3>Your recent tests</h3>
            {recent.slice(0, 6).map((t) => (
              <Link key={t.id} href={`/projects/${projectId}/tests/${t.id}`}>
                <div>
                  <strong>{t.title}</strong>
                  <span>
                    {t.status === "active"
                      ? "Resume this session"
                      : "View results"}
                  </span>
                </div>
                <span>
                  {t.status === "submitted" && t.score !== undefined
                    ? `Stored total · ${t.score} / ${t.maxScore}`
                    : ""}
                  <ArrowRight size={17} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  if (session.status === "submitted")
    return (
      <section className="test-workspace">
        <div className="learn-breadcrumb">
          <Link href={`/projects/${projectId}/study`}>
            <ArrowLeft size={16} />
            Study
          </Link>
          <span>/</span>
          <span>Test review</span>
        </div>
        <div className="test-result-header">
          <div>
            <p className="learn-eyebrow">ONE SESSION. NEW UNDERSTANDING.</p>
            <h1>Here’s what you learned.</h1>
            <p>
              {session.title} · {session.questions.length} questions · custom
              marking
            </p>
          </div>
          <div className="test-score">
            <strong>
              {(session.automaticMaxScore ?? session.maxScore ?? 0) === 0 ? (
                "—"
              ) : (
                <>
                  {session.automaticScore ?? session.score ?? 0}
                  <span>/{session.automaticMaxScore ?? session.maxScore}</span>
                </>
              )}
            </strong>
            <span>
              {(session.automaticMaxScore ?? session.maxScore ?? 0) === 0
                ? "No automatically graded questions"
                : session.ungradedQuestionCount
                  ? "Automatically graded subtotal"
                  : "points earned"}
            </span>
          </div>
        </div>
        {!!session.ungradedQuestionCount && (
          <p className="learn-notice" role="status">
            {session.ungradedQuestionCount}{" "}
            {session.ungradedQuestionCount === 1
              ? "question requires"
              : "questions require"}{" "}
            self-review and {session.ungradedQuestionCount === 1 ? "is" : "are"}{" "}
            excluded from the automatic score.{" "}
            {session.pendingSelfReviewCount ?? 0} submitted{" "}
            {session.pendingSelfReviewCount === 1
              ? "response awaits"
              : "responses await"}{" "}
            self-review; no grade has been assigned to that work.
          </p>
        )}
        {session.historicalScoreProvisional && (
          <p className="learn-notice">
            Historical stored total: {session.score} / {session.maxScore}. That
            total included ungraded work and is provisional. The automatically
            graded subtotal shown above excludes it; the original record has
            been retained.
          </p>
        )}
        {submissionNotice && (
          <p className="learn-notice" role="status">
            {submissionNotice}
          </p>
        )}
        <div className="test-review-summary panel">
          <div>
            <strong>
              {session.attempts?.filter((a) => a.correct).length ?? 0}
            </strong>
            <span>Correct</span>
          </div>
          <div>
            <strong>
              {session.attempts?.filter(
                (a) => a.status === "incorrect" || a.status === "malformed",
              ).length ?? 0}
            </strong>
            <span>To revisit</span>
          </div>
          <div>
            <strong>
              {session.attempts?.filter((a) => a.status === "blank").length ??
                0}
            </strong>
            <span>Unanswered</span>
          </div>
          <div>
            <strong>
              {session.attempts?.filter((a) => a.status === "needs_review")
                .length ?? 0}
            </strong>
            <span>Self-review</span>
          </div>
        </div>
        <div className="test-review-list panel">
          <div className="learn-row">
            <h3>Every question, a next step.</h3>
            <Link
              className="button button-ghost"
              href={`/projects/${projectId}/progress`}
            >
              View Progress
              <ArrowRight size={16} />
            </Link>
          </div>
          {session.questions.map((q, i) => {
            const a = session.attempts?.find(
              (attempt) => attempt.questionId === q.id,
            );
            return (
              <div className="test-review-item" key={q.id}>
                <button
                  className="test-review-toggle"
                  onClick={() => setReviewIndex(reviewIndex === i ? null : i)}
                  aria-expanded={reviewIndex === i}
                >
                  <span
                    className={`test-question-status ${a?.correct ? "correct" : ""}`}
                  >
                    {a?.correct ? <Check size={17} /> : i + 1}
                  </span>
                  <span>
                    <strong>{q.topic}</strong>
                    <span>{q.prompt}</span>
                  </span>
                  <span>
                    {a?.status === "needs_review"
                      ? "Self-review"
                      : a?.status === "blank"
                        ? "Unanswered"
                        : a?.correct
                          ? "Correct"
                          : "Review"}
                    <ChevronRight size={17} />
                  </span>
                </button>
                {reviewIndex === i && (
                  <div className="test-review-detail">
                    <p>
                      <strong>Your answer:</strong>{" "}
                      {Array.isArray(responses[q.id]?.answer)
                        ? (responses[q.id].answer as string[]).join(", ")
                        : String(responses[q.id]?.answer ?? "Unanswered")}
                    </p>
                    <p>
                      <strong>Expected answer:</strong>{" "}
                      {Array.isArray(q.answer) ? q.answer.join(", ") : q.answer}
                    </p>
                    {Object.hasOwn(unsavedAtExpiry, q.id) && (
                      <p className="learn-notice">
                        <strong>Your unsaved draft (not graded):</strong>{" "}
                        {Array.isArray(unsavedAtExpiry[q.id])
                          ? (unsavedAtExpiry[q.id] as string[]).join(", ")
                          : String(unsavedAtExpiry[q.id] ?? "Blank")}
                      </p>
                    )}
                    <p>{q.explanation}</p>
                    <button
                      className="button"
                      onClick={async () => {
                        try {
                          const date = new Date();
                          date.setDate(date.getDate() + 1);
                          await api(`/api/projects/${projectId}/tasks`, {
                            method: "POST",
                            body: json({
                              title: `Review: ${q.topic}`,
                              subject: q.subject,
                              date: date.toLocaleDateString("en-CA"),
                              time: "17:00",
                              duration: 20,
                              type: "revision",
                              status: "pending",
                              metadata: {
                                questionId: q.id,
                                sessionId: session.id,
                              },
                            }),
                          });
                          setReviewStatus(
                            "Revision added to tomorrow’s Calendar.",
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Schedule revision
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="learn-status" role="status">
          {reviewStatus}
        </p>
        {error && <ErrorBox message={error} />}
        <div className="learn-actions">
          <Link
            className="button button-primary"
            href={`/projects/${projectId}/study?tool=practice`}
          >
            Practise at your pace
            <ArrowRight size={16} />
          </Link>
          <Link
            className="button"
            href={`/projects/${projectId}/study?tool=test`}
          >
            Start another test
          </Link>
        </div>
      </section>
    );
  return (
    <section className="test-workspace">
      <div className="test-topbar">
        <Link
          href={`/projects/${projectId}/study`}
          className="button button-ghost"
        >
          <ArrowLeft size={17} />
          Study
        </Link>
        <div>
          <strong>{session.title}</strong>
          <span>
            Custom practice · {answered} of {session.questions.length} answered
          </span>
        </div>
        <div
          className={`test-timer ${seconds < 60 ? "urgent" : ""}`}
          role="timer"
          aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}
        >
          <Timer size={19} />
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(seconds % 60).padStart(2, "0")}
        </div>
      </div>
      {error && <ErrorBox message={error} retry={retrySaves} />}
      <div className="practice-layout">
        {active && (
          <div className="practice-question panel">
            <div className="learn-row">
              <div className="practice-tags">
                <span>{active.subject}</span>
                <span>{active.topic}</span>
                <span>{active.difficulty}</span>
              </div>
              <button
                className={`button button-ghost ${responses[active.id]?.flagged ? "is-blue" : ""}`}
                onClick={() =>
                  saveResponse(
                    active.id,
                    responses[active.id]?.answer ?? "",
                    !responses[active.id]?.flagged,
                  )
                }
              >
                <Flag size={17} />
                {responses[active.id]?.flagged
                  ? "Marked for review"
                  : "Mark for review"}
              </button>
            </div>
            <p className="learn-eyebrow">
              QUESTION {String(index + 1).padStart(2, "0")} OF{" "}
              {session.questions.length} · +4 / −1 / 0
            </p>
            <h2>{active.prompt}</h2>
            <AnswerInput
              question={active}
              value={responses[active.id]?.answer ?? ""}
              onChange={(v) => saveResponse(active.id, v)}
              disabled={busy || seconds <= 0}
            />
            <div className="test-question-actions">
              <button
                className="button button-ghost"
                onClick={() =>
                  saveResponse(active.id, active.type === "multiple" ? [] : "")
                }
              >
                Clear answer
              </button>
              <span
                role="status"
                className={failedSave.current ? "test-unsaved" : ""}
              >
                {saveStatus}
              </span>
            </div>
            <div className="test-navigation">
              <button
                className="button"
                onClick={() => setIndex((i) => i - 1)}
                disabled={!index}
              >
                <ChevronLeft size={17} />
                Previous
              </button>
              {index < session.questions.length - 1 ? (
                <button
                  className="button button-primary"
                  onClick={() => setIndex((i) => i + 1)}
                >
                  Save & next
                  <ChevronRight size={17} />
                </button>
              ) : (
                <button
                  className="button button-primary"
                  onClick={() => setConfirm(true)}
                  disabled={busy}
                >
                  Review & submit
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        )}
        <aside className="practice-sidebar panel">
          <h3>Your questions</h3>
          <div className="practice-question-map">
            {session.questions.map((q, i) => (
              <button
                key={q.id}
                className={`${index === i ? "active" : ""} ${hasAnswer(responses[q.id]?.answer) ? "answered" : ""} ${responses[q.id]?.flagged ? "flagged" : ""}`}
                onClick={() => setIndex(i)}
                aria-label={`Question ${i + 1}${hasAnswer(responses[q.id]?.answer) ? ", answered" : ", unanswered"}${responses[q.id]?.flagged ? ", marked for review" : ""}`}
              >
                {i + 1}
                {responses[q.id]?.flagged && <span />}
              </button>
            ))}
          </div>
          <div className="test-legend">
            <span>
              <i className="answered" />
              Answered
            </span>
            <span>
              <i className="flagged" />
              For review
            </span>
            <span>
              <i />
              Unanswered
            </span>
          </div>
          <p className="learn-fineprint">
            Your answers autosave to this project. The server enforces the
            deadline; refreshing does not add time.
          </p>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Submit test
            <ArrowRight size={17} />
          </button>
        </aside>
      </div>
      {confirm && (
        <Modal title="Ready to submit?" onClose={() => setConfirm(false)}>
          <div className="learn-form">
            <p>
              You have answered{" "}
              <strong>
                {answered} of {session.questions.length}
              </strong>{" "}
              questions.{" "}
              {session.questions.length - answered > 0
                ? `${session.questions.length - answered} unanswered questions will receive 0 points.`
                : "All questions have an answer."}
            </p>
            <p>
              {Object.values(responses).filter((r) => r.flagged).length}{" "}
              questions are marked for review. You can revisit every explanation
              after submitting.
            </p>
            {failedSave.current && (
              <ErrorBox message="Some answers have not saved. Close this dialog and retry the save before submitting." />
            )}
            <div className="learn-modal-actions">
              <button className="button" onClick={() => setConfirm(false)}>
                Keep working
              </button>
              <button
                className="button button-primary"
                disabled={busy || failedSave.current}
                onClick={submit}
              >
                {busy ? "Submitting…" : "Submit and see results"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
function BookOpenIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1m0-15c3-2 6-2 10-1v15c-4-1-7-1-10 1V5" />
    </svg>
  );
}
export default TestWorkspace;
