"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  GitBranch,
  GraduationCap,
  PenLine,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { api, json } from "../../lib/api";
import { Empty, ErrorBox, Loading, Modal } from "../ui";
import {
  assessmentSummary,
  type Assessment,
  type CurriculumTopic,
  type TemplateDefinition,
  type VersionTopic,
} from "../../domain/curriculum";
type CurriculumData = {
  topics: CurriculumTopic[];
  template: {
    templateId: string;
    name: string;
    versionLabel: string;
    revision: number;
    coverageStatus: string;
  };
  templates: TemplateDefinition[];
  assessments: Assessment[];
  summary: {
    totalTopics: number;
    coveredTopics: number;
    inProgressTopics: number;
    coveragePercent: number;
    courses: ({ course: string } & ReturnType<typeof assessmentSummary>)[];
  };
};
export default function CurriculumPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<CurriculumData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("topics");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState<CurriculumTopic | true | null>(null);
  const [assessment, setAssessment] = useState<Assessment | true | null>(null);
  const [version, setVersion] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [historical, setHistorical] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await api<CurriculumData>(`/api/projects/${projectId}/curriculum`),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function update(t: CurriculumTopic, changes: Partial<CurriculumTopic>) {
    setBusy(t.id);
    setError("");
    try {
      const r = await api<{ item: CurriculumTopic }>(
        `/api/projects/${projectId}/curriculum`,
        {
          method: "PATCH",
          body: json({ ...t, ...changes, action: "update-topic" }),
        },
      );
      setData((d) =>
        d
          ? {
              ...d,
              topics: d.topics.map((topic) =>
                topic.id === t.id ? r.item : topic,
              ),
              template: { ...d.template, revision: d.template.revision + 1 },
              summary: {
                ...d.summary,
                coveredTopics:
                  d.summary.coveredTopics +
                  (r.item.coverage === "covered" ? 1 : 0) -
                  (t.coverage === "covered" ? 1 : 0),
                coveragePercent: Math.round(
                  ((d.summary.coveredTopics +
                    (r.item.coverage === "covered" ? 1 : 0) -
                    (t.coverage === "covered" ? 1 : 0)) /
                    Math.max(1, d.summary.totalTopics)) *
                    100,
                ),
              },
            }
          : d,
      );
      setStatus(
        "Topic updated. Coverage is separate from question performance.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (loading && !data) return <Loading label="Opening your syllabus…" />;
  if (!data)
    return (
      <ErrorBox
        message={error || "Could not load this syllabus."}
        retry={load}
      />
    );
  const subjects = [...new Set(data.topics.map((t) => t.subject))];
  const topics = data.topics.filter(
    (t) =>
      (historical ? !t.active : t.active) &&
      (!subject || t.subject === subject),
  );
  return (
    <div className="curriculum-panel">
      <div className="curriculum-heading">
        <div>
          <p className="learn-eyebrow">YOUR MAP, YOUR PACE</p>
          <h2>See what you’ve covered.</h2>
          <p>
            Keep syllabus coverage, personal confidence and assessed performance
            distinct.
          </p>
        </div>
        <button className="button" onClick={() => setVersion(true)}>
          <GitBranch size={16} />
          Review syllabus version
        </button>
      </div>
      <div className="curriculum-template">
        <BookOpen size={19} />
        <div>
          <strong>{data.template.name}</strong>
          <span>
            {data.template.versionLabel} · {data.template.coverageStatus}
          </span>
        </div>
        <span>
          {data.summary.coveredTopics} / {data.summary.totalTopics} topics
          covered
        </span>
      </div>
      <div className="curriculum-progress-track">
        <div style={{ width: `${data.summary.coveragePercent}%` }} />
      </div>
      <div className="curriculum-tabs">
        <div className="learn-tabs" role="tablist" aria-label="Curriculum view">
          <button
            role="tab"
            aria-selected={view === "topics"}
            className={view === "topics" ? "active" : ""}
            onClick={() => setView("topics")}
          >
            Topics & coverage
          </button>
          <button
            role="tab"
            aria-selected={view === "assessments"}
            className={view === "assessments" ? "active" : ""}
            onClick={() => setView("assessments")}
          >
            Course assessments
          </button>
        </div>
        <button
          className="button button-primary"
          onClick={() =>
            view === "topics" ? setTopic(true) : setAssessment(true)
          }
        >
          <Plus size={16} />
          {view === "topics" ? "Add topic" : "Add assessment"}
        </button>
      </div>
      {error && <ErrorBox message={error} retry={load} />}
      <p className="learn-status" role="status">
        {status}
      </p>
      {view === "topics" ? (
        <>
          <div className="curriculum-filters">
            <select
              aria-label="Syllabus subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={historical}
                onChange={(e) => setHistorical(e.target.checked)}
              />
              Historical topics
            </label>
            <span>Coverage is marked by you. It does not imply mastery.</span>
          </div>
          {topics.length ? (
            <div className="curriculum-topics">
              {topics.map((t) => (
                <div className="curriculum-topic" key={t.id}>
                  <div>
                    <span>{t.subject}</span>
                    <strong>{t.title}</strong>
                    {t.prerequisiteIds.length > 0 && (
                      <small>
                        After:{" "}
                        {t.prerequisiteIds
                          .map(
                            (id) =>
                              data.topics.find((x) => x.id === id)?.title ??
                              "Historical topic",
                          )
                          .join(", ")}
                      </small>
                    )}
                  </div>
                  <label>
                    Coverage
                    <select
                      aria-label={`Coverage for ${t.title}`}
                      value={t.coverage}
                      disabled={busy === t.id || !t.active}
                      onChange={(e) =>
                        update(t, {
                          coverage: e.target
                            .value as CurriculumTopic["coverage"],
                        })
                      }
                    >
                      <option value="not-started">Not started</option>
                      <option value="in-progress">In progress</option>
                      <option value="covered">Covered</option>
                    </select>
                  </label>
                  <label>
                    My confidence
                    <select
                      aria-label={`Confidence for ${t.title}`}
                      value={t.confidence}
                      disabled={busy === t.id || !t.active}
                      onChange={(e) =>
                        update(t, {
                          confidence: e.target
                            .value as CurriculumTopic["confidence"],
                        })
                      }
                    >
                      <option value="unset">Not rated</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <div className="curriculum-topic-actions">
                    <Link
                      className="icon-button"
                      aria-label={`Practise ${t.title}`}
                      href={`/projects/${projectId}/study?tool=practice&topic=${encodeURIComponent(t.title)}`}
                    >
                      <ArrowRight size={17} />
                    </Link>
                    {t.active && (
                      <button
                        className="icon-button"
                        aria-label={`Edit ${t.title}`}
                        onClick={() => setTopic(t)}
                      >
                        <PenLine size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                historical
                  ? "No historical topics yet."
                  : "Make this map your own."
              }
              detail={
                historical
                  ? "Topics retained when a syllabus changes appear here."
                  : "Add a subject and topic to start tracking explicit coverage."
              }
            />
          )}
        </>
      ) : (
        <>
          <div className="curriculum-assessment-notice">
            <GraduationCap size={19} />
            <p>
              Enter your course’s actual assessment weights and marks. Each
              course can allocate up to 100%. Unmarked work remains ungraded.
            </p>
          </div>
          {data.summary.courses.map((summary) => (
            <div className="curriculum-course" key={summary.course}>
              <h3>{summary.course || "General course"}</h3>
              <div className="curriculum-grade-summary">
                <div>
                  <strong>
                    {summary.earnedWeightedPoints.toFixed(1)}
                    <small> / 100</small>
                  </strong>
                  <span>Earned weighted points</span>
                </div>
                <div>
                  <strong>
                    {summary.performanceOnCompleted === null
                      ? "—"
                      : summary.performanceOnCompleted.toFixed(1) + "%"}
                  </strong>
                  <span>Performance on graded work</span>
                </div>
                <div>
                  <strong>{summary.remainingWeight.toFixed(1)}%</strong>
                  <span>Weight not yet graded</span>
                </div>
              </div>
              <p className="learn-fineprint">
                {summary.completedWeight}% of the course is graded.{" "}
                {summary.unallocatedWeight}% has not been assigned to an
                assessment. No future marks are predicted.
              </p>
              <div className="curriculum-assessments">
                {data.assessments
                  .filter((a) => a.course === summary.course)
                  .map((a) => (
                    <div key={a.id}>
                      <strong>{a.title}</strong>
                      <span>{a.weight}% weight</span>
                      <span>
                        {a.mark === null
                          ? "Not graded"
                          : `${a.mark} / ${a.maxMark}`}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Edit assessment ${a.title}`}
                        onClick={() => setAssessment(a)}
                      >
                        <PenLine size={16} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {!data.assessments.length && (
            <Empty
              title="Give your course a clear picture."
              detail="Add assignments, quizzes, labs and exams with their published weights. Enter marks only when they are known."
            >
              <button className="button" onClick={() => setAssessment(true)}>
                Add your first assessment
                <Plus size={16} />
              </button>
            </Empty>
          )}
        </>
      )}
      {topic && (
        <TopicEditor
          projectId={projectId}
          topic={topic === true ? undefined : topic}
          allTopics={data.topics}
          subjects={subjects}
          onClose={() => setTopic(null)}
          onSaved={() => {
            setTopic(null);
            void load();
            setStatus("Your topic map is saved.");
          }}
        />
      )}
      {assessment && (
        <AssessmentEditor
          projectId={projectId}
          assessment={assessment === true ? undefined : assessment}
          subjects={subjects}
          onClose={() => setAssessment(null)}
          onSaved={() => {
            setAssessment(null);
            void load();
            setStatus(
              "Assessment saved. Calculations use your entered marks only.",
            );
          }}
        />
      )}
      {version && (
        <VersionEditor
          projectId={projectId}
          data={data}
          onClose={() => setVersion(false)}
          onSaved={() => {
            setVersion(false);
            void load();
            setStatus(
              "Syllabus version applied. Historical attempts are preserved.",
            );
          }}
        />
      )}
    </div>
  );
}
function TopicEditor({
  projectId,
  topic,
  allTopics,
  subjects,
  onClose,
  onSaved,
}: {
  projectId: string;
  topic?: CurriculumTopic;
  allTopics: CurriculumTopic[];
  subjects: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prereqs, setPrereqs] = useState(topic?.prerequisiteIds ?? []);
  return (
    <Modal title={topic ? "Edit topic" : "Add a topic"} onClose={onClose}>
      <form
        className="learn-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await api(`/api/projects/${projectId}/curriculum`, {
              method: "PATCH",
              body: json({
                action: topic ? "update-topic" : "add-topic",
                id: topic?.id,
                revision: topic?.revision,
                title: f.get("title"),
                subject: f.get("subject"),
                coverage: topic?.coverage ?? "not-started",
                confidence: topic?.confidence ?? "unset",
                prerequisiteIds: prereqs,
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
        <label>
          Topic name
          <input
            className="input"
            name="title"
            required
            maxLength={200}
            defaultValue={topic?.title}
          />
        </label>
        <label>
          Subject or course
          <input
            className="input"
            name="subject"
            list="curriculum-subjects"
            required
            maxLength={200}
            defaultValue={topic?.subject ?? subjects[0]}
          />
          <datalist id="curriculum-subjects">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div className="curriculum-prereq-picker">
          <label>Builds on these topics</label>
          <p className="learn-fineprint">
            Select topics that should come first. Circular prerequisites are
            rejected.
          </p>
          {allTopics
            .filter((t) => t.active && t.id !== topic?.id)
            .map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={prereqs.includes(t.id)}
                  onChange={(e) =>
                    setPrereqs((p) =>
                      e.target.checked
                        ? [...p, t.id]
                        : p.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.title}
                <small>{t.subject}</small>
              </label>
            ))}
        </div>
        {error && <ErrorBox message={error} />}
        <div className="learn-modal-actions">
          {topic && (
            <button
              type="button"
              className="button button-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/projects/${projectId}/curriculum`, {
                    method: "PATCH",
                    body: json({
                      action: "archive-topic",
                      id: topic.id,
                      revision: topic.revision,
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
              Retain as historical
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save topic"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function AssessmentEditor({
  projectId,
  assessment,
  subjects,
  onClose,
  onSaved,
}: {
  projectId: string;
  assessment?: Assessment;
  subjects: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Modal
      title={assessment ? "Edit course assessment" : "Add course assessment"}
      onClose={onClose}
    >
      <form
        className="learn-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await api(`/api/projects/${projectId}/assessments`, {
              method: "PATCH",
              body: json({
                action: "save",
                id: assessment?.id,
                revision: assessment?.revision,
                title: f.get("title"),
                course: f.get("course"),
                weight: Number(f.get("weight")),
                maxMark: Number(f.get("maxMark")),
                mark: f.get("mark") === "" ? null : Number(f.get("mark")),
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
        <label>
          Assessment title
          <input
            className="input"
            name="title"
            required
            maxLength={200}
            defaultValue={assessment?.title}
            placeholder="e.g. Mechanics mid-semester exam"
          />
        </label>
        <label>
          Course
          <input
            className="input"
            name="course"
            list="assessment-courses"
            required
            defaultValue={assessment?.course ?? subjects[0]}
          />
          <datalist id="assessment-courses">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div className="learn-form-columns">
          <label>
            Course weight (%)
            <input
              className="input"
              name="weight"
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              required
              defaultValue={assessment?.weight}
            />
          </label>
          <label>
            Maximum mark
            <input
              className="input"
              name="maxMark"
              type="number"
              step="any"
              min="0.01"
              required
              defaultValue={assessment?.maxMark ?? 100}
            />
          </label>
        </div>
        <label>
          Earned mark · leave blank until graded
          <input
            className="input"
            name="mark"
            type="number"
            min="0"
            step="any"
            defaultValue={assessment?.mark ?? ""}
            placeholder="Not graded"
          />
        </label>
        <p className="learn-fineprint">
          Weighted points = weight × earned mark ÷ maximum mark. Each course’s
          assessment weights must total no more than 100%.
        </p>
        {error && <ErrorBox message={error} />}
        <div className="learn-modal-actions">
          {assessment && (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setConfirmDelete(true)}
            >
              Remove
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save assessment"}
          </button>
        </div>
        {confirmDelete && assessment && (
          <div className="learn-notice">
            <p>
              Remove “{assessment.title}” and its entered mark from this course?
            </p>
            <div className="learn-actions">
              <button
                type="button"
                className="button"
                onClick={() => setConfirmDelete(false)}
              >
                Keep assessment
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/api/projects/${projectId}/assessments`, {
                      method: "PATCH",
                      body: json({
                        action: "delete",
                        id: assessment.id,
                        revision: assessment.revision,
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
                Confirm removal
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
function VersionEditor({
  projectId,
  data,
  onClose,
  onSaved,
}: {
  projectId: string;
  data: CurriculumData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const active = data.topics.filter((t) => t.active);
  const [topics, setTopics] = useState<VersionTopic[]>(
    active.map(({ code, title, subject }) => ({ code, title, subject })),
  );
  const [mapping, setMapping] = useState<Record<string, string | null>>(
    Object.fromEntries(active.map((t) => [t.id, t.code])),
  );
  const [versionLabel, setVersionLabel] = useState("My syllabus v2");
  const [templateId, setTemplateId] = useState(data.template.templateId);
  const [preview, setPreview] = useState<{
    mapped: number;
    added: number;
    historical: string[];
    preservedAttemptCount: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function changeTopic(i: number, key: "title" | "subject", value: string) {
    setTopics((ts) =>
      ts.map((t, index) => (index === i ? { ...t, [key]: value } : t)),
    );
    setPreview(null);
  }
  async function submit(apply: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{
        preview: {
          mapped: number;
          added: number;
          historical: string[];
          preservedAttemptCount: number;
        };
      }>(`/api/projects/${projectId}/curriculum`, {
        method: "PATCH",
        body: json({
          action: apply ? "apply-version" : "preview-version",
          revision: data.template.revision,
          templateId,
          versionLabel,
          topics,
          mapping,
        }),
      });
      if (apply) onSaved();
      else setPreview(r.preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Review a new syllabus version" onClose={onClose} wide>
      <div className="learn-form">
        <p>
          Adjust your topic map and explicitly map existing topics. Previous
          question attempts and source history stay intact.
        </p>
        <div className="learn-form-columns">
          <label>
            Version name
            <input
              className="input"
              value={versionLabel}
              onChange={(e) => {
                setVersionLabel(e.target.value);
                setPreview(null);
              }}
              maxLength={100}
            />
          </label>
          <label>
            Project template
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setPreview(null);
              }}
            >
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="learn-fineprint">
          {data.templates.find((t) => t.id === templateId)?.coverageStatus}
        </p>
        <div className="curriculum-version-topics">
          <h3>Proposed topics</h3>
          {topics.map((t, i) => (
            <div key={t.code}>
              <input
                className="input"
                aria-label={`Proposed topic ${i + 1}`}
                value={t.title}
                onChange={(e) => changeTopic(i, "title", e.target.value)}
              />
              <input
                className="input"
                aria-label={`Subject for proposed topic ${i + 1}`}
                value={t.subject}
                onChange={(e) => changeTopic(i, "subject", e.target.value)}
              />
              <button
                className="icon-button"
                aria-label={`Remove proposed topic ${t.title}`}
                onClick={() => {
                  setTopics((ts) => ts.filter((x) => x.code !== t.code));
                  setMapping((m) =>
                    Object.fromEntries(
                      Object.entries(m).map(([id, code]) => [
                        id,
                        code === t.code ? null : code,
                      ]),
                    ),
                  );
                  setPreview(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            className="button"
            onClick={() => {
              setTopics((ts) => [
                ...ts,
                {
                  code: `new-${crypto.randomUUID()}`,
                  title: "New topic",
                  subject: topics[0]?.subject ?? "Custom",
                },
              ]);
              setPreview(null);
            }}
          >
            <Plus size={16} />
            Add proposed topic
          </button>
        </div>
        <div className="curriculum-version-mapping">
          <h3>Where should current topics go?</h3>
          {active.map((t) => (
            <label key={t.id}>
              <span>{t.title}</span>
              <select
                aria-label={`Map ${t.title}`}
                value={mapping[t.id] ?? ""}
                onChange={(e) => {
                  setMapping((m) => ({ ...m, [t.id]: e.target.value || null }));
                  setPreview(null);
                }}
              >
                <option value="">Retain as historical</option>
                {topics.map((target) => (
                  <option key={target.code} value={target.code}>
                    {target.title} · {target.subject}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {error && <ErrorBox message={error} />}{" "}
        {preview && (
          <div className="learn-notice">
            <strong>Ready for your review</strong>
            <p>
              {preview.mapped} topics mapped · {preview.added} topics added ·{" "}
              {preview.historical.length} retained as historical.
            </p>
            <p>
              {preview.preservedAttemptCount} existing question attempts will be
              preserved. Coverage and confidence follow explicitly mapped
              topics; new topics start unrated.
            </p>
            {preview.historical.length > 0 && (
              <p>Historical topics: {preview.historical.join(", ")}.</p>
            )}
          </div>
        )}
        <div className="learn-modal-actions">
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button"
            onClick={() => submit(false)}
            disabled={busy || !topics.length || !versionLabel.trim()}
          >
            <RefreshCw size={16} />
            Preview changes
          </button>
          <button
            className="button button-primary"
            onClick={() => submit(true)}
            disabled={busy || !preview}
          >
            {busy ? "Saving…" : "Apply reviewed version"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
