"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import RichText from "@/components/RichText";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  Download,
  FileText,
  FlaskConical,
  Folder,
  Grid2X2,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Empty,
  ErrorMessage,
  Loading,
  Modal,
  PageHeading,
  SearchField,
  StudyLink,
  downloadText,
  json,
  safeError,
  useRemote,
  type Project,
  type Resource,
} from "./shared";

const resourceTypes = [
  "All resources",
  "Notes",
  "Documents",
  "Books",
  "Modules",
  "Saved labs",
  "Links",
];
function resourceIcon(type: string, size = 24) {
  const props = { size, strokeWidth: 1.25 };
  if (type.includes("book")) return <BookOpen {...props} />;
  if (type.includes("lab") || type === "simulation")
    return <FlaskConical {...props} />;
  if (type.includes("module") || type === "collection")
    return <Layers {...props} />;
  if (type === "image") return <ImageIcon {...props} />;
  if (type === "link") return <LinkIcon {...props} />;
  return <FileText {...props} />;
}
function typeLabel(type: string) {
  return (
    (
      {
        book: "Book reference",
        module: "Coaching module",
        note: "Study note",
        "video-note": "Lesson note",
        document: "Document",
        image: "Image",
        simulation: "Saved lab",
        lab: "Saved lab",
        link: "Link",
        "lesson-collection": "Lesson collection",
        collection: "Coaching modules",
        "question-collection": "Question collection",
      } as Record<string, string>
    )[type] || type
  );
}
function matchesType(type: string, filter: string) {
  if (filter === "All resources") return true;
  if (filter === "Notes")
    return ["note", "video-note", "formula"].includes(type);
  if (filter === "Documents")
    return ["document", "image", "pdf", "text"].includes(type);
  if (filter === "Modules") return ["module", "collection"].includes(type);
  if (filter === "Saved labs") return ["simulation", "lab"].includes(type);
  return (
    type ===
    (
      { Books: "book", Modules: "module", Links: "link" } as Record<
        string,
        string
      >
    )[filter]
  );
}

