"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Trash2,
  Pencil,
  Orbit,
  ArrowUpRight,
  BookOpen,
  Search,
  NotebookPen,
  Check,
  ExternalLink,
  X,
  FileQuestion,
  Layers,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { api, json } from "@/lib/api";
import type { Project, Conversation, Message } from "@/lib/types";
import type { ToolId } from "@/lib/tools";
import { STUDY_TOOLS } from "@/lib/tools";
import { Modal, ErrorBox, Loading, StarMark } from "./ui";
import Composer, { type Attachment } from "./study/Composer";
import dynamic from "next/dynamic";
import RichText from "./RichText";
const LabWorkspace = dynamic(
  () => import("./learning/LabWorkspace").then((m) => m.LabWorkspace),
  { loading: () => <Loading /> },
);
const PracticeWorkspace = dynamic(
  () => import("./learning/PracticeWorkspace").then((m) => m.PracticeWorkspace),
  { loading: () => <Loading /> },
);
const TestWorkspace = dynamic(
  () => import("./learning/TestWorkspace").then((m) => m.TestWorkspace),
  { loading: () => <Loading /> },
);
const FlashcardWorkspace = dynamic(
  () =>
    import("./learning/FlashcardWorkspace").then((m) => m.FlashcardWorkspace),
  { loading: () => <Loading /> },
);
export default function Study({
  project,
  conversationId,
}: {
  project: Project;
  conversationId?: string;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    base = `/projects/${project.id}`;
  const initialTool = (params.get("tool") || "ask") as ToolId;
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState(false),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(""),
    [rename, setRename] = useState<Conversation | null>(null),
    [title, setTitle] = useState(""),
    [tool, setTool] = useState<ToolId>(initialTool),
    [ai, setAi] = useState(false),
    [note, setNote] = useState(false),
    [noteTitle, setNoteTitle] = useState(""),
    [noteBody, setNoteBody] = useState(""),
    [saved, setSaved] = useState(""),
    [updates, setUpdates] = useState(false),
    [removing, setRemoving] = useState<Conversation | null>(null);
  const controller = useRef<AbortController | null>(null),
    messagesEnd = useRef<HTMLDivElement>(null);
  const refreshList = () =>
    api(`/api/projects/${project.id}/conversations`).then((r) =>
      setConversations(r.items),
    );
  useEffect(() => {
    refreshList().catch((e) => setError(e.message));
    api("/api/capabilities")
      .then((r) => setAi(!!r.ai))
      .catch(() => {});
  }, [project.id]);
  useEffect(() => {
    setTool(initialTool);
  }, [initialTool]);
  useEffect(() => {
    let active = true;
    setError("");
    setConversation(null);
    if (!conversationId) return;
    setLoading(true);
    api(`/api/projects/${project.id}/conversations/${conversationId}`)
      .then((r) => {
        if (active) setConversation(r.item);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id, conversationId]);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }, [conversation?.messages?.length]);
  useEffect(() => () => controller.current?.abort(), []);
  const selectTool = (id: ToolId) => {
    if (id === "notes") {
      setNote(true);
      return;
    }
    if (id === "updates") {
      setUpdates(true);
      return;
    }
    const destinations: Record<string, string> = {
      plan: "calendar?plan=1",
      lessons: "cramazon",
      progress: "progress",
      sources: "library",
    };
    if (destinations[id]) {
      router.push(`${base}/${destinations[id]}`);
      return;
    }
    setTool(id);
  };
  const send = async (
    content: string,
    mode: ToolId,
    attachments: Attachment[],
    retryOf?: string,
    subject?: string,
  ) => {
    if (["visualise", "practice", "test", "revise"].includes(mode)) {
      selectTool(mode);
      return;
    }
    if (mode === "notes") {
      setNoteTitle(content.slice(0, 80));
      setNoteBody(content);
      setNote(true);
      return;
    }
    if (["plan", "lessons", "progress", "sources", "updates"].includes(mode)) {
      selectTool(mode);
      return;
    }
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    let cid = conversationId || conversation?.id;
    try {
      if (!cid) {
        const { item } = await api(
          `/api/projects/${project.id}/conversations`,
          {
            method: "POST",
            body: json({
              title: content.slice(0, 70) || "A new question",
              subject: subject || project.subjects[0],
            }),
          },
        );
        cid = item.id;
        setConversation({ ...item, messages: [] });
      }
      if (ai) {
        const response = await fetch(
          `/api/projects/${project.id}/conversations/${cid}/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: json({ content, attachments, tool: mode, retryOf, subject }),
            signal: controller.current.signal,
          },
        );
        if (!response.ok) {
          const e = await response.json();
          throw new Error(
            e.error ||
              "Could not start the response. Your draft is still here.",
          );
        }
        const reader = response.body!.getReader(),
          decoder = new TextDecoder();
        const userMessage = {
          id: `pending-user-${Date.now()}`,
          role: "user",
          content,
        };
        setConversation((c) =>
          c
            ? {
                ...c,
                messages: retryOf
                  ? (c.messages || []).map((m) =>
                      m.id === retryOf
                        ? {
                            ...m,
                            id: "streaming",
                            content: "",
                            status: "generating",
                          }
                        : m,
                    )
                  : [
                      ...(c.messages || []),
                      userMessage,
                      {
                        id: "streaming",
                        role: "assistant",
                        content: "",
                        status: "generating",
                      },
                    ],
              }
            : c,
        );
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setConversation((c) =>
            c
              ? {
                  ...c,
                  messages: c.messages?.map((m) =>
                    m.id === "streaming"
                      ? { ...m, content: m.content + chunk }
                      : m,
                  ),
                }
              : c,
          );
        }
      } else
        await api(`/api/projects/${project.id}/conversations/${cid}/messages`, {
          method: "POST",
          body: json({ content, tool: mode, attachments, subject }),
          signal: controller.current.signal,
        });
      sessionStorage.removeItem(
        `ingenium-draft-${project.id}-${conversationId || "new"}`,
      );
      const result = await api(
        `/api/projects/${project.id}/conversations/${cid}`,
      );
      setConversation(result.item);
      await refreshList();
      if (!conversationId) router.replace(`${base}/study/${cid}`);
      return true;
    } catch (e: any) {
      if (e.name === "AbortError") {
        setError(
          "Generation stopped. Saved messages are kept in this conversation.",
        );
        if (cid)
          api(`/api/projects/${project.id}/conversations/${cid}`)
            .then((r) => setConversation(r.item))
            .catch(() => {});
      } else setError(e.message);
      return false;
    } finally {
      setBusy(false);
      controller.current = null;
    }
  };
  const rich = ["visualise", "practice", "test", "revise"].includes(tool);
  const enabled = (project.settings?.enabledTools as string[] | undefined)?.map(
    (t) => (t === "practise" ? "practice" : t),
  );
  const starters = [
    {
      id: "ask",
      icon: MessageCircle,
      title: "Make it click",
      detail: "Talk through a tricky concept",
    },
    {
      id: "visualise",
      icon: Orbit,
      title: "See the idea",
      detail: "Explore an interactive model",
    },
    {
      id: "practice",
      icon: FileQuestion,
      title: "Try a question",
      detail: "Find out what you understand",
    },
    {
      id: "revise",
      icon: Layers,
      title: "Bring it back",
      detail: "A little practice remembering",
    },
  ].filter((t) => !enabled || enabled.includes(t.id));
  return (
    <div
      className={`study-layout ${history ? "history-open" : ""} ${rich ? "study-expanded" : ""}`}
    >
      <aside className={`study-history ${history ? "open" : ""}`}>
        <div className="history-heading">
          <span>Your conversations</span>
          <button
            className="icon-button"
            aria-label="Close history"
            onClick={() => setHistory(false)}
          >
            <PanelLeftClose size={19} />
          </button>
        </div>
        <Link
          className="button new-conversation"
          href={`${base}/study`}
          onClick={() => {
            setTool("ask");
            setHistory(false);
          }}
        >
          <Plus size={18} />
          New conversation
        </Link>
        <label className="history-search">
          <Search size={15} />
          <input
            placeholder="Find a thought…"
            aria-label="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span className="menu-eyebrow">IN THIS PROJECT</span>
        {conversations
          .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned))
          .map((c) => (
            <div
              key={c.id}
              className={`history-item ${c.id === conversationId ? "selected" : ""}`}
            >
              <Link
                href={`${base}/study/${c.id}`}
                onClick={() => {
                  setTool("ask");
                  if (window.innerWidth < 900) setHistory(false);
                }}
              >
                <MessageCircle size={16} />
                <span>{c.title}</span>
                {c.pinned && <Pin size={12} />}
              </Link>
              <button
                aria-label={`Options for ${c.title}`}
                className="icon-button"
                onClick={() => setMenu(menu === c.id ? "" : c.id)}
              >
                <MoreHorizontal size={16} />
              </button>
              {menu === c.id && (
                <div className="popover history-menu">
                  <button
                    onClick={() => {
                      setRename(c);
                      setTitle(c.title);
                      setMenu("");
                    }}
                  >
                    <Pencil size={15} />
                    Rename
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await api(
                          `/api/projects/${project.id}/conversations/${c.id}`,
                          {
                            method: "PATCH",
                            body: json({ pinned: !c.pinned }),
                          },
                        );
                        await refreshList();
                        setMenu("");
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    <Pin size={15} />
                    {c.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    onClick={() => {
                      setRemoving(c);
                      setMenu("");
                    }}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        {!conversations.length && (
          <p className="fine-print">Your questions will find a home here.</p>
        )}
      </aside>
      <section className="study-main">
        <header className="study-toolbar">
          <button
            className="quiet-button"
            onClick={() => setHistory(!history)}
            aria-label="Toggle conversation history"
          >
            <PanelLeftOpen size={19} />
            <span>History</span>
          </button>
          <span>
            {rich
              ? STUDY_TOOLS.find((t) => t.id === tool)?.label
              : conversation?.title || "A fresh page"}
          </span>
          {rich ? (
            <button className="quiet-button" onClick={() => setTool("ask")}>
              <X size={17} />
              Back to Study
            </button>
          ) : (
            <Link className="quiet-button" href={`${base}/study`}>
              <Plus size={17} />
              New
            </Link>
          )}
        </header>
        {rich && enabled && !enabled.includes(tool) ? (
          <div className="empty-state">
            <h2>This tool is turned off.</h2>
            <p>
              You can enable it in project settings. Saved work is still
              available from your Library.
            </p>
            <Link className="button" href={`${base}/settings`}>
              Project settings
            </Link>
          </div>
        ) : rich ? (
          <div className="study-tool-workspace">
            {tool === "visualise" ? (
              <LabWorkspace projectId={project.id} />
            ) : tool === "practice" ? (
              <PracticeWorkspace
                projectId={project.id}
                topic={params.get("topic") || undefined}
                questionId={params.get("question") || undefined}
              />
            ) : tool === "test" ? (
              <TestWorkspace projectId={project.id} />
            ) : (
              <FlashcardWorkspace projectId={project.id} />
            )}
          </div>
        ) : (
          <>
            <div className="conversation-content">
              {loading ? (
                <Loading label="Opening your conversation…" />
              ) : conversation?.messages?.length ? (
                <>
                  <div className="conversation-title">
                    <span className="eyebrow">
                      {conversation.subject || project.name}
                    </span>
                    <h1>{conversation.title}</h1>
                    {conversation.sample && (
                      <span className="sample-label">
                        Sample conversation · Illustrative demo history
                      </span>
                    )}
                  </div>
                  {conversation.messages.map((m: Message, messageIndex) => (
                    <article key={m.id} className={`message message-${m.role}`}>
                      <div className="message-author">
                        {m.role === "user" ? (
                          <span className="message-avatar">A</span>
                        ) : (
                          <StarMark size={21} />
                        )}
                        <span>{m.role === "user" ? "You" : "Ingenium"}</span>
                        {m.status === "generating" && (
                          <LoaderCircle size={13} className="spin" />
                        )}
                        {m.status === "unavailable" && (
                          <span className="badge">AI not connected</span>
                        )}
                      </div>
                      <div className="message-body">
                        <RichText text={m.content} />
                        {Array.isArray(m.context) && m.context.length > 0 && (
                          <div className="message-sources">
                            {m.context.map((source, index) =>
                              source.id ? (
                                <Link
                                  key={source.id}
                                  href={`${base}/${source.type === "lesson" ? "cramazon" : "library"}/${encodeURIComponent(source.id)}${source.version ? "?version=" + source.version : ""}`}
                                >
                                  <BookOpen size={12} />
                                  {source.title || "Attached source"}
                                  {source.version
                                    ? ` · v${source.version}`
                                    : ""}
                                </Link>
                              ) : (
                                <span key={index}>{source.title}</span>
                              ),
                            )}
                          </div>
                        )}
                        {ai &&
                          m.role === "assistant" &&
                          ["failed", "cancelled", "interrupted"].includes(
                            m.status || "",
                          ) && (
                            <button
                              className="button"
                              disabled={busy}
                              onClick={() => {
                                const previous = conversation.messages
                                  ?.slice(0, messageIndex)
                                  .reverse()
                                  .find((x) => x.role === "user");
                                if (previous)
                                  send(previous.content, "ask", [], m.id);
                              }}
                            >
                              <RotateCcw size={15} />
                              Retry response
                            </button>
                          )}
                        {m.artifactId && (
                          <Link
                            className="inline-artifact"
                            href={`${base}/artifacts/${m.artifactId}`}
                          >
                            <Orbit size={28} />
                            <span>
                              <strong>Explore this idea</strong>
                              <small>Open the saved interactive artifact</small>
                            </span>
                            <ArrowUpRight size={20} />
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                  {conversation.sample && (
                    <div className="study-suggestion">
                      <Orbit size={23} />
                      <div>
                        <strong>What happens if you change the angle?</strong>
                        <p>
                          Explore the same question in a live projectile model.
                        </p>
                      </div>
                      <button
                        className="button"
                        onClick={() => selectTool("visualise")}
                      >
                        Open lab
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  )}
                  <div ref={messagesEnd} />
                </>
              ) : (
                <div className="study-welcome">
                  <div className="study-star">
                    <StarMark size={43} />
                  </div>
                  <span className="eyebrow">
                    A LITTLE CURIOSITY GOES A LONG WAY
                  </span>
                  <h1>
                    What would you like
                    <br />
                    to understand today?
                  </h1>
                  <p>
                    A question, a difficult concept, a new way of seeing things.
                    <br />
                    This is your space to figure it out.
                  </p>
                  <div className="study-starters">
                    {starters.map(({ id, icon: Icon, title, detail }) => (
                      <button
                        key={id}
                        onClick={() => {
                          if (id === "ask") {
                            document
                              .querySelector<HTMLTextAreaElement>(
                                ".composer textarea",
                              )
                              ?.focus();
                          } else selectTool(id as ToolId);
                        }}
                      >
                        <Icon size={23} />
                        <strong>{title}</strong>
                        <span>{detail}</span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                  <div className="project-context">
                    <span className="status-dot" />
                    {project.name}
                    <span>·</span>
                    {project.subjects.join(" · ")}
                  </div>
                </div>
              )}
            </div>
            <div className="study-composer-area">
              {error && <ErrorBox message={error} />}
              <Composer
                key={`${conversationId || "new"}-${saved}`}
                projectId={project.id}
                conversationId={conversationId}
                resourceId={params.get("resource") || undefined}
                lessonId={params.get("lesson") || undefined}
                onSend={(text, mode, attachments, subject) =>
                  send(text, mode, attachments, undefined, subject)
                }
                onTool={selectTool}
                busy={busy}
                onStop={() => controller.current?.abort()}
                initialTool={tool}
                enabledTools={enabled}
              />
              <div className="composer-footnote">
                {ai
                  ? "Ingenium can make mistakes. Check important steps and sources."
                  : "Open-ended AI is not connected. Labs, practice, notes and planning are ready to use."}
              </div>
            </div>
          </>
        )}
      </section>
      {rename && (
        <Modal title="Name this conversation" onClose={() => setRename(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  `/api/projects/${project.id}/conversations/${rename.id}`,
                  { method: "PATCH", body: json({ title }) },
                );
                await refreshList();
                if (conversation?.id === rename.id)
                  setConversation({ ...conversation, title });
                setRename(null);
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            <label className="field">
              Conversation name
              <input
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <button className="button button-primary">Save name</button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Delete this conversation?"
          onClose={() => setRemoving(null)}
        >
          <p>
            “{removing.title}” and its messages will be removed. Saved Library
            artifacts remain available.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setRemoving(null)}>
              Keep conversation
            </button>
            <button
              className="button button-danger"
              onClick={async () => {
                try {
                  await api(
                    `/api/projects/${project.id}/conversations/${removing.id}`,
                    { method: "DELETE" },
                  );
                  await refreshList();
                  if (conversationId === removing.id)
                    router.push(`${base}/study`);
                  setRemoving(null);
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
      {note && (
        <Modal
          title="Keep the important part"
          onClose={() => setNote(false)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { item } = await api(
                  `/api/projects/${project.id}/resources`,
                  {
                    method: "POST",
                    body: json({
                      title: noteTitle,
                      content: noteBody,
                      type: "note",
                      subject: conversation?.subject || project.subjects[0],
                      metadata: { conversationId },
                    }),
                  },
                );
                setSaved(item.id);
                setNote(false);
                setNoteTitle("");
                setNoteBody("");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            <label className="field">
              Note title
              <input
                autoFocus
                required
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="A thought worth keeping"
              />
            </label>
            <label className="field">
              Your notes
              <textarea
                required
                rows={10}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Write in your own words. Markdown headings and lists are welcome."
              />
            </label>
            <button className="button button-primary">
              <NotebookPen size={17} />
              Save to Library
            </button>
          </form>
        </Modal>
      )}
      {saved && (
        <div role="status" className="toast">
          <Check size={17} />
          Note saved to Library
          <Link href={`${base}/library/${saved}`}>Open</Link>
          <button aria-label="Dismiss" onClick={() => setSaved("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {updates && (
        <Modal
          title="Straight from the source"
          onClose={() => setUpdates(false)}
        >
          <p className="muted">
            {project.projectKind === "course" ||
            project.projectKind === "school"
              ? `Check ${project.institution || "your institution"} for the current ${project.courseCode || project.qualification || "course"} outline, assessment rules and dates.`
              : "Use your institution or examination provider’s official materials for verified notices and dates."}{" "}
            No live notice feed is connected.
          </p>
          <div className="official-links">
            {(/\bjee\b/i.test(project.exam)
              ? [
                  [
                    "JEE Main · National Testing Agency",
                    "https://jeemain.nta.nic.in",
                  ],
                  ["JEE Advanced", "https://jeeadv.ac.in"],
                ]
              : /\bneet\b/i.test(project.exam)
                ? [["National Medical Commission", "https://www.nmc.org.in"]]
                : []
            ).map(([label, href]) => (
              <a key={href} href={href} target="_blank" rel="noreferrer">
                <BookOpen size={20} />
                {label}
                <ExternalLink size={17} />
              </a>
            ))}
            <Link href={`${base}/library`}>
              <BookOpen size={20} />
              Keep your official sources in Library
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
