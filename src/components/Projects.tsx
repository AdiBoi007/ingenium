"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Grid2X2,
  List,
  ArrowUpRight,
  MoreHorizontal,
  Pin,
  Archive,
  RotateCcw,
  Trash2,
  BookOpen,
  CalendarDays,
  ArrowRight,
  Check,
  GraduationCap,
} from "lucide-react";
import { api, json } from "@/lib/api";
import type { Project } from "@/lib/types";
import { Modal, ErrorBox } from "./ui";
import {
  emptyProjectContext,
  normalizeSubjects,
  parseSyllabusText,
  projectContextLabel,
  projectKindLabels,
  projectKinds,
  projectPresets,
  type ProjectContext,
} from "@/domain/project-context";
import { ProjectContextFields, SyllabusOutline } from "./ProjectContextFields";
export default function Projects({
  projects,
  onChange,
}: {
  projects: Project[];
  onChange: (p: Project[]) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(""),
    [view, setView] = useState("grid"),
    [filter, setFilter] = useState("active"),
    [sort, setSort] = useState("recent"),
    [creating, setCreating] = useState(false),
    [step, setStep] = useState(0),
    [exam, setExam] = useState("Custom"),
    [name, setName] = useState(""),
    [targetDate, setTargetDate] = useState(""),
    [subjects, setSubjects] = useState(""),
    [language, setLanguage] = useState("English"),
    [confidence, setConfidence] = useState("Starting fresh"),
    [hours, setHours] = useState(2),
    [prep, setPrep] = useState("Self-study"),
    [books, setBooks] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [menu, setMenu] = useState(""),
    [deleting, setDeleting] = useState<Project | null>(null),
    [confirmName, setConfirmName] = useState("");
  const [context, setContext] = useState<ProjectContext>({
    ...emptyProjectContext,
  });
  const [preset, setPreset] = useState("blank");
  const selectPreset = (key: string) => {
    const value = projectPresets.find((p) => p.id === key)!;
    setPreset(key);
    setContext({ ...emptyProjectContext, ...value.context });
    setExam(value.exam);
    setSubjects(value.subjects.join(", "));
  };
  useEffect(() => {
    setView(localStorage.getItem("ingenium-project-view") || "grid");
    setSort(localStorage.getItem("ingenium-project-sort") || "recent");
  }, []);
  const changeView = (v: string) => {
    setView(v);
    localStorage.setItem("ingenium-project-view", v);
  };
  const visible = projects
    .filter(
      (p) =>
        (filter === "archived" ? p.archived : !p.archived) &&
        `${p.name} ${projectContextLabel(p)} ${p.institution || ""} ${p.subjects.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sort === "name"
          ? a.name.localeCompare(b.name)
          : (b.updatedAt || "").localeCompare(a.updatedAt || "")),
    );
  const update = async (p: Project, values: Partial<Project>) => {
    try {
      const { item } = await api(`/api/projects/${p.id}`, {
        method: "PATCH",
        body: json(values),
      });
      onChange(projects.map((x) => (x.id === p.id ? item : x)));
      setMenu("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  const create = async () => {
    if (!name.trim()) {
      setStep(1);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const selectedSubjects = normalizeSubjects(subjects);
      parseSyllabusText(context.syllabusText, selectedSubjects[0] || "General");
      const { item } = await api("/api/projects", {
        method: "POST",
        body: json({
          name: name.trim(),
          exam: exam.trim() || "Custom",
          ...context,
          subjects: selectedSubjects,
          targetDate: targetDate || null,
          description: `${prep} · ${confidence}`,
          settings: {
            language,
            confidence,
            availabilityHours: hours,
            preparation: prep,
            books,
            templateId: projectPresets.find((p) => p.id === preset)?.templateId,
            targetProvenance: "student",
            enabledTools: [
              "ask",
              "solve",
              "visualise",
              "practice",
              "test",
              "revise",
              "notes",
              "plan",
              "lessons",
              "progress",
              "sources",
              "updates",
            ],
          },
        }),
      });
      onChange([...projects, item]);
      router.push(`/projects/${item.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <section className="projects-hero">
        <img src="/island.png" className="island-art" alt="" />
        <span className="eyebrow">YOUR LEARNING, ALL TOGETHER</span>
        <h1>
          A place for every ambition<span>.</span>
        </h1>
        <p>Pick up where you left off. Or begin something new.</p>
        <button
          className="button button-primary"
          onClick={() => {
            setCreating(true);
            setStep(0);
            setError("");
            selectPreset("blank");
            setName("");
            setTargetDate("");
            setBooks("");
          }}
        >
          <Plus size={19} />
          New project
        </button>
      </section>
      <div className="projects-toolbar">
        <div className="segmented">
          <button
            className={filter === "active" ? "selected" : ""}
            onClick={() => setFilter("active")}
          >
            Active <span>{projects.filter((p) => !p.archived).length}</span>
          </button>
          <button
            className={filter === "archived" ? "selected" : ""}
            onClick={() => setFilter("archived")}
          >
            Archived
          </button>
        </div>
        <div className="project-tools">
          <label className="search-input compact">
            <Search size={17} />
            <input
              aria-label="Search projects"
              placeholder="Find a project…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Sort projects"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              localStorage.setItem("ingenium-project-sort", e.target.value);
            }}
          >
            <option value="recent">Recent activity</option>
            <option value="name">Name</option>
          </select>
          <div className="view-toggle">
            <button
              aria-label="Grid view"
              className={view === "grid" ? "selected" : ""}
              onClick={() => changeView("grid")}
            >
              <Grid2X2 size={18} />
            </button>
            <button
              aria-label="List view"
              className={view === "list" ? "selected" : ""}
              onClick={() => changeView("list")}
            >
              <List size={19} />
            </button>
          </div>
        </div>
      </div>
      {error && !creating && <ErrorBox message={error} />}
      <div
        className={`project-collection ${view === "list" ? "list-view" : ""}`}
      >
        {visible.map((p, index) => (
          <article className="project-card panel" key={p.id}>
            <div className={`project-cover cover-${index % 4}`}>
              <span className="project-symbol">
                <GraduationCap size={33} />
              </span>
              {index === 0 ? (
                <img src="/island.png" alt="" />
              ) : (
                <svg viewBox="0 0 400 120" aria-hidden="true">
                  <path
                    d={
                      index === 1
                        ? "M0 100Q90 -20 180 70T400 30"
                        : index === 2
                          ? "M0 110L70 60L130 90L200 30L280 70L400 0"
                          : "M0 80Q100 20 200 80T400 80"
                    }
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M0 110H400M40 0V120M100 0V120M160 0V120M220 0V120M280 0V120M340 0V120"
                    stroke="currentColor"
                    opacity=".14"
                  />
                </svg>
              )}
            </div>
            <div className="project-card-body">
              <div className="project-card-title">
                <span className="eyebrow">
                  {p.courseCode ||
                    (p.exam !== "Custom" && p.exam) ||
                    projectKindLabels[p.projectKind || "custom"]}
                </span>
                <div className="card-menu-wrap">
                  <button
                    className="icon-button"
                    aria-label={`Options for ${p.name}`}
                    onClick={() => setMenu(menu === p.id ? "" : p.id)}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                  {menu === p.id && (
                    <div className="popover card-menu">
                      <button onClick={() => update(p, { pinned: !p.pinned })}>
                        <Pin size={16} />
                        {p.pinned ? "Unpin" : "Pin project"}
                      </button>
                      <button
                        onClick={() => update(p, { archived: !p.archived })}
                      >
                        {p.archived ? (
                          <RotateCcw size={16} />
                        ) : (
                          <Archive size={16} />
                        )}
                        {p.archived ? "Restore" : "Archive"}
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => {
                          setDeleting(p);
                          setConfirmName("");
                          setMenu("");
                        }}
                      >
                        <Trash2 size={16} />
                        Delete project
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <Link href={`/projects/${p.id}`} className="project-name">
                <h2>{p.name}</h2>
                {p.pinned && <Pin size={16} />}
              </Link>
              <p className="project-subjects">
                {p.subjects.join(" · ") ||
                  p.institution ||
                  "An open space for your next idea"}
              </p>
              <div className="project-card-meta">
                <span>
                  <BookOpen size={15} />
                  {p.subjects.length} subjects
                </span>
                {p.targetDate && (
                  <span>
                    <CalendarDays size={15} />
                    {new Date(
                      p.targetDate.slice(0, 10) + "T12:00:00",
                    ).toLocaleDateString("en-AU", {
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    target
                  </span>
                )}
              </div>
              <div className="project-card-footer">
                <span>
                  <i className="status-dot" />
                  {p.archived ? "Archived" : "Ready when you are"}
                </span>
                <Link href={`/projects/${p.id}`} className="text-link">
                  Continue
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="empty-state">
          <h2>
            {query
              ? "No projects found"
              : filter === "archived"
                ? "Nothing tucked away yet"
                : "Make room for your next ambition"}
          </h2>
          <p>
            {query
              ? "Try a different name or subject."
              : "Each project keeps its own study, resources and progress together."}
          </p>
        </div>
      )}
      <p className="projects-footnote">
        Your projects are separate spaces. Your curiosity connects them.
      </p>
      {creating && (
        <Modal
          title={
            [
              "What are you working towards?",
              "Make it your own",
              "Meet yourself where you are",
              "Make space to learn",
            ][step]
          }
          onClose={() => setCreating(false)}
          wide
        >
          <div className="creation-steps">
            {["Goal", "Basics", "Starting point", "Your rhythm"].map((s, i) => (
              <button
                key={s}
                className={i === step ? "current" : i < step ? "done" : ""}
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
              >
                <span>{i < step ? <Check size={13} /> : i + 1}</span>
                {s}
              </button>
            ))}
          </div>
          {step === 0 ? (
            <>
              <div className="universal-project-intro">
                <p className="muted">
                  A course, a qualification, an exam, or something entirely your
                  own.
                </p>
                <label className="field">
                  Starting template
                  <select
                    aria-label="Starting template"
                    value={preset}
                    onChange={(e) => selectPreset(e.target.value)}
                  >
                    {projectPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  className="universal-kind-options"
                  aria-label="Project kind"
                >
                  {projectKinds.map((kind) => (
                    <button
                      key={kind}
                      className={context.projectKind === kind ? "selected" : ""}
                      aria-pressed={context.projectKind === kind}
                      onClick={() =>
                        setContext({ ...context, projectKind: kind })
                      }
                    >
                      {projectKindLabels[kind]}
                    </button>
                  ))}
                </div>
                <p className="fine-print">
                  Templates offer an editable starting structure. Your new
                  project starts with no sample activity, practice questions or
                  grades. Add your own materials as you go.
                </p>
              </div>
            </>
          ) : step === 1 ? (
            <div className="form-grid">
              <label className="field">
                Project name
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    exam === "NEET" ? "NEET 2027" : "My next chapter"
                  }
                />
              </label>
              <label className="field">
                Personal target date <span className="optional">Optional</span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </label>
              <label className="field full">
                Subjects or courses
                <input
                  value={subjects}
                  onChange={(e) => setSubjects(e.target.value)}
                />
                <small>
                  Separate each subject with a comma. You can change these
                  later.
                </small>
              </label>
              <label className="field full">
                Exam, course or learning area
                <input
                  maxLength={300}
                  value={exam}
                  onChange={(e) => setExam(e.target.value)}
                  placeholder="Your course, qualification or interest"
                />
              </label>
              <div className="full">
                <ProjectContextFields
                  value={context}
                  onChange={setContext}
                  showKind={false}
                />
              </div>
              <p className="fine-print">
                This is your personal target, not an official examination date.
              </p>
            </div>
          ) : step === 2 ? (
            <div className="form-grid">
              <label className="field full">
                How does it feel right now?
                <select
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                >
                  <option>Starting fresh</option>
                  <option>Building foundations</option>
                  <option>Practising consistently</option>
                  <option>Ready for revision</option>
                </select>
              </label>
              <label className="field full">
                How are you preparing?
                <select value={prep} onChange={(e) => setPrep(e.target.value)}>
                  <option>Self-study</option>
                  <option>Coaching + self-study</option>
                  <option>School / college</option>
                  <option>A bit of everything</option>
                </select>
              </label>
              <label className="field full">
                Your learning goal
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={context.learningGoal}
                  onChange={(e) =>
                    setContext({ ...context, learningGoal: e.target.value })
                  }
                  placeholder="What would you like to understand or be able to do?"
                />
              </label>
              <div className="full">
                <SyllabusOutline
                  value={context.syllabusText}
                  onChange={(syllabusText) =>
                    setContext({ ...context, syllabusText })
                  }
                  defaultSubject={normalizeSubjects(subjects)[0] || "General"}
                />
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <label className="field">
                Study hours per day
                <input
                  type="number"
                  min="0.5"
                  max="12"
                  step="0.5"
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                />
              </label>
              <label className="field">
                Preferred language
                <input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="Your preferred language"
                  maxLength={100}
                />
              </label>
              <label className="field full">
                Books, coaching or course context{" "}
                <span className="optional">Optional</span>
                <textarea
                  value={books}
                  onChange={(e) => setBooks(e.target.value)}
                  placeholder="Books and editions, coaching institute, course code…"
                  rows={3}
                />
              </label>
              <p className="muted">
                You can add commitments and a detailed timetable in your
                Calendar.
              </p>
            </div>
          )}
          {error && <ErrorBox message={error} />}
          <div className="modal-actions">
            {step > 0 && (
              <button className="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              className="button button-primary"
              disabled={saving || (step === 1 && !name.trim())}
              onClick={() => (step === 3 ? create() : setStep(step + 1))}
            >
              {saving
                ? "Creating your space…"
                : step === 3
                  ? "Create project"
                  : "Continue"}
              <ArrowRight size={17} />
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={`Delete ${deleting.name}?`}
          onClose={() => setDeleting(null)}
        >
          <p>
            All conversations, resources, attempts, plans and saved work in this
            project will be permanently removed.
          </p>
          <label className="field">
            Type “{deleting.name}” to confirm
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button className="button" onClick={() => setDeleting(null)}>
              Keep project
            </button>
            <button
              className="button button-danger"
              disabled={confirmName !== deleting.name}
              onClick={async () => {
                try {
                  await api(`/api/projects/${deleting.id}`, {
                    method: "DELETE",
                    body: json({ confirmName }),
                  });
                  onChange(projects.filter((p) => p.id !== deleting.id));
                  setDeleting(null);
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Delete project
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