export default function LibraryPage({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId?: string;
}) {
  const remote = useRemote<{ items: Resource[] }>(
    `/api/projects/${projectId}/resources`,
  );
  const project = useRemote<{ project: Project }>(`/api/projects/${projectId}`);
  const artifacts = useRemote<{
    items: Array<{
      id: string;
      title: string;
      type: string;
      projectId: string;
      updatedAt?: string;
    }>;
  }>(`/api/projects/${projectId}/artifacts`);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All resources");
  const [subject, setSubject] = useState("All subjects");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [folder, setFolder] = useState("All folders");
  const [sort, setSort] = useState("Recent");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    const saved = localStorage.getItem(`ingenium.library-view.${projectId}`);
    if (saved === "list" || saved === "grid") setView(saved);
  }, [projectId]);
  function chooseView(value: "grid" | "list") {
    setView(value);
    localStorage.setItem(`ingenium.library-view.${projectId}`, value);
  }
  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ item: Resource }>(
        `/api/projects/${projectId}/resources/upload`,
        { method: "POST", body: form },
      );
      await remote.reload();
      router.push(`/projects/${projectId}/library/${result.item.id}`);
    } catch (e) {
      setError(safeError(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  if (resourceId)
    return <ResourceDetail projectId={projectId} resourceId={resourceId} />;
  const resources = (remote.data?.items || [])
    .filter(
      (r) =>
        matchesType(r.type, filter) &&
        (subject === "All subjects" || r.subject === subject) &&
        (!pinnedOnly || r.pinned) &&
        (folder === "All folders" || r.metadata?.folder === folder) &&
        `${r.title} ${r.subject} ${r.content || ""} ${Array.isArray(r.metadata?.tags) ? r.metadata.tags.join(" ") : ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "A–Z"
        ? a.title.localeCompare(b.title)
        : new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime(),
    );
  const folders = [
    ...new Set(
      (remote.data?.items || [])
        .map((r) => String(r.metadata?.folder || ""))
        .filter(Boolean),
    ),
  ];
  const savedArtifacts = (artifacts.data?.items || []).filter(
    (a) =>
      ["simulation", "lab"].includes(a.type) &&
      a.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="lib-page">
      <PageHeading
        eyebrow="YOUR KNOWLEDGE, TOGETHER"
        title="A little less searching."
        description="Your books, notes and discoveries. Right where you need them."
      >
        <button
          className="button button-ghost"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <LoaderCircle size={18} className="page-spin" />
          ) : (
            <Upload size={18} />
          )}
          Upload
        </button>
        <button
          className="button button-primary"
          onClick={() => setCreating(true)}
        >
          <Plus size={18} />
          Add resource
        </button>
      </PageHeading>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
        }}
      />
      <div className="lib-layout">
        <aside className="lib-sidebar">
          <h3>YOUR LIBRARY</h3>
          {resourceTypes.map((type, i) => {
            const Icon = [
              Folder,
              Pencil,
              FileText,
              BookOpen,
              Layers,
              FlaskConical,
              LinkIcon,
            ][i];
            return (
              <button
                className={filter === type ? "active" : ""}
                onClick={() => setFilter(type)}
                key={type}
              >
                <Icon size={18} />
                <span>{type}</span>
                {i === 0 && <small>{remote.data?.items.length || 0}</small>}
              </button>
            );
          })}
          <div className="lib-sidebar-divider" />
          <button
            className={pinnedOnly ? "active" : ""}
            onClick={() => setPinnedOnly(!pinnedOnly)}
          >
            <Bookmark size={18} />
            <span>Pinned</span>
          </button>
          <p>
            Everything here belongs to{" "}
            {project.data?.project.name || "this project"}.
          </p>
        </aside>
        <section className="lib-main">
          <div className="page-toolbar">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search this library…"
            />
            <select
              className="page-select"
              aria-label="Filter by subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option>All subjects</option>
              {project.data?.project.subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {folders.length > 0 && (
              <select
                className="page-select"
                aria-label="Library folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              >
                <option>All folders</option>
                {folders.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            )}
            <select
              className="page-select lib-sort"
              aria-label="Sort resources"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option>Recent</option>
              <option>A–Z</option>
            </select>
            <div className="page-segmented">
              <button
                className={view === "grid" ? "active" : ""}
                aria-label="Grid view"
                onClick={() => chooseView("grid")}
              >
                <Grid2X2 size={17} />
              </button>
              <button
                className={view === "list" ? "active" : ""}
                aria-label="List view"
                onClick={() => chooseView("list")}
              >
                <List size={18} />
              </button>
            </div>
          </div>
          <ErrorMessage
            message={error || remote.error}
            retry={() => void remote.reload()}
          />
          {remote.loading && !remote.data ? (
            <Loading />
          ) : (
            <>
              <div className="lib-section-label">
                <h2>{pinnedOnly ? "Pinned resources" : filter}</h2>
                <span>
                  {resources.length}{" "}
                  {resources.length === 1 ? "resource" : "resources"}
                </span>
              </div>
              <div className={`lib-resources lib-${view}`}>
                {resources.map((r) => {
                  return (
                    <article className="lib-resource" key={r.id}>
                      <Link
                        href={`/projects/${projectId}/library/${r.id}`}
                        className="lib-resource-main"
                      >
                        <div
                          className={`lib-resource-cover lib-cover-${r.type}`}
                        >
                          {resourceIcon(r.type, view === "grid" ? 34 : 24)}
                          {view === "grid" && (
                            <span>{r.subject || "PERSONAL LIBRARY"}</span>
                          )}
                        </div>
                        <div className="lib-resource-copy">
                          <span className="lib-resource-type">
                            {typeLabel(r.type)}
                          </span>
                          <h3>{r.title}</h3>
                          <p>
                            {r.description ||
                              r.subject ||
                              "Saved in this project"}
                          </p>
                        </div>
                      </Link>
                      <button
                        className={`page-icon-button lib-pin ${r.pinned ? "is-pinned" : ""}`}
                        aria-label={`${r.pinned ? "Unpin" : "Pin"} ${r.title}`}
                        onClick={async () => {
                          try {
                            await api(
                              `/api/projects/${projectId}/resources/${r.id}`,
                              json("PATCH", { pinned: !r.pinned }),
                            );
                            await remote.reload();
                          } catch (e) {
                            setError(safeError(e));
                          }
                        }}
                      >
                        <Bookmark
                          size={17}
                          fill={r.pinned ? "currentColor" : "none"}
                        />
                      </button>
                    </article>
                  );
                })}
              </div>
              {(filter === "Saved labs" || filter === "All resources") &&
                !pinnedOnly &&
                savedArtifacts.length > 0 && (
                  <>
                    <div className="lib-section-label">
                      <h2>Experiments you saved</h2>
                      <span>{savedArtifacts.length} variations</span>
                    </div>
                    <div className="lib-artifacts">
                      {savedArtifacts.map((a) => (
                        <Link
                          href={`/projects/${projectId}/artifacts/${a.id}`}
                          className="lib-artifact"
                          key={a.id}
                        >
                          <div className="lib-artifact-icon">
                            <FlaskConical size={23} />
                          </div>
                          <div>
                            <h3>{a.title}</h3>
                            <p>
                              Interactive experiment · reopen your saved state
                            </p>
                          </div>
                          <ArrowUpRight size={19} />
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              {!resources.length &&
                !(filter === "Saved labs" && savedArtifacts.length) && (
                  <Empty
                    title={
                      search
                        ? "No matching resources"
                        : "Make room for a good idea."
                    }
                    action={
                      <button
                        className="button button-primary"
                        onClick={() => setCreating(true)}
                      >
                        <Plus size={17} />
                        Add your first resource
                      </button>
                    }
                  >
                    {search
                      ? "Try another title or change your filters."
                      : "Save a note, add a book reference, or upload something you’re studying."}
                  </Empty>
                )}
            </>
          )}
        </section>
      </div>
      {creating && (
        <CreateResource
          projectId={projectId}
          subjects={project.data?.project.subjects || []}
          onClose={() => setCreating(false)}
          onSaved={(r) => {
            setCreating(false);
            router.push(`/projects/${projectId}/library/${r.id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateResource({
  projectId,
  subjects,
  onClose,
  onSaved,
}: {
  projectId: string;
  subjects: string[];
  onClose: () => void;
  onSaved: (r: Resource) => void;
}) {
  const [type, setType] = useState("note");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(subjects[0] || "");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [edition, setEdition] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Add to your library" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api<{ item: Resource }>(
              `/api/projects/${projectId}/resources`,
              json("POST", {
                title,
                type,
                subject,
                content,
                url: url || undefined,
                metadata: { author, edition },
              }),
            );
            onSaved(result.item);
          } catch (e) {
            setError(safeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="page-form-grid">
          <label className="page-field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="note">Study note</option>
              <option value="book">Book reference</option>
              <option value="module">Coaching module</option>
              <option value="link">Link</option>
            </select>
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
        <label className="page-field">
          Title
          <input
            autoFocus
            required
            maxLength={200}
            placeholder={
              type === "book"
                ? "e.g. Concepts of Physics, volume 1"
                : "Give this a useful name"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {type === "book" && (
          <div className="page-form-grid">
            <label className="page-field">
              Author
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
            <label className="page-field">
              Edition / volume
              <input
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
              />
            </label>
          </div>
        )}
        {type === "link" && (
          <label className="page-field">
            Web address
            <input
              required
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        )}
        <label className="page-field">
          {type === "note" ? "Your note" : "Notes and references"}
          <textarea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              type === "book"
                ? "Track chapters, exercises and your own notes. The book itself is not uploaded."
                : "Start with a thought. Markdown headings, lists and equations are welcome."
            }
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
          <button
            className="button button-primary"
            disabled={busy || !title.trim()}
          >
            {busy ? "Saving…" : "Save resource"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResourceDetail({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVersion = searchParams.get("version");
  const resourcePath = `/api/projects/${projectId}/resources/${resourceId}`;
  const readerPath = `/projects/${projectId}/library/${resourceId}`;
  const remote = useRemote<{ item: Resource }>(
    `${resourcePath}${requestedVersion !== null ? `?version=${encodeURIComponent(requestedVersion)}` : ""}`,
  );
  const [organise, setOrganise] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState("");
  const [preview, setPreview] = useState(false);
  const revisionRef = useRef(1);
  const savingRef = useRef(false);
  const lastSaved = useRef("");
  const resource = remote.data?.item;
  const versions = useRemote<{
    items: Array<{
      version: number;
      content: string;
      filename?: string;
      createdAt?: string;
    }>;
  }>(`/api/projects/${projectId}/resources/${resourceId}/versions`);
  const [viewVersion, setViewVersion] = useState<number | null>(
    requestedVersion && /^\d+$/.test(requestedVersion)
      ? Number(requestedVersion)
      : null,
  );
  useEffect(() => {
    setViewVersion(
      requestedVersion && /^\d+$/.test(requestedVersion)
        ? Number(requestedVersion)
        : null,
    );
  }, [requestedVersion]);
  const [replacing, setReplacing] = useState(false);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const historical = versions.data?.items.find(
    (v) => v.version === viewVersion,
  );
  const readOnly = Boolean(
    resource?.deleted || resource?.historical || viewVersion !== null,
  );
  async function replaceFile(file: File) {
    if (readOnly) return;
    setReplacing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/api/projects/${projectId}/resources/${resourceId}/upload`, {
        method: "POST",
        body: form,
      });
      setViewVersion(null);
      await remote.reload();
      await versions.reload();
    } catch (e) {
      setError(safeError(e));
    } finally {
      setReplacing(false);
      if (replaceFileRef.current) replaceFileRef.current.value = "";
    }
  }
  useEffect(() => {
    if (resource) {
      setTitle(resource.title);
      setContent(resource.content || "");
      revisionRef.current = resource.revision || 1;
      lastSaved.current = JSON.stringify([
        resource.title,
        resource.content || "",
      ]);
    }
  }, [resource]);
  const save = async () => {
    if (!resource || readOnly || savingRef.current || !title.trim()) return;
    const snapshot = JSON.stringify([title, content]);
    if (snapshot === lastSaved.current) return;
    savingRef.current = true;
    setStatus("Saving…");
    setError("");
    try {
      const r = await api<{ item: Resource }>(
        `/api/projects/${projectId}/resources/${resourceId}`,
        json("PATCH", { title, content, revision: revisionRef.current }),
      );
      revisionRef.current = r.item.revision || revisionRef.current + 1;
      lastSaved.current = snapshot;
      setStatus("Saved");
    } catch (e) {
      setStatus("Not saved");
      setError(safeError(e));
    } finally {
      savingRef.current = false;
    }
  };
  useEffect(() => {
    if (
      !resource ||
      readOnly ||
      !edit ||
      JSON.stringify([title, content]) === lastSaved.current
    )
      return;
    setStatus("Unsaved changes");
    const t = setTimeout(() => {
      void save();
    }, 900);
    return () => clearTimeout(t);
  }, [title, content, edit]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (
        !readOnly &&
        JSON.stringify([title, content]) !== lastSaved.current &&
        resource
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [title, content, resource]);
  if (remote.loading && !resource) return <Loading />;
  if (viewVersion !== null && versions.data && !historical)
    return (
      <div>
        <ErrorMessage message="This source version could not be found. No other version has been substituted." />
        <Link
          className="button button-ghost"
          href={`/projects/${projectId}/library/${resourceId}`}
        >
          Open the current source
        </Link>
      </div>
    );
  if (!resource)
    return (
      <ErrorMessage
        message={
          remote.error || "This resource could not be found in this project."
        }
        retry={() => void remote.reload()}
      />
    );
  const fileName = String(
    resource.metadata?.filename || resource.metadata?.originalName || "",
  );
  const hasFile = Boolean(
    resource.metadata?.storageKey ||
    resource.metadata?.fileId ||
    fileName ||
    ["document", "image", "pdf"].includes(resource.type),
  );
  const mime = String(
    resource.metadata?.mimeType || resource.metadata?.mime || "",
  );
  const insertion = (text: string) => {
    setContent((c) => `${c}${c ? "\n\n" : ""}${text}`);
    setEdit(true);
  };
  return (
    <div className="lib-detail">
      <Link className="page-back" href={`/projects/${projectId}/library`}>
        <ArrowLeft size={17} />
        Your library
      </Link>
      <header className="lib-detail-head">
        <div className="lib-detail-icon">{resourceIcon(resource.type, 28)}</div>
        <div>
          <span className="page-eyebrow">
            {typeLabel(resource.type)}
            {resource.subject ? ` · ${resource.subject}` : ""}
          </span>
          {edit && !readOnly ? (
            <input
              aria-label="Resource title"
              className="lib-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          ) : (
            <h1>{title}</h1>
          )}
        </div>
        <div className="lib-save-status" role="status">
          {status === "Saved" ? (
            <Check size={15} />
          ) : (
            <LoaderCircle size={15} />
          )}{" "}
          {resource.deleted
            ? "Preserved source"
            : readOnly
              ? "Read only"
              : status}
        </div>
      </header>
      {resource.deleted && (
        <div className="lib-deleted-source" role="status">
          <BookOpen size={19} />
          <div>
            <strong>Deleted source · preserved citation</strong>
            <p>
              This source was removed from your library. Version{" "}
              {resource.revision} remains available to explain existing
              citations. It cannot be edited.
            </p>
          </div>
        </div>
      )}
      <div className="lib-reader-actions">
        {!readOnly && (
          <StudyLink projectId={projectId} resourceId={resource.id} />
        )}
        {!resource.deleted && (
          <button
            className="button button-ghost"
            onClick={() => {
              if (readOnly) {
                setEdit(false);
                setViewVersion(null);
                router.replace(readerPath);
                return;
              }
              if (edit) void save();
              setEdit(!edit);
            }}
          >
            <Pencil size={16} />
            {edit ? "Read note" : readOnly ? "Open latest to edit" : "Edit"}
          </button>
        )}
        {!readOnly && (
          <>
            <button
              className="button button-ghost"
              onClick={() => setOrganise(true)}
            >
              <Folder size={16} />
              Organise
            </button>
            <button
              className="button button-ghost"
              onClick={() => setSchedule(true)}
            >
              <Plus size={16} />
              Schedule review
            </button>
          </>
        )}
        {hasFile ? (
          <a
            className="button button-ghost"
            href={`/api/projects/${projectId}/resources/${resourceId}/file${viewVersion ? `?version=${viewVersion}` : ""}`}
            download
          >
            <Download size={16} />
            Download
          </a>
        ) : (
          <button
            className="button button-ghost"
            onClick={() =>
              downloadText(
                `# ${title}\n\n${historical?.content ?? content}`,
                `${title.replace(/[^a-z0-9]/gi, "-")}.md`,
                "text/markdown",
              )
            }
          >
            <Download size={16} />
            Export
          </button>
        )}
        {!readOnly && (
          <button
            className="page-icon-button lib-delete-button"
            aria-label="Delete resource"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={17} />
          </button>
        )}
      </div>
      <ErrorMessage message={error} />
      {resource.type === "book" && (
        <div className="lib-book-meta">
          <BookOpen size={20} />
          <p>
            <strong>Book reference</strong>
            <br />
            {[resource.metadata?.author, resource.metadata?.edition]
              .filter(Boolean)
              .join(" · ") ||
              "Track your own copy and chapter references here."}{" "}
            This entry does not include the copyrighted book.
          </p>
        </div>
      )}
      {resource.type === "link" &&
        resource.url &&
        /^https?:\/\//.test(resource.url) && (
          <a
            className="lib-source-link"
            href={resource.url}
            target="_blank"
            rel="noreferrer"
          >
            <LinkIcon size={19} />
            {resource.url}
            <ArrowUpRight size={18} />
          </a>
        )}
      {resource.type === "video-note" &&
        Boolean(resource.metadata?.lessonId) && (
          <Link
            className="lib-source-link"
            href={`/projects/${projectId}/cramazon/${resource.metadata?.lessonId}?t=${resource.metadata?.timestamp || 0}`}
          >
            <BookOpen size={18} />
            Open the lesson at{" "}
            {Math.floor(Number(resource.metadata?.timestamp || 0) / 60)}:
            {String(
              Math.floor(Number(resource.metadata?.timestamp || 0) % 60),
            ).padStart(2, "0")}
            <ArrowUpRight size={18} />
          </Link>
        )}
      {hasFile && (
        <div className="lib-file-panel">
          <div>
            <FileText size={21} />
            <span>
              <strong>{fileName || resource.title}</strong>
              <small>
                File stored ·{" "}
                {resource.extractionStatus ||
                resource.metadata?.extractionStatus
                  ? String(
                      resource.extractionStatus ||
                        resource.metadata?.extractionStatus,
                    ).replaceAll("_", " ")
                  : content
                    ? "Text available"
                    : "No extracted text; add a manual transcription below."}
              </small>
            </span>
            <button
              className="button button-ghost"
              onClick={() => setPreview(!preview)}
            >
              {preview ? "Close preview" : "Preview file"}
            </button>
          </div>
          {preview &&
            (mime.startsWith("image") || resource.type === "image" ? (
              <img
                className="lib-file-image"
                src={`/api/projects/${projectId}/resources/${resourceId}/file${viewVersion ? `?version=${viewVersion}` : ""}`}
                alt={resource.title}
              />
            ) : (
              <iframe
                title={`${resource.title} document preview`}
                src={`/api/projects/${projectId}/resources/${resourceId}/file${viewVersion ? `?version=${viewVersion}` : ""}`}
                className="lib-file-frame"
              />
            ))}
        </div>
      )}
      <div className="lib-version-toolbar">
        <span>
          {historical
            ? `Viewing version ${historical.version} · read only`
            : `Current version ${revisionRef.current}`}
        </span>
        {(versions.data?.items.length || 0) > 1 && (
          <select
            className="page-select"
            aria-label="Source version"
            value={viewVersion ?? ""}
            onChange={(e) => {
              setViewVersion(e.target.value ? Number(e.target.value) : null);
              setEdit(false);
              router.replace(
                `${readerPath}${e.target.value ? `?version=${e.target.value}` : ""}`,
              );
            }}
          >
            {!resource.deleted && <option value="">Latest version</option>}
            {versions.data?.items.map((v) => (
              <option key={v.version} value={v.version}>
                Version {v.version}
                {v.createdAt
                  ? ` · ${new Date(v.createdAt).toLocaleDateString("en-AU")}`
                  : ""}
              </option>
            ))}
          </select>
        )}
        {hasFile && !readOnly && (
          <>
            <input
              ref={replaceFileRef}
              hidden
              type="file"
              accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                if (e.target.files?.[0]) void replaceFile(e.target.files[0]);
              }}
            />
            <button
              className="button button-ghost"
              disabled={replacing}
              onClick={() => replaceFileRef.current?.click()}
            >
              <Upload size={15} />
              {replacing ? "Uploading…" : "Replace source"}
            </button>
          </>
        )}
      </div>
      {historical && (
        <p className="page-help">
          This version is preserved for historical source references.
          {!resource.deleted && " Open the latest version to edit."}
        </p>
      )}
      <article className="lib-note-paper">
        {edit && !readOnly ? (
          <>
            <div className="lib-editor-toolbar">
              <button onClick={() => insertion("## Heading")}>Heading</button>
              <button onClick={() => insertion("- List item")}>List</button>
              <button onClick={() => insertion("- [ ] To do")}>
                Checklist
              </button>
              <button onClick={() => insertion("$$ E = mc^2 $$")}>
                Equation
              </button>
              <button
                onClick={() => insertion("[Source title](https://example.com)")}
              >
                Link
              </button>
              <button onClick={() => void save()}>
                <Save size={15} />
                Save
              </button>
            </div>
            <textarea
              aria-label="Note content"
              className="lib-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Put your understanding into your own words…"
            />
          </>
        ) : (
          <div className="lib-note-text">
            {(historical?.content ?? content) ? (
              <RichText text={historical?.content ?? content} />
            ) : (
              <div className="lib-blank-note">
                <Pencil size={28} />
                <h2>
                  {readOnly ? "No text in this version." : "A fresh page."}
                </h2>
                <p>
                  {readOnly
                    ? "This preserved source version contains no extracted or written text."
                    : "Add your notes, chapter references or manual transcription."}
                </p>
                {!readOnly && (
                  <button
                    className="button button-ghost"
                    onClick={() => setEdit(true)}
                  >
                    Start writing <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </article>
      {resource.type === "question-collection" &&
        Array.isArray(resource.metadata?.questionIds) && (
          <div className="lib-linked-items">
            <h2>Questions in this collection</h2>
            {(resource.metadata.questionIds as string[]).map((id, i) => (
              <Link
                key={id}
                href={`/projects/${projectId}/study?tool=practice&question=${id}`}
              >
                <FileText size={17} />
                Question {i + 1}
                <ArrowUpRight size={17} />
              </Link>
            ))}
          </div>
        )}
      {resource.type === "lesson-collection" &&
        Array.isArray(resource.metadata?.lessonIds) && (
          <div className="lib-linked-items">
            <h2>Lessons in this collection</h2>
            {(resource.metadata.lessonIds as string[]).map((id, i) => (
              <Link key={id} href={`/projects/${projectId}/cramazon/${id}`}>
                <BookOpen size={17} />
                Lesson {i + 1}
                <ArrowUpRight size={17} />
              </Link>
            ))}
          </div>
        )}
      {organise && !readOnly && (
        <OrganiseResource
          projectId={projectId}
          resource={resource}
          onClose={() => setOrganise(false)}
          onSaved={() => {
            setOrganise(false);
            void remote.reload();
            void versions.reload();
          }}
        />
      )}
      {deleting && !readOnly && (
        <Modal title="Delete this resource?" onClose={() => setDeleting(false)}>
          <p>
            Remove “{title}” from this project’s library? Historical source
            versions are retained for existing citations.
          </p>
          <ErrorMessage message={error} />
          <div className="page-dialog-actions">
            <button
              className="button button-ghost"
              onClick={() => setDeleting(false)}
            >
              Keep resource
            </button>
            <button
              className="button page-danger"
              onClick={async () => {
                try {
                  await api(
                    `/api/projects/${projectId}/resources/${resourceId}`,
                    { method: "DELETE" },
                  );
                  router.push(`/projects/${projectId}/library`);
                } catch (e) {
                  setError(safeError(e));
                }
              }}
            >
              Delete resource
            </button>
          </div>
        </Modal>
      )}
      {schedule && !readOnly && (
        <Modal title="Make time to review" onClose={() => setSchedule(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  `/api/projects/${projectId}/tasks`,
                  json("POST", {
                    title: `Review: ${title}`,
                    date,
                    time: "16:00",
                    duration: 25,
                    type: "revision",
                    status: "pending",
                    subject: resource.subject,
                    resourceId: resource.id,
                  }),
                );
                setSchedule(false);
              } catch (e) {
                setError(safeError(e));
              }
            }}
          >
            <p>This review will appear in your project calendar.</p>
            <label className="page-field">
              Review date
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <ErrorMessage message={error} />
            <div className="page-dialog-actions">
              <button className="button button-primary">Schedule review</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export { LibraryPage };

function OrganiseResource({
  projectId,
  resource,
  onClose,
  onSaved,
}: {
  projectId: string;
  resource: Resource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [folder, setFolder] = useState(String(resource.metadata?.folder || ""));
  const [tags, setTags] = useState(
    Array.isArray(resource.metadata?.tags)
      ? resource.metadata.tags.join(", ")
      : "",
  );
  const [subject, setSubject] = useState(resource.subject || "");
  const [topic, setTopic] = useState(String(resource.metadata?.topic || ""));
  const [author, setAuthor] = useState(String(resource.metadata?.author || ""));
  const [edition, setEdition] = useState(
    String(resource.metadata?.edition || ""),
  );
  const [institute, setInstitute] = useState(
    String(resource.metadata?.institute || ""),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="A place for this resource" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              `/api/projects/${projectId}/resources/${resource.id}`,
              json("PATCH", {
                subject,
                revision: resource.revision,
                metadata: {
                  ...resource.metadata,
                  folder,
                  tags: tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  topic,
                  author,
                  edition,
                  institute,
                },
              }),
            );
            onSaved();
          } catch (e) {
            setError(safeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="page-form-grid">
          <label className="page-field">
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="page-field">
            Topic
            <input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
        </div>
        <label className="page-field">
          Folder
          <input
            autoFocus
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="e.g. Mechanics revision"
          />
        </label>
        <label className="page-field">
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="formulas, revision, chapter 3"
          />
          <small>
            Separate tags with commas. They are searchable in your library.
          </small>
        </label>
        {resource.type === "book" && (
          <div className="page-form-grid">
            <label className="page-field">
              Author
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
            <label className="page-field">
              Edition / volume
              <input
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
              />
            </label>
          </div>
        )}
        {["module", "collection"].includes(resource.type) && (
          <label className="page-field">
            Institute / course
            <input
              value={institute}
              onChange={(e) => setInstitute(e.target.value)}
            />
          </label>
        )}
        <ErrorMessage message={error} />
        <div className="page-dialog-actions">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
