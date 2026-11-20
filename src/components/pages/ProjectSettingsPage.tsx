"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Save,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import {
  contextFromProject,
  emptyProjectContext,
  normalizeSubjects,
  parseSyllabusText,
  type ProjectContext,
} from "@/domain/project-context";
import { ProjectContextFields, SyllabusOutline } from "../ProjectContextFields";
import {
  ErrorMessage,
  Loading,
  Modal,
  PageHeading,
  json,
  safeError,
  useRemote,
} from "./shared";
const toolOptions = [
  ["ask", "Ask & explain", "Talk through a concept and follow your curiosity."],
  ["solve", "Solve a question", "Work through a problem, one step at a time."],
  [
    "visualise",
    "Visualise",
    "Explore concepts with interactive scientific models.",
  ],
  ["practice", "Practise", "Check your understanding with original questions."],
  ["test", "Take a test", "Timed custom practice with a saved review."],
  ["revise", "Revise & flashcards", "Build recall through honest self-review."],
  ["notes", "Make notes", "Save and organise your understanding."],
  ["plan", "Make a study plan", "Find realistic space in your calendar."],
  ["lessons", "Find lessons", "Connect ideas to your saved learning videos."],
  [
    "progress",
    "Analyse progress",
    "Choose a useful next step from your activity.",
  ],
  ["sources", "Search project sources", "Find passages in your own library."],
  [
    "updates",
    "Check exam updates",
    "Keep official source links close at hand.",
  ],
];
const widgets = [
  "study",
  "plan",
  "watch",
  "resources",
  "progress",
  "recent",
  "next",
];
const widgetLabels: Record<string, string> = {
  study: "Continue studying",
  plan: "Today’s plan",
  watch: "Continue watching",
  resources: "Your resources",
  progress: "Coverage & practice",
  recent: "Recent conversations",
  next: "Recommended next step",
};
export default function ProjectSettingsPage({
  projectId,
}: {
  projectId: string;
}) {
  const remote = useRemote<{ project: Project }>(`/api/projects/${projectId}`);
  const [name, setName] = useState("");
  const [exam, setExam] = useState("");
  const [context, setContext] = useState<ProjectContext>({
    ...emptyProjectContext,
  });
  const [target, setTarget] = useState("");
  const [description, setDescription] = useState("");
  const [subjects, setSubjects] = useState("");
  const [language, setLanguage] = useState("English");
  const [tone, setTone] = useState("Clear & friendly");
  const [enabled, setEnabled] = useState(toolOptions.map((t) => t[0]));
  const [minutes, setMinutes] = useState(120);
  const [start, setStart] = useState("16:00");
  const [accent, setAccent] = useState("#006BCB");
  const [layout, setLayout] = useState(widgets);
  const [hidden, setHidden] = useState<string[]>([
    "progress",
    "recent",
    "next",
  ]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [danger, setDanger] = useState<"archive" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const router = useRouter();
  useEffect(() => {
    const p = remote.data?.project;
    if (!p) return;
    const settings = p.settings || {};
    setName(p.name);
    setExam(p.exam);
    setContext(contextFromProject(p));
    setTarget(p.targetDate?.slice(0, 10) || "");
    setDescription(p.description || "");
    setSubjects(p.subjects.join(", "));
    setLanguage(String(settings.language || "English"));
    setTone(String(settings.tone || "Clear & friendly"));
    if (Array.isArray(settings.enabledTools))
      setEnabled(settings.enabledTools as string[]);
    setMinutes(Number(settings.minutesPerDay || 120));
    setStart(String(settings.studyStart || "16:00"));
    setAccent(p.accent || "#006BCB");
    if (Array.isArray(settings.widgets)) {
      const visible = (settings.widgets as string[]).filter((w) =>
        widgets.includes(w),
      );
      setLayout([...visible, ...widgets.filter((w) => !visible.includes(w))]);
      setHidden(widgets.filter((w) => !visible.includes(w)));
    }
  }, [remote.data]);
  async function save() {
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      parseSyllabusText(
        context.syllabusText,
        normalizeSubjects(subjects)[0] || "General",
      );
      await api(
        `/api/projects/${projectId}`,
        json("PATCH", {
          name,
          exam: exam.trim() || "Custom",
          ...context,
          targetDate: target || null,
          description,
          subjects: normalizeSubjects(subjects),
          accent,
          settings: {
            ...remote.data?.project.settings,
            language,
            tone,
            enabledTools: enabled,
            minutesPerDay: minutes,
            studyStart: start,
            widgets: layout.filter((w) => !hidden.includes(w)),
          },
        }),
      );
      if (context.syllabusText !== (remote.data?.project.syllabusText || "")) {
        await api(
          `/api/projects/${projectId}/curriculum`,
          json("PATCH", {
            action: "import-outline",
            text: context.syllabusText,
            defaultSubject: normalizeSubjects(subjects)[0] || "General",
          }),
        );
      }
      setSaved(true);
      await remote.reload();
      window.dispatchEvent(
        new CustomEvent("ingenium:project-updated", { detail: { projectId } }),
      );
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  function reorder(i: number, d: number) {
    setLayout((all) => {
      const a = [...all];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      return a;
    });
  }
  if (remote.loading && !remote.data) return <Loading />;
  if (!remote.data)
    return <ErrorMessage message={remote.error || "Project not found."} />;
  return (
    <div className="settings-page">
      <PageHeading
        eyebrow="MAKE THIS SPACE YOURS"
        title="A little more you."
        description="Shape your project around the way you learn."
      >
        <span className="settings-save-status" role="status">
          {saved && (
            <>
              <Check size={15} />
              Changes saved
            </>
          )}
        </span>
        <button
          form="project-settings"
          className="button button-primary"
          disabled={busy}
        >
          <Save size={17} />
          {busy ? "Saving…" : "Save changes"}
        </button>
      </PageHeading>
      <ErrorMessage message={error} />
      <form
        id="project-settings"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>The basics</h2>
            <p>A name, a goal, and the subjects that bring them together.</p>
          </div>
          <div className="settings-section-fields">
            <label className="page-field">
              Project name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <div className="page-form-grid">
              <label className="page-field">
                Exam or course
                <input
                  maxLength={300}
                  value={exam}
                  onChange={(e) => {
                    setExam(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <label className="page-field">
                Your target date
                <input
                  type="date"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
            </div>
            <p className="page-help">
              This is your personal target, not an official examination date.
            </p>
            <label className="page-field">
              Subjects or courses
              <input
                value={subjects}
                onChange={(e) => {
                  setSubjects(e.target.value);
                  setSaved(false);
                }}
              />
              <small>
                Separate subjects with commas. Historical attempts retain their
                original subject.
              </small>
            </label>
            <ProjectContextFields
              value={context}
              onChange={(value) => {
                setContext(value);
                setSaved(false);
              }}
            />
            <label className="page-field">
              Your learning goal
              <textarea
                rows={3}
                maxLength={5000}
                value={context.learningGoal}
                onChange={(e) => {
                  setContext({ ...context, learningGoal: e.target.value });
                  setSaved(false);
                }}
                placeholder="What would you like to understand or be able to do?"
              />
            </label>
            <label className="page-field">
              Project description
              <textarea
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setSaved(false);
                }}
                placeholder="A short reminder of what matters to you."
              />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>Your syllabus, your words</h2>
            <p>
              Keep an editable outline alongside your course details. Saving
              adds new topics to Progress → Syllabus. Existing topics, coverage
              and attempts stay intact.
            </p>
          </div>
          <div className="settings-section-fields">
            <SyllabusOutline
              value={context.syllabusText}
              onChange={(syllabusText) => {
                setContext({ ...context, syllabusText });
                setSaved(false);
              }}
              defaultSubject={normalizeSubjects(subjects)[0] || "General"}
            />
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>Your learning rhythm</h2>
            <p>Realistic time and a tutor voice that feels right.</p>
          </div>
          <div className="settings-section-fields">
            <div className="page-form-grid">
              <label className="page-field">
                Preferred language
                <input
                  maxLength={100}
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="Your preferred language"
                />
              </label>
              <label className="page-field">
                Tutor tone
                <select value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option>Clear & friendly</option>
                  <option>Clear and encouraging</option>
                  <option>Concise & direct</option>
                  <option>Patient & detailed</option>
                  <option>A little playful</option>
                </select>
              </label>
            </div>
            <div className="page-form-grid">
              <label className="page-field">
                Daily study availability, minutes
                <input
                  type="number"
                  min={15}
                  max={720}
                  step={15}
                  required
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </label>
              <label className="page-field">
                Preferred start time
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
            </div>
            <p className="page-help">
              The planner uses this availability alongside your fixed calendar
              commitments.
            </p>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>A useful set of tools</h2>
            <p>
              Choose what appears in your Study menu. Saved work stays
              accessible when a tool is turned off.
            </p>
          </div>
          <div className="settings-tools">
            {toolOptions.map(([id, label, desc]) => (
              <label className="settings-tool-row" key={id}>
                <span>
                  <strong>{label}</strong>
                  <small>{desc}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={enabled.includes(id)}
                  onChange={(e) =>
                    setEnabled((all) =>
                      e.target.checked
                        ? [...all, id]
                        : all.filter((x) => x !== id),
                    )
                  }
                />
              </label>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-intro">
            <h2>Your Overview</h2>
            <p>
              Put the most useful things first. Use the arrows to change their
              order.
            </p>
          </div>
          <div className="settings-section-fields">
            <div className="settings-widget-list">
              {layout.map((w, i) => (
                <div key={w}>
                  <span className="settings-widget-number">{i + 1}</span>
                  <strong>{widgetLabels[w] || w}</strong>
                  <button
                    type="button"
                    className="page-icon-button"
                    aria-label={`${hidden.includes(w) ? "Show" : "Hide"} ${widgetLabels[w] || w}`}
                    onClick={() =>
                      setHidden((all) =>
                        all.includes(w)
                          ? all.filter((x) => x !== w)
                          : [...all, w],
                      )
                    }
                  >
                    {hidden.includes(w) ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="page-icon-button"
                    disabled={i === 0}
                    aria-label={`Move ${widgetLabels[w] || w} up`}
                    onClick={() => reorder(i, -1)}
                  >
                    <ChevronUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="page-icon-button"
                    disabled={i === layout.length - 1}
                    aria-label={`Move ${widgetLabels[w] || w} down`}
                    onClick={() => reorder(i, 1)}
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>
              ))}
            </div>
            <label className="page-field">
              Project accent
              <div className="settings-colors">
                {["#006BCB", "#2C7865", "#986D50", "#7A6896", "#3C7D8C"].map(
                  (c) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={`Use ${c} accent`}
                      aria-pressed={accent === c}
                      style={{ background: c }}
                      onClick={() => setAccent(c)}
                    >
                      {accent === c && <Check size={17} />}
                    </button>
                  ),
                )}
              </div>
            </label>
          </div>
        </section>
        <section className="settings-section settings-danger-zone">
          <div className="settings-section-intro">
            <h2>Project lifecycle</h2>
            <p>
              Archive keeps your work for later. Deleting permanently removes
              this project’s learning records.
            </p>
          </div>
          <div className="settings-section-fields">
            <div className="settings-lifecycle-row">
              <div>
                <strong>
                  {remote.data.project.archived
                    ? "Restore this project"
                    : "Archive this project"}
                </strong>
                <p>
                  {remote.data.project.archived
                    ? "Return this project to your active projects."
                    : "Keep everything and move it out of your active projects."}
                </p>
              </div>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setDanger("archive")}
              >
                <Archive size={17} />
                {remote.data.project.archived ? "Restore" : "Archive"}
              </button>
            </div>
            <div className="settings-lifecycle-row">
              <div>
                <strong>Delete this project</strong>
                <p>
                  This removes conversations, resources, attempts and planning
                  data.
                </p>
              </div>
              <button
                type="button"
                className="button page-danger"
                onClick={() => setDanger("delete")}
              >
                <Trash2 size={17} />
                Delete
              </button>
            </div>
          </div>
        </section>
      </form>
      <div className="settings-entitlement">
        <span className="settings-pro-label">INGENIUM PRO · DEMO</span>
        <p>
          All implemented tools are included in this synthetic demo workspace.
          Proposed pricing: USD 10/month. No payment collection.
        </p>
      </div>
      {danger && (
        <Modal
          title={
            danger === "delete"
              ? `Delete ${name}?`
              : remote.data.project.archived
                ? "Restore this project?"
                : "Archive this project?"
          }
          onClose={() => {
            setDanger(null);
            setConfirmation("");
          }}
        >
          <p>
            {danger === "delete"
              ? `This permanently removes “${name}” and its conversations, library, lab variations, attempts, reviews, videos and calendar. Type the project name to confirm.`
              : remote.data.project.archived
                ? "Your saved work will return to your active project list."
                : "Your project and all of its work will be kept. You can restore it from Archived projects."}
          </p>
          {danger === "delete" && (
            <label className="page-field">
              Project name
              <input
                autoFocus
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={name}
              />
            </label>
          )}
          <ErrorMessage message={error} />
          <div className="page-dialog-actions">
            <button
              className="button button-ghost"
              onClick={() => setDanger(null)}
            >
              Cancel
            </button>
            <button
              className={`button ${danger === "delete" ? "page-danger" : "button-primary"}`}
              disabled={busy || (danger === "delete" && confirmation !== name)}
              onClick={async () => {
                setBusy(true);
                try {
                  if (danger === "delete")
                    await api(
                      `/api/projects/${projectId}`,
                      json("DELETE", { confirmName: name }),
                    );
                  else
                    await api(
                      `/api/projects/${projectId}`,
                      json("PATCH", {
                        archived: !remote.data?.project.archived,
                      }),
                    );
                  router.push("/projects");
                } catch (e) {
                  setError(safeError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {danger === "delete"
                ? "Delete project"
                : remote.data.project.archived
                  ? "Restore project"
                  : "Archive project"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { ProjectSettingsPage };
