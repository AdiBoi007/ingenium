"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  Folder,
  Search,
  Bell,
  Settings,
  UserRound,
  ChevronDown,
  Check,
  Sun,
  Moon,
  Monitor,
  ArrowUpRight,
  LayoutDashboard,
  MessageCircle,
  Play,
  BookOpen,
  MoreHorizontal,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  X,
} from "lucide-react";
import { api, json } from "@/lib/api";
import { openWorkspace, type WorkspaceStudent } from "@/lib/identity";
import type { Project } from "@/lib/types";
import { Modal, Loading, ErrorBox, StarMark } from "./ui";
import Overview from "./Overview";
import Projects from "./Projects";
import dynamic from "next/dynamic";
const Study = dynamic(() => import("./Study"), { loading: () => <Loading /> });
const LibraryPage = dynamic(() => import("./pages/LibraryPage"), {
  loading: () => <Loading />,
});
const CramazonPage = dynamic(() => import("./pages/CramazonPage"), {
  loading: () => <Loading />,
});
const CalendarPage = dynamic(() => import("./pages/CalendarPage"), {
  loading: () => <Loading />,
});
const ProgressPage = dynamic(() => import("./pages/ProgressPage"), {
  loading: () => <Loading />,
});
const ProjectSettingsPage = dynamic(
  () => import("./pages/ProjectSettingsPage"),
  { loading: () => <Loading /> },
);
const ArtifactPage = dynamic(() => import("./ArtifactPage"), {
  loading: () => <Loading />,
});
const TestWorkspace = dynamic(
  () => import("./learning/TestWorkspace").then((m) => m.TestWorkspace),
  { loading: () => <Loading /> },
);
const tabs = [
  ["", "Overview", LayoutDashboard],
  ["study", "Study", MessageCircle],
  ["cramazon", "Cramazon Prime", Play],
  ["library", "Library", BookOpen],
  ["calendar", "Calendar", CalendarDays],
  ["progress", "Progress", ChartNoAxesColumnIncreasing],
] as const;
export default function Workspace({ segments }: { segments: string[] }) {
  const [projectId, page = "", recordId] = segments;
  const [student, setStudent] = useState<WorkspaceStudent | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [switcher, setSwitcher] = useState(false),
    [modal, setModal] = useState(""),
    [theme, setTheme] = useState("light"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [notices, setNotices] = useState<any[]>([]),
    [searching, setSearching] = useState(false),
    [more, setMore] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setProject(null);
    Promise.all([
      api<{ projects: Project[] }>("/api/projects"),
      projectId
        ? api<{ project: Project }>(`/api/projects/${projectId}`)
        : Promise.resolve({ project: null }),
    ])
      .then(([all, one]) => {
        if (active) {
          setProjects(all.projects);
          setProject(one.project);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  useEffect(() => {
    openWorkspace()
      .then((s) => {
        setStudent(s);
        setProfileName(s.name);
      })
      .catch((e) => setError(e.message));
    const stored = localStorage.getItem("ingenium-theme") || "light";
    setTheme(stored);
    api("/api/preferences")
      .then((r) => {
        if (r.preferences?.theme) setTheme(r.preferences.theme);
        if (r.name) {
          setProfileName(r.name);
          setStudent((s) => (s ? { ...s, name: r.name } : s));
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    localStorage.setItem("ingenium-theme", theme);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
      if (e.key === "Escape") {
        setSwitcher(false);
        setMore(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (modal !== "search") return;
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => {
          if (active) setResults(r.items || []);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, modal]);
  useEffect(() => {
    if (modal === "notifications")
      api("/api/notifications")
        .then((r) => setNotices(r.items || []))
        .catch((e) => setError(e.message));
  }, [modal]);
  const setAppearance = (value: string) => {
    setTheme(value);
    api("/api/preferences", {
      method: "PATCH",
      body: json({ theme: value }),
    }).catch((e) => setError(e.message));
  };
  useEffect(() => {
    const changed = () => {
      api<{ projects: Project[] }>("/api/projects")
        .then((r) => setProjects(r.projects))
        .catch(() => {});
      if (projectId)
        api<{ project: Project }>(`/api/projects/${projectId}`)
          .then((r) => setProject(r.project))
          .catch(() => {});
    };
    window.addEventListener("ingenium:project-updated", changed);
    return () =>
      window.removeEventListener("ingenium:project-updated", changed);
  }, [projectId]);
  const base = projectId ? `/projects/${projectId}` : "/projects";
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="global-rail" aria-label="Global navigation">
        <Link
          href="/projects"
          className="rail-logo"
          aria-label="Ingenium, all projects"
        >
          <StarMark size={33} />
        </Link>
        <div className="rail-primary">
          <Link
            className="rail-action active"
            title="All projects"
            aria-label="All projects"
            href="/projects"
          >
            <Folder size={23} />
          </Link>
          <button
            className="rail-action"
            aria-label="Search all projects"
            title="Search all projects · ⌘ K"
            onClick={() => setModal("search")}
          >
            <Search size={23} />
          </button>
          <button
            className="rail-action"
            aria-label="Notifications"
            title="Notifications"
            onClick={() => setModal("notifications")}
          >
            <Bell size={22} />
          </button>
        </div>
        <div className="rail-divider" />
        <button
          className="rail-action"
          title="Appearance & preferences"
          aria-label="Appearance and preferences"
          onClick={() => setModal("profile")}
        >
          <Settings size={23} />
        </button>
        <button
          className="rail-avatar"
          aria-label="Workspace profile"
          title={`${student?.name || "Learner"} · Workspace`}
          onClick={() => setModal("profile")}
        >
          {student?.name?.[0]?.toUpperCase() || "L"}
        </button>
      </aside>
      <div className="workspace">
        <header className="app-header">
          <Link href="/projects" className="wordmark">
            INGENIUM
          </Link>
          <div className="account">
            <span>{student?.demo ? "Sample workspace" : "Your workspace"}</span>
            <i />
            <button
              className="icon-button"
              aria-label="Open workspace profile"
              onClick={() => setModal("profile")}
            >
              <UserRound size={25} />
            </button>
          </div>
        </header>
        <div className="project-bar">
          <Link href="/projects">Projects</Link>
          {projectId && (
            <>
              <span className="breadcrumb-separator">/</span>
              <div className="project-switcher">
                <button
                  aria-expanded={switcher}
                  className="project-switch-button"
                  onClick={() => setSwitcher(!switcher)}
                >
                  {project?.name || "Opening project"}
                  <ChevronDown size={18} />
                </button>
                {switcher && (
                  <>
                    <button
                      className="popover-dismiss"
                      aria-label="Close project switcher"
                      onClick={() => setSwitcher(false)}
                    />
                    <div className="project-switch-menu popover">
                      <span className="menu-eyebrow">YOUR PROJECTS</span>
                      {projects
                        .filter((p) => !p.archived)
                        .map((p) => (
                          <Link
                            key={p.id}
                            href={`/projects/${p.id}${["study", "library", "calendar", "progress", "cramazon"].includes(page) ? "/" + page : ""}`}
                            onClick={() => setSwitcher(false)}
                          >
                            <span
                              className="project-dot"
                              style={{ background: p.accent || "#006bcb" }}
                            />
                            {p.name}
                            {p.id === projectId && <Check size={17} />}
                          </Link>
                        ))}
                      <div className="menu-rule" />
                      <Link
                        href={`${base}/settings`}
                        onClick={() => setSwitcher(false)}
                      >
                        <Settings size={17} />
                        Project settings
                      </Link>
                      <Link href="/projects" onClick={() => setSwitcher(false)}>
                        <Folder size={17} />
                        All projects
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        {projectId && (
          <nav className="project-nav" aria-label="Project navigation">
            {tabs.map(([route, label]) => (
              <Link
                key={route}
                className={page === route ? "selected" : ""}
                href={route ? `${base}/${route}` : base}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <main
          id="main-content"
          className={`main-content page-${page || "overview"}`}
        >
          {error && project && (
            <ErrorBox message={error} retry={() => location.reload()} />
          )}
          {busy ? (
            <Loading />
          ) : error && !projectId ? (
            <ErrorBox message={error} retry={() => location.reload()} />
          ) : projectId && !project ? (
            <div className="empty-state">
              <h1>Project not found</h1>
              <p>{error || "This project may have been removed."}</p>
              <Link className="button" href="/projects">
                Back to projects
              </Link>
            </div>
          ) : (
            <Suspense fallback={<Loading />}>
              {!projectId ? (
                <Projects projects={projects} onChange={setProjects} />
              ) : page === "" ? (
                <Overview
                  key={projectId}
                  project={project!}
                  studentName={student?.name}
                />
              ) : page === "study" ? (
                <Study
                  key={projectId}
                  project={project!}
                  conversationId={recordId}
                />
              ) : page === "library" ? (
                <LibraryPage
                  key={projectId + recordId}
                  projectId={projectId}
                  resourceId={recordId}
                />
              ) : page === "cramazon" ? (
                <CramazonPage
                  key={projectId + recordId}
                  projectId={projectId}
                  lessonId={recordId}
                />
              ) : page === "calendar" ? (
                <CalendarPage key={projectId} projectId={projectId} />
              ) : page === "progress" ? (
                <ProgressPage key={projectId} projectId={projectId} />
              ) : page === "settings" ? (
                <ProjectSettingsPage key={projectId} projectId={projectId} />
              ) : page === "artifacts" ? (
                <ArtifactPage
                  key={projectId + recordId}
                  projectId={projectId}
                  artifactId={recordId}
                />
              ) : page === "tests" ? (
                <TestWorkspace
                  key={projectId + recordId}
                  projectId={projectId}
                  sessionId={recordId}
                />
              ) : (
                <div className="empty-state">
                  <h1>Page not found</h1>
                  <Link href={base}>Back to Overview</Link>
                </div>
              )}
            </Suspense>
          )}
        </main>
        {projectId && (
          <footer className="workspace-footer">
            <span>{project?.name}</span>
            <span className="status-dot" />
            <span>
              {project?.archived ? "Project archived" : "Project active"}
            </span>
            <span className="footer-note">A little more understood.</span>
          </footer>
        )}
      </div>
      {projectId && (
        <nav className="mobile-nav" aria-label="Mobile project navigation">
          {tabs.slice(0, 4).map(([route, label, Icon]) => (
            <Link
              key={route}
              href={route ? `${base}/${route}` : base}
              className={route === page ? "selected" : ""}
            >
              <Icon size={21} />
              <span>{label === "Cramazon Prime" ? "Cramazon" : label}</span>
            </Link>
          ))}
          <button
            className={more ? "selected" : ""}
            onClick={() => setMore(!more)}
            aria-expanded={more}
          >
            <MoreHorizontal size={22} />
            <span>More</span>
          </button>
        </nav>
      )}
      {more && (
        <Modal title="Your workspace" onClose={() => setMore(false)}>
          <div className="mobile-more">
            {tabs.slice(4).map(([route, label, Icon]) => (
              <Link
                key={route}
                href={`${base}/${route}`}
                onClick={() => setMore(false)}
              >
                <Icon size={21} />
                {label}
              </Link>
            ))}
            <Link href={`${base}/settings`} onClick={() => setMore(false)}>
              <Settings size={21} />
              Project settings
            </Link>
            <Link href="/projects" onClick={() => setMore(false)}>
              <Folder size={21} />
              All projects
            </Link>
            <button
              onClick={() => {
                setMore(false);
                setModal("profile");
              }}
            >
              <Sun size={21} />
              Appearance
            </button>
          </div>
        </Modal>
      )}
      {modal === "profile" && (
        <Modal title="Your corner of Ingenium" onClose={() => setModal("")}>
          <div className="profile-intro">
            <span className="profile-avatar">
              {student?.name?.[0]?.toUpperCase() || "L"}
            </span>
            <div>
              <h3>
                {student?.name || "Learner"} <span className="badge">Demo</span>
              </h3>
              <p>A space to be curious.</p>
            </div>
          </div>
          <form
            className="profile-name-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setProfileSaving(true);
              setProfileSaved(false);
              try {
                const result = await api("/api/preferences", {
                  method: "PATCH",
                  body: json({ name: profileName.trim() }),
                });
                setStudent((s) => (s ? { ...s, name: result.name } : s));
                setProfileSaved(true);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setProfileSaving(false);
              }
            }}
          >
            <label htmlFor="profile-name">What should we call you?</label>
            <div>
              <input
                id="profile-name"
                required
                maxLength={100}
                value={profileName}
                onChange={(e) => {
                  setProfileName(e.target.value);
                  setProfileSaved(false);
                }}
              />
              <button className="button" disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save name"}
              </button>
            </div>
            {profileSaved && <small role="status">Name saved</small>}
          </form>
          <div className="settings-block">
            <label>Appearance</label>
            <div className="theme-options">
              {[
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
                ["system", "System", Monitor],
              ].map(([value, label, Icon]: any) => (
                <button
                  key={value}
                  className={theme === value ? "selected" : ""}
                  onClick={() => setAppearance(value)}
                >
                  <Icon size={22} />
                  {label}
                  {theme === value && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>
          <div className="pro-panel">
            <StarMark size={24} />
            <div>
              <h3>
                Ingenium Pro <span className="badge">Demo access</span>
              </h3>
              <p>
                Every implemented learning tool is included in this workspace.
              </p>
              <small>
                USD 10/month is a pricing hypothesis. No payment is collected.
              </small>
            </div>
          </div>
          <p className="fine-print">
            {student?.demo
              ? "Sample workspace with synthetic learning history."
              : "Your projects and watch history are saved for this browser. Sign-in and cross-device access are coming later. Clearing this browser’s cookies removes access to this demo workspace."}
          </p>
        </Modal>
      )}
      {modal === "search" && (
        <Modal title="Find your next thought" onClose={() => setModal("")} wide>
          <label className="search-input">
            <Search size={20} />
            <input
              autoFocus
              placeholder="Search across your projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>esc</kbd>
          </label>
          <p className="fine-print">
            Results are labelled by their owning project.
          </p>
          <div className="search-results">
            {searching ? (
              <Loading label="Searching your projects…" />
            ) : results.length ? (
              results.map((r, i) => (
                <Link
                  key={r.id || i}
                  href={
                    r.url ||
                    `/projects/${r.projectId}/${r.type === "conversation" ? "study" : r.type === "task" ? "calendar" : "library"}${r.type === "task" ? "" : "/" + r.id}`
                  }
                  onClick={() => setModal("")}
                >
                  <span className="icon-tile">
                    <Search size={19} />
                  </span>
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.projectName ||
                        projects.find((p) => p.id === r.projectId)?.name}{" "}
                      · {r.type}
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              ))
            ) : (
              <p className="empty-note">
                {query
                  ? "No matching items. Try a topic or title."
                  : "Search your notes, conversations and resources."}
              </p>
            )}
          </div>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal title="A few things for you" onClose={() => setModal("")}>
          <div className="notification-list">
            {notices.length ? (
              notices.map((n) => (
                <div key={n.id} className={n.read ? "read" : ""}>
                  <Bell size={20} />
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.body || n.message}</p>
                    {(n.url || n.href) && (
                      <Link href={n.url || n.href} onClick={() => setModal("")}>
                        Open <ArrowUpRight size={14} />
                      </Link>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Mark notification read"
                    onClick={async () => {
                      try {
                        await api(`/api/notifications/${n.id}`, {
                          method: "PATCH",
                          body: json({ read: true }),
                        });
                        setNotices((ns) =>
                          ns.map((x) =>
                            x.id === n.id ? { ...x, read: true } : x,
                          ),
                        );
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    <Check size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Dismiss notification"
                    onClick={async () => {
                      try {
                        await api(`/api/notifications/${n.id}`, {
                          method: "PATCH",
                          body: json({ dismissed: true }),
                        });
                        setNotices((ns) => ns.filter((x) => x.id !== n.id));
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-note">
                You’re all caught up. Due study tasks and processing updates
                will appear here.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
