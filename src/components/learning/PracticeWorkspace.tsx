"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  FlaskConical,
  Lightbulb,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { api, json } from "../../lib/api";
import { Empty, ErrorBox, Loading, Modal } from "../ui";
import { parseQuestionImport } from "../../domain/question-import";
export type PublicQuestion = {
  id: string;
  subject: string;
  topic: string;
  type: "single" | "multiple" | "numerical" | "free";
  prompt: string;
  options?: string[];
  hint?: string;
  difficulty: string;
  unit?: string;
  bookmarked?: boolean;
  source?: string;
  reviewStatus?: string;
  version?: number;
  answer?: string | string[];
  explanation?: string;
};
export type Attempt = {
  id: string;
  questionId?: string;
  correct: boolean;
  status: string;
  score: number;
  explanation: string;
  expectedAnswer: string | string[];
  hintUsed?: boolean;
  revealed?: boolean;
};
export function AnswerInput({
  question,
  value,
  onChange,
  disabled = false,
}: {
  question: PublicQuestion;
  value: unknown;
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
}) {
  if (question.type === "single" || question.type === "multiple")
    return (
      <div className="practice-options">
        {(question.options ?? []).map((option, i) => {
          const selected = Array.isArray(value)
            ? value.includes(option)
            : value === option;
          return (
            <label
              className={`practice-option ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
              key={option}
            >
              <input
                type={question.type === "single" ? "radio" : "checkbox"}
                name={`answer-${question.id}`}
                value={option}
                checked={selected}
                disabled={disabled}
                onChange={() =>
                  onChange(
                    question.type === "single"
                      ? option
                      : selected
                        ? (Array.isArray(value) ? value : []).filter(
                            (x) => x !== option,
                          )
                        : [...(Array.isArray(value) ? value : []), option],
                  )
                }
              />
              <span className="practice-option-letter">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{option}</span>
              {selected && <Check size={17} />}
            </label>
          );
        })}
      </div>
    );
  if (question.type === "free")
    return (
      <textarea
        className="input practice-free"
        aria-label="Your written answer"
        placeholder="Write your reasoning. This answer uses a self-review rubric."
        rows={5}
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <div className="practice-numeric">
      <label htmlFor={`answer-${question.id}`}>Your answer</label>
      <div>
        <input
          className="input"
          id={`answer-${question.id}`}
          inputMode="decimal"
          value={
            typeof value === "string" || typeof value === "number" ? value : ""
          }
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={
            question.unit
              ? `Enter a value in ${question.unit}`
              : "Enter a numerical value"
          }
        />
        {question.unit && <span>{question.unit}</span>}
      </div>
      <small>
        Decimals and scientific notation are supported
        {question.unit ? "; compatible units are converted" : ""}.
      </small>
    </div>
  );
}
export function PracticeWorkspace({
  projectId,
  topic,
  questionId,
}: {
  projectId: string;
  topic?: string;
  questionId?: string;
}) {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState(
    topic === "Projectile motion" ? "Kinematics" : (topic ?? ""),
  );
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | string[]>("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [add, setAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [projectSubjects, setProjectSubjects] = useState<string[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [report, setReport] = useState(false);
  const [reportText, setReportText] = useState("");
  const [page, setPage] = useState(0);
  const [sessionSize, setSessionSize] = useState(10);
  const [onlySet, setOnlySet] = useState(false);
  const active = questions[index];
  useEffect(() => {
    api<{ project: { subjects: string[] } }>(`/api/projects/${projectId}`)
      .then((r) => setProjectSubjects(r.project.subjects))
      .catch(() => {});
  }, [projectId]);
  async function load(searchOverride?: string) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: "60",
        offset: String(page * 60),
      });
      if (subject) params.set("subject", subject);
      if (difficulty) params.set("difficulty", difficulty);
      if (filter) params.set("filter", filter);
      const query = searchOverride ?? search;
      if (query.trim()) params.set("q", query.trim());
      const r = await api<{ items: PublicQuestion[] }>(
        `/api/projects/${projectId}/questions?${params}`,
      );
      let items = onlySet ? r.items.slice(0, sessionSize) : r.items;
      if (questionId && !items.some((q) => q.id === questionId)) {
        const selected = await api<{ item: PublicQuestion }>(
          `/api/projects/${projectId}/questions/${questionId}`,
        );
        items = [selected.item, ...items];
      }
      setQuestions(items);
      setIndex(
        questionId
          ? Math.max(
              0,
              items.findIndex((q) => q.id === questionId),
            )
          : 0,
      );
      if (onlySet && r.items.length < sessionSize)
        setStatus(
          `This project has ${r.items.length} matching questions; your set includes all of them.`,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load questions.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [
    projectId,
    subject,
    difficulty,
    filter,
    page,
    onlySet,
    sessionSize,
    questionId,
  ]); // Search is submitted explicitly.
  useEffect(() => {
    setAnswer("");
    setAttempt(null);
    setHintUsed(false);
    setIdempotencyKey(crypto.randomUUID());
    setStartedAt(Date.now());
    setReport(false);
    setStatus("");
  }, [active?.id]);
  async function submit(reveal = false) {
    if (!active || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ item: Attempt }>(
        `/api/projects/${projectId}/attempts`,
        {
          method: "POST",
          body: json({
            questionId: active.id,
            answer: reveal ? "" : answer,
            hintUsed,
            revealed: reveal,
            elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
            idempotencyKey,
          }),
        },
      );
      setAttempt(r.item);
      setStatus(
        reveal
          ? "Answer revealed. This will not count as an unaided correct answer."
          : "Attempt saved to Progress.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your answer could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function bookmark() {
    if (!active) return;
    try {
      await api(`/api/projects/${projectId}/questions/${active.id}`, {
        method: "PATCH",
        body: json({ bookmarked: !active.bookmarked }),
      });
      setQuestions((qs) =>
        qs.map((q) =>
          q.id === active.id ? { ...q, bookmarked: !q.bookmarked } : q,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function schedule() {
    if (!active) return;
    setBusy(true);
    try {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      await api(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: json({
          title: `Review: ${active.topic}`,
          date: d.toLocaleDateString("en-CA"),
          time: "17:00",
          duration: 20,
          subject: active.subject,
          type: "revision",
          status: "pending",
          resourceId: null,
          metadata: { questionId: active.id, attemptId: attempt?.id },
        }),
      });
      setStatus(
        "Revision scheduled for tomorrow at 17:00. Open Calendar to reschedule.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reportIssue() {
    if (!active || !reportText.trim()) return;
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/resources`, {
        method: "POST",
        body: json({
          title: `Question review: ${active.topic}`,
          type: "note",
          subject: active.subject,
          content: `Question ${active.id}, version ${active.version ?? 1}\n\n${active.prompt}\n\nIssue reported by student:\n${reportText}`,
          description:
            "Student-reported issue; not yet independently reviewed.",
        }),
      });
      setReport(false);
      setReportText("");
      setStatus("Issue saved as a review note in your Library.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="practice-workspace">
      <div className="learn-breadcrumb">
        <Link href={`/projects/${projectId}/study`}>
          <ArrowLeft size={16} />
          Study
        </Link>
        <span>/</span>
        <span>Practise</span>
        <span className="learn-version">ORIGINAL QUESTION BANK</span>
      </div>
      <div className="lab-heading">
        <div>
          <p className="learn-eyebrow">UNDERSTANDING, PUT INTO PRACTICE</p>
          <h1>A little better, every question.</h1>
          <p>Work at your pace. Keep the learning, including the mistakes.</p>
        </div>
        <div className="learn-actions">
          <button className="button" onClick={() => setImporting(true)}>
            <Upload size={17} />
            Import
          </button>
          <button
            className="button button-primary"
            onClick={() => setAdd(true)}
          >
            <Plus size={17} />
            Add question
          </button>
        </div>
      </div>
      <div className="practice-filterbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            void load();
          }}
          className="learn-search"
        >
          <Search size={18} />
          <input
            aria-label="Search questions"
            placeholder="Find a topic or question…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="icon-button"
              aria-label="Clear question search"
              type="button"
              onClick={() => {
                setSearch("");
                void load("");
              }}
            >
              <X size={15} />
            </button>
          )}
          <button className="button button-ghost" type="submit">
            Search
          </button>
        </form>
        <select
          aria-label="Question subject"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All subjects</option>
          {projectSubjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Question difficulty"
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Any difficulty</option>
          <option>Easy</option>
          <option>Medium</option>
          <option>Hard</option>
        </select>
        <select
          aria-label="Question status"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All questions</option>
          <option value="unattempted">Unattempted</option>
          <option value="incorrect">Previously incorrect</option>
          <option value="bookmarked">Bookmarked</option>
        </select>
      </div>
      {error && <ErrorBox message={error} retry={load} />}
      <div className="learn-status" role="status">
        {status}
      </div>
      {loading ? (
        <Loading label="Finding your practice questions…" />
      ) : !active ? (
        <Empty
          title="A clean page, a fresh start."
          detail="No questions match these filters. Change the filters or add original material to this project."
        >
          <button
            className="button"
            onClick={() => {
              setSubject("");
              setDifficulty("");
              setFilter("");
              setSearch("");
              setPage(0);
              setOnlySet(false);
              void api<{ items: PublicQuestion[] }>(
                `/api/projects/${projectId}/questions?limit=60`,
              ).then((r) => setQuestions(r.items));
            }}
          >
            Show all questions
          </button>
        </Empty>
      ) : (
        <div className="practice-layout">
          <div className="practice-question panel">
            <div className="learn-row">
              <div className="practice-tags">
                <span>{active.subject}</span>
                <span>{active.topic}</span>
                <span>{active.difficulty}</span>
              </div>
              <button
                className={`icon-button ${active.bookmarked ? "is-blue" : ""}`}
                aria-label={
                  active.bookmarked
                    ? "Remove question bookmark"
                    : "Bookmark question"
                }
                onClick={bookmark}
              >
                <Bookmark
                  size={20}
                  fill={active.bookmarked ? "currentColor" : "none"}
                />
              </button>
            </div>
            <p className="learn-eyebrow">
              QUESTION {String(index + 1).padStart(2, "0")} OF{" "}
              {questions.length} ·{" "}
              {active.type === "multiple"
                ? "SELECT ALL THAT APPLY"
                : active.type === "single"
                  ? "SINGLE CHOICE"
                  : active.type === "free"
                    ? "SELF-REVIEW"
                    : "NUMERICAL ANSWER"}
            </p>
            <h2>{active.prompt}</h2>
            <AnswerInput
              question={active}
              value={answer}
              onChange={setAnswer}
              disabled={!!attempt}
            />
            {hintUsed && (
              <div className="practice-hint">
                <Lightbulb size={19} />
                <div>
                  <strong>A small nudge</strong>
                  <p>
                    {active.hint ||
                      "Identify the known values, the unknown, and the principle that connects them."}
                  </p>
                  <small>This attempt is marked as assisted.</small>
                </div>
              </div>
            )}
            {!attempt ? (
              <div className="practice-footer">
                <button
                  className="button button-ghost"
                  onClick={() => setHintUsed(true)}
                  disabled={hintUsed}
                >
                  <Lightbulb size={17} />
                  Get a hint
                </button>
                <button
                  className="button button-ghost"
                  onClick={() => submit(true)}
                  disabled={busy}
                >
                  Reveal answer
                </button>
                <button
                  className="button button-primary"
                  onClick={() => submit(false)}
                  disabled={
                    busy ||
                    (!Array.isArray(answer) && !answer.trim()) ||
                    (Array.isArray(answer) && !answer.length)
                  }
                >
                  {busy ? "Saving…" : "Check answer"}
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <div
                className={`practice-result ${attempt.correct ? "correct" : "review"}`}
              >
                <div className="learn-row">
                  <h3>
                    {attempt.status === "needs_review"
                      ? "Ready for self-review"
                      : attempt.revealed
                        ? "Here’s the working"
                        : attempt.correct
                          ? "That’s right. Nicely reasoned."
                          : attempt.status === "malformed"
                            ? "Check the format of your answer."
                            : "A useful mistake to learn from."}
                  </h3>
                  {attempt.correct ? (
                    <CheckCircle2 size={22} />
                  ) : (
                    <BookOpen size={22} />
                  )}
                </div>
                <p>
                  <strong>
                    {attempt.status === "needs_review"
                      ? "Review rubric"
                      : "Expected answer"}
                    :
                  </strong>{" "}
                  {Array.isArray(attempt.expectedAnswer)
                    ? attempt.expectedAnswer.join(", ")
                    : attempt.expectedAnswer}
                  {active.unit && ` ${active.unit}`}
                </p>
                <p>{attempt.explanation}</p>
                <div className="learn-actions">
                  <button
                    className="button"
                    onClick={() => {
                      setAttempt(null);
                      setAnswer("");
                      setHintUsed(false);
                      setIdempotencyKey(crypto.randomUUID());
                      setStartedAt(Date.now());
                      setStatus(
                        "Retry starts a new attempt; your previous attempt is preserved.",
                      );
                    }}
                  >
                    <RefreshCw size={15} />
                    Try again
                  </button>
                  <button className="button" disabled={busy} onClick={schedule}>
                    <CalendarPlus size={16} />
                    Schedule revision
                  </button>
                  <Link
                    href={`/projects/${projectId}/study?tool=visualise`}
                    className="button button-ghost"
                  >
                    <FlaskConical size={16} />
                    Explore a model
                  </Link>
                </div>
              </div>
            )}
            <div className="practice-provenance">
              <span>
                {active.source || "Student original"} · v{active.version ?? 1}
              </span>
              <button onClick={() => setReport(!report)}>
                <Flag size={14} />
                Report an issue
              </button>
            </div>
            {report && (
              <div className="practice-report">
                <label htmlFor="question-report">
                  What should be reviewed?
                </label>
                <textarea
                  id="question-report"
                  className="input"
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  rows={3}
                />
                <button
                  className="button"
                  onClick={reportIssue}
                  disabled={!reportText.trim() || busy}
                >
                  Save review note
                </button>
              </div>
            )}
          </div>
          <aside className="practice-sidebar panel">
            <h3>Your practice space</h3>
            <p className="learn-muted">No timer. Just you and the next step.</p>
            <div className="practice-question-map">
              {questions.map((q, i) => (
                <button
                  aria-label={`Go to question ${i + 1}`}
                  aria-current={index === i ? "step" : undefined}
                  className={index === i ? "active" : ""}
                  key={q.id}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="practice-nav">
              <button
                className="button"
                disabled={index === 0}
                onClick={() => setIndex((i) => i - 1)}
              >
                <ChevronLeft size={17} />
                Previous
              </button>
              <button
                className="button"
                disabled={index === questions.length - 1}
                onClick={() => setIndex((i) => i + 1)}
              >
                Next
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="practice-set">
              <label>
                Questions in a practice set
                <select
                  value={sessionSize}
                  onChange={(e) => setSessionSize(Number(e.target.value))}
                >
                  <option value={5}>5 questions</option>
                  <option value={10}>10 questions</option>
                  <option value={20}>20 questions</option>
                </select>
              </label>
              <button className="button" onClick={() => setOnlySet(!onlySet)}>
                {onlySet
                  ? "Browse full question bank"
                  : "Use this practice set"}
              </button>
            </div>
            <Link
              className="practice-timed-link"
              href={`/projects/${projectId}/study?tool=test`}
            >
              Ready for a timed session?
              <ArrowRight size={17} />
            </Link>
            <p className="learn-fineprint">
              Custom practice marking: +4 correct, −1 incorrect, 0 unanswered.
              Multiple-choice answers require an exact match. Assisted attempts
              are tracked separately.
            </p>
            {(page > 0 || questions.length === 60) && (
              <div className="learn-actions">
                <button
                  className="button"
                  disabled={!page}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous page
                </button>
                <button
                  className="button"
                  disabled={questions.length < 60}
                  onClick={() => setPage((p) => p + 1)}
                >
                  More questions
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
      {add && (
        <AddQuestion
          projectId={projectId}
          subjects={projectSubjects}
          onClose={() => setAdd(false)}
          onSaved={() => {
            setAdd(false);
            void load();
            setStatus("Your question is saved to this project.");
          }}
        />
      )}
      {importing && (
        <ImportQuestions
          projectId={projectId}
          onClose={() => setImporting(false)}
          onSaved={() => {
            setImporting(false);
            void load();
            setStatus("Questions imported into this project.");
          }}
        />
      )}
    </section>
  );
}
function AddQuestion({
  projectId,
  subjects,
  onClose,
  onSaved,
}: {
  projectId: string;
  subjects: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<PublicQuestion["type"]>("single");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Add an original question" onClose={onClose} wide>
      <form
        className="learn-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const options = String(f.get("options") ?? "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean);
            const raw = String(f.get("answer") ?? "");
            if (
              (type === "single" || type === "multiple") &&
              options.length < 2
            )
              throw new Error("Enter at least two answer options.");
            const answer =
              type === "multiple"
                ? raw
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean)
                : raw.trim();
            if (type === "single" && !options.includes(String(answer)))
              throw new Error(
                "The answer must exactly match one of the options.",
              );
            if (
              type === "multiple" &&
              !(answer as string[]).every((a) => options.includes(a))
            )
              throw new Error(
                "Every correct answer must exactly match an option.",
              );
            await api(`/api/projects/${projectId}/questions`, {
              method: "POST",
              body: json({
                prompt: f.get("prompt"),
                subject: f.get("subject"),
                topic: f.get("topic"),
                type,
                options,
                answer,
                explanation: f.get("explanation"),
                hint: f.get("hint"),
                difficulty: f.get("difficulty"),
                unit:
                  type === "numerical"
                    ? String(f.get("unit") ?? "")
                    : undefined,
                tolerance:
                  type === "numerical"
                    ? Number(f.get("tolerance") || 0.001)
                    : undefined,
                source: "Student original",
                reviewStatus: "student-reviewed",
              }),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="learn-muted">
          Enter material you created or have permission to use. Check the answer
          key before saving.
        </p>
        <div className="learn-form-columns">
          <label>
            Subject
            <select name="subject" required defaultValue={subjects[0]}>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Topic
            <input
              className="input"
              name="topic"
              required
              maxLength={200}
              placeholder="e.g. Kinematics"
            />
          </label>
        </div>
        <label>
          Question
          <textarea
            className="input"
            name="prompt"
            rows={4}
            required
            maxLength={12000}
          />
        </label>
        <div className="learn-form-columns">
          <label>
            Answer format
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as PublicQuestion["type"])
              }
            >
              <option value="single">Single choice</option>
              <option value="multiple">Multiple choice</option>
              <option value="numerical">Numerical</option>
              <option value="free">Free response / self-review</option>
            </select>
          </label>
          <label>
            Difficulty
            <select name="difficulty">
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </label>
        </div>
        {["single", "multiple"].includes(type) && (
          <label>
            Options · one per line
            <textarea
              className="input"
              name="options"
              rows={4}
              required
              placeholder={
                "First option\nSecond option\nThird option\nFourth option"
              }
            />
          </label>
        )}
        <label>
          {type === "free"
            ? "Self-review rubric"
            : type === "multiple"
              ? "Correct options · exact text, one per line"
              : "Correct answer"}
          <textarea
            className="input"
            name="answer"
            required
            rows={type === "free" ? 3 : 2}
          />
        </label>
        {type === "numerical" && (
          <div className="learn-form-columns">
            <label>
              Unit (optional)
              <input
                className="input"
                name="unit"
                placeholder="m, s, kg, mol…"
              />
            </label>
            <label>
              Absolute tolerance
              <input
                className="input"
                name="tolerance"
                type="number"
                min="0"
                step="any"
                defaultValue="0.001"
              />
            </label>
          </div>
        )}
        <label>
          Explanation
          <textarea className="input" name="explanation" required rows={3} />
        </label>
        <label>
          Hint (optional)
          <input className="input" name="hint" />
        </label>
        {error && <ErrorBox message={error} />}
        <div className="learn-modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save checked question"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportQuestions({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<unknown[]>([]);
  const [report, setReport] = useState<
    { index: number; valid: boolean; errors: string[] }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function preview(file: File) {
    setBusy(true);
    setError("");
    setItems([]);
    setReport([]);
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Keep question imports below 2 MB.");
      const data = parseQuestionImport(await file.text(), file.name);
      const r = await api<{
        report: { index: number; valid: boolean; errors: string[] }[];
        valid: boolean;
      }>(`/api/projects/${projectId}/questions/import`, {
        method: "POST",
        body: json({ items: data, preview: true }),
      });
      setItems(data);
      setReport(r.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Import your questions" onClose={onClose} wide>
      <div className="learn-form">
        <p>
          Upload a JSON array or CSV file with{" "}
          <code>subject, topic, type, prompt, answer, explanation</code>. Types:
          single, multiple, numerical, free. CSV options and multiple answers
          use <code>|</code> separators.
        </p>
        <label className="practice-upload">
          <Upload size={24} />
          <strong>Choose a JSON or CSV file</strong>
          <input
            type="file"
            accept=".json,.csv"
            onChange={(e) => {
              if (e.target.files?.[0]) void preview(e.target.files[0]);
            }}
          />
        </label>
        {busy && <p role="status">Checking question structure…</p>}
        {error && <ErrorBox message={error} />}{" "}
        {!!report.length && (
          <>
            <h3>
              {report.filter((r) => r.valid).length} of {report.length}{" "}
              questions are valid
            </h3>
            <div className="practice-import-preview">
              {report.map((r) => (
                <div key={r.index}>
                  <strong>Question {r.index + 1}</strong>
                  <span>
                    {r.valid ? "Ready to import" : r.errors.join("; ")}
                  </span>
                </div>
              ))}
            </div>
            <p className="learn-fineprint">
              Review the answer keys in your source file. Importing creates new
              questions; repeated imports create separate copies.
            </p>
          </>
        )}
        <div className="learn-modal-actions">
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={busy || !report.length || report.some((r) => !r.valid)}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/projects/${projectId}/questions/import`, {
                  method: "POST",
                  body: json({ items, preview: false }),
                });
                onSaved();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Import {items.length || ""} questions
          </button>
        </div>
      </div>
    </Modal>
  );
}
export default PracticeWorkspace;
