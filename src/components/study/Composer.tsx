"use client";
import { useState, useRef, useEffect } from "react";
import {
  Plus,
  ArrowUp,
  ChevronDown,
  MessageCircle,
  Calculator,
  Orbit,
  PenLine,
  Timer,
  Layers,
  NotebookPen,
  CalendarDays,
  Play,
  ChartNoAxesColumnIncreasing,
  Search,
  Bell,
  Upload,
  Camera,
  BookOpen,
  Link as LinkIcon,
  Tag,
  X,
  Check,
  Square,
  Undo2,
  Eraser,
  Trash2,
  FileText,
  LoaderCircle,
} from "lucide-react";
import { api, json } from "@/lib/api";
import { STUDY_TOOLS, type ToolId } from "@/lib/tools";
import { Modal, ErrorBox } from "../ui";
const toolIcons = {
  MessageCircle,
  Calculator,
  Orbit,
  PenLine,
  Timer,
  Layers,
  NotebookPen,
  CalendarDays,
  Play,
  ChartNoAxesColumnIncreasing,
  Search,
  Bell,
};
export type Attachment = { id: string; title: string; type: string };
type Props = {
  projectId: string;
  conversationId?: string;
  resourceId?: string;
  lessonId?: string;
  compact?: boolean;
  onSend: (
    text: string,
    tool: ToolId,
    attachments: Attachment[],
    subject?: string,
  ) => void | Promise<boolean | void>;
  onTool?: (tool: ToolId) => void;
  busy?: boolean;
  onStop?: () => void;
  initialTool?: ToolId;
  enabledTools?: string[];
};
export default function Composer({
  projectId,
  conversationId = "new",
  resourceId,
  lessonId,
  compact = false,
  onSend,
  onTool,
  busy,
  onStop,
  initialTool = "ask",
  enabledTools,
}: Props) {
  const [text, setText] = useState(""),
    [mode, setMode] = useState<ToolId>(initialTool),
    [menu, setMenu] = useState(""),
    [toolSearch, setToolSearch] = useState(""),
    [attachments, setAttachments] = useState<Attachment[]>([]),
    [dialog, setDialog] = useState(""),
    [items, setItems] = useState<any[]>([]),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [url, setUrl] = useState(""),
    [subject, setSubject] = useState(""),
    [subjects, setSubjects] = useState<string[]>([]);
  const plusRef = useRef<HTMLButtonElement>(null),
    toolRef = useRef<HTMLButtonElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null),
    areaRef = useRef<HTMLTextAreaElement>(null),
    menuRef = useRef<HTMLDivElement>(null);
  const draftKey = `ingenium-draft-${projectId}-${conversationId}`;
  useEffect(() => {
    setText(sessionStorage.getItem(draftKey) || "");
    setAttachments([]);
  }, [draftKey]);
  useEffect(() => setMode(initialTool), [initialTool]);
  useEffect(() => {
    let active = true;
    const rid = resourceId || lessonId;
    if (!rid) return;
    api(
      `/api/projects/${projectId}/${resourceId ? "resources" : "lessons"}/${rid}`,
    )
      .then(({ item }) => {
        if (active)
          setAttachments([
            {
              id: item.id,
              title: item.title,
              type: resourceId ? item.type : "lesson",
            },
          ]);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId, resourceId, lessonId]);
  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu("");
        (menu === "tools" ? toolRef : plusRef).current?.focus();
      }
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        const buttons = Array.from(
          menuRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled])",
          ) || [],
        );
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        buttons[
          (index + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
            buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [menu]);
  const edit = (v: string) => {
    setText(v);
    sessionStorage.setItem(draftKey, v);
  };
  const choose = (id: ToolId) => {
    setMode(id);
    setMenu("");
    setToolSearch("");
    onTool?.(id);
  };
  const submit = async () => {
    if ((!text.trim() && !attachments.length) || busy) return;
    const result = await onSend(
      text.trim(),
      mode,
      attachments,
      subject || undefined,
    );
    if (result === true) {
      edit("");
      setAttachments([]);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const data = new FormData();
      data.set("file", file);
      const { item } = await api(
        `/api/projects/${projectId}/resources/upload`,
        { method: "POST", body: data },
      );
      setAttachments((a) => [
        ...a,
        { id: item.id, title: item.title, type: item.type },
      ]);
      setDialog("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };
  const sources = async (type = "library") => {
    setMenu("");
    setDialog(type);
    setError("");
    try {
      const { items } = await api(`/api/projects/${projectId}/resources`);
      setItems(
        type === "notes"
          ? items.filter((i: any) => ["note", "artifact"].includes(i.type))
          : items,
      );
    } catch (e: any) {
      setError(e.message);
    }
  };
  const pickSubject = async () => {
    setMenu("");
    setDialog("subject");
    const { project } = await api(`/api/projects/${projectId}`);
    setSubjects(project.subjects);
  };
  const current = STUDY_TOOLS.find((t) => t.id === mode)!;
  return (
    <div className={`composer-wrap ${compact ? "composer-compact" : ""}`}>
      <div className="composer">
        {(attachments.length > 0 || subject) && (
          <div className="context-chips">
            {subject && (
              <span>
                <Tag size={13} />
                {subject}
                <button
                  aria-label="Remove subject"
                  onClick={() => setSubject("")}
                >
                  <X size={13} />
                </button>
              </span>
            )}
            {attachments.map((a) => (
              <span key={a.id}>
                <FileText size={13} />
                {a.title}
                <button
                  aria-label={`Remove ${a.title}`}
                  onClick={() =>
                    setAttachments((as) => as.filter((x) => x.id !== a.id))
                  }
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-row">
          <button
            ref={plusRef}
            className="composer-add"
            aria-label="Add context"
            title="Add context"
            aria-expanded={menu === "plus"}
            onClick={() => setMenu(menu === "plus" ? "" : "plus")}
          >
            <Plus size={23} />
          </button>
          <textarea
            ref={areaRef}
            value={text}
            rows={1}
            onChange={(e) => edit(e.target.value)}
            aria-label="Study message"
            placeholder={
              mode === "ask" ? "Ask, solve or visualise…" : `${current.label}…`
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                window.innerWidth > 600
              ) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            ref={toolRef}
            className="composer-tool"
            aria-label="Choose study tool"
            aria-expanded={menu === "tools"}
            onClick={() => setMenu(menu === "tools" ? "" : "tools")}
          >
            <span>
              {current.label === "Ask" ? "Ask" : current.label.split(" /")[0]}
            </span>
            <ChevronDown size={17} />
          </button>
          <button
            className="composer-send"
            onClick={busy ? onStop : submit}
            aria-label={busy ? "Stop generation" : "Send message"}
            disabled={!busy && !text.trim() && !attachments.length}
          >
            {busy ? (
              <Square size={17} />
            ) : uploading ? (
              <LoaderCircle size={19} className="spin" />
            ) : (
              <ArrowUp size={21} />
            )}
          </button>
        </div>
        {uploading && (
          <small className="upload-progress">Saving your attachment…</small>
        )}
      </div>
      {menu && (
        <>
          <button
            className="popover-dismiss"
            aria-label="Close composer menu"
            onClick={() => setMenu("")}
          />
          <div
            ref={menuRef}
            className={`composer-popover popover ${menu === "tools" ? "tools-menu" : ""}`}
            role="menu"
            aria-label={menu === "tools" ? "Study tools" : "Add context"}
          >
            {menu === "tools" ? (
              <>
                <label className="menu-search">
                  <Search size={17} />
                  <input
                    autoFocus
                    placeholder="Find a tool…"
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                  />
                </label>
                <div className="menu-scroll">
                  {STUDY_TOOLS.filter(
                    (t) =>
                      (!enabledTools || enabledTools.includes(t.id)) &&
                      `${t.label} ${t.description}`
                        .toLowerCase()
                        .includes(toolSearch.toLowerCase()),
                  ).map((t, i, arr) => {
                    const Icon = toolIcons[t.icon];
                    return (
                      <div key={t.id}>
                        {(i === 0 || arr[i - 1].group !== t.group) && (
                          <span className="menu-eyebrow">{t.group}</span>
                        )}
                        <button
                          className={mode === t.id ? "selected" : ""}
                          role="menuitemradio"
                          aria-checked={mode === t.id}
                          onClick={() => choose(t.id)}
                        >
                          <Icon size={21} />
                          <span>
                            <strong>{t.label}</strong>
                            <small>{t.description}</small>
                          </span>
                          {mode === t.id && <Check size={18} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <span className="menu-eyebrow">A LITTLE MORE CONTEXT</span>
                <button
                  role="menuitem"
                  onClick={() => {
                    fileRef.current?.click();
                    setMenu("");
                  }}
                >
                  <Upload size={21} />
                  <span>
                    <strong>Upload a file</strong>
                    <small>Documents, notes, or a question photo</small>
                  </span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    cameraRef.current?.click();
                    setMenu("");
                  }}
                >
                  <Camera size={21} />
                  <span>
                    <strong>Capture a photo</strong>
                    <small>
                      Camera on supported devices, or choose an image
                    </small>
                  </span>
                </button>
                <div className="menu-rule" />
                <button role="menuitem" onClick={() => sources()}>
                  <BookOpen size={21} />
                  <span>
                    <strong>Choose from Library</strong>
                    <small>Sources from this project</small>
                  </span>
                </button>
                <button role="menuitem" onClick={() => sources("notes")}>
                  <NotebookPen size={21} />
                  <span>
                    <strong>Attach a saved note</strong>
                    <small>Bring your own understanding along</small>
                  </span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu("");
                    setDialog("link");
                  }}
                >
                  <LinkIcon size={21} />
                  <span>
                    <strong>Add a link or reference</strong>
                    <small>A source to come back to</small>
                  </span>
                </button>
                <button role="menuitem" onClick={pickSubject}>
                  <Tag size={21} />
                  <span>
                    <strong>Select a subject</strong>
                    <small>Keep this question in context</small>
                  </span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu("");
                    setDialog("sketch");
                  }}
                >
                  <PenLine size={21} />
                  <span>
                    <strong>Sketch a diagram</strong>
                    <small>Sometimes a drawing says it better</small>
                  </span>
                </button>
              </>
            )}
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <ErrorBox message={error} />}
      {["library", "notes"].includes(dialog) && (
        <Modal
          title={
            dialog === "notes" ? "A note to build on" : "From your Library"
          }
          onClose={() => setDialog("")}
        >
          <div className="attachment-picker">
            {items.length ? (
              items.map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    setAttachments((a) =>
                      a.some((x) => x.id === i.id)
                        ? a
                        : [...a, { id: i.id, title: i.title, type: i.type }],
                    );
                    setDialog("");
                  }}
                >
                  <BookOpen size={22} />
                  <span>
                    <strong>{i.title}</strong>
                    <small>
                      {i.subject} · {i.type}
                    </small>
                  </span>
                  <Plus size={17} />
                </button>
              ))
            ) : (
              <p className="empty-note">
                No matching resources yet. Upload your first source using the +
                button.
              </p>
            )}
          </div>
        </Modal>
      )}
      {dialog === "subject" && (
        <Modal title="What are you exploring?" onClose={() => setDialog("")}>
          <div className="subject-choices">
            {subjects.map((s) => (
              <button
                className="button"
                key={s}
                onClick={() => {
                  setSubject(s);
                  setDialog("");
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === "link" && (
        <Modal title="Keep a source close" onClose={() => setDialog("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const parsed = new URL(url);
                if (!["https:", "http:"].includes(parsed.protocol))
                  throw new Error("Use an http or https link.");
                const { item } = await api(
                  `/api/projects/${projectId}/resources`,
                  {
                    method: "POST",
                    body: json({
                      title: parsed.hostname + parsed.pathname,
                      type: "link",
                      url,
                      description:
                        "Saved link. Contents have not been fetched or read.",
                    }),
                  },
                );
                setAttachments((a) => [
                  ...a,
                  { id: item.id, title: item.title, type: item.type },
                ]);
                setUrl("");
                setDialog("");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            <label className="field">
              Source URL
              <input
                type="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </label>
            <p className="fine-print">
              This saves a bookmark. It does not claim that the webpage has been
              read.
            </p>
            <button className="button button-primary" type="submit">
              Attach link
            </button>
          </form>
        </Modal>
      )}
      {dialog === "sketch" && (
        <Modal title="Give the idea a shape" onClose={() => setDialog("")} wide>
          <SketchPad onAttach={upload} uploading={uploading} />
        </Modal>
      )}
    </div>
  );
}
function SketchPad({
  onAttach,
  uploading,
}: {
  onAttach: (f: File) => void;
  uploading: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    history = useRef<ImageData[]>([]);
  const [erase, setErase] = useState(false);
  useEffect(() => {
    const c = canvas.current!,
      ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);
  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.current!.width) / r.width,
      ((e.clientY - r.top) * canvas.current!.height) / r.height,
    ];
  };
  return (
    <>
      <div className="sketch-tools">
        <button
          className={`button ${!erase ? "selected" : ""}`}
          onClick={() => setErase(false)}
        >
          <PenLine size={17} />
          Pen
        </button>
        <button
          className={`button ${erase ? "selected" : ""}`}
          onClick={() => setErase(true)}
        >
          <Eraser size={17} />
          Eraser
        </button>
        <button
          className="button"
          onClick={() => {
            const prev = history.current.pop();
            if (prev)
              canvas.current!.getContext("2d")!.putImageData(prev, 0, 0);
          }}
        >
          <Undo2 size={17} />
          Undo
        </button>
        <button
          className="button"
          onClick={() => {
            const c = canvas.current!,
              ctx = c.getContext("2d")!;
            history.current.push(ctx.getImageData(0, 0, c.width, c.height));
            ctx.fillStyle = "#fffdf8";
            ctx.fillRect(0, 0, c.width, c.height);
          }}
        >
          <Trash2 size={17} />
          Clear
        </button>
      </div>
      <canvas
        ref={canvas}
        className="sketch-canvas"
        width={1000}
        height={540}
        aria-label="Draw your diagram"
        onPointerDown={(e) => {
          const c = canvas.current!,
            ctx = c.getContext("2d")!;
          history.current.push(ctx.getImageData(0, 0, c.width, c.height));
          drawing.current = true;
          c.setPointerCapture(e.pointerId);
          const [x, y] = point(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current!.getContext("2d")!,
            [x, y] = point(e);
          ctx.strokeStyle = erase ? "#fffdf8" : "#223432";
          ctx.lineWidth = erase ? 24 : 3;
          ctx.lineCap = "round";
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <div className="modal-actions">
        <button
          className="button button-primary"
          disabled={uploading}
          onClick={() =>
            canvas.current!.toBlob((blob) => {
              if (blob)
                onAttach(
                  new File([blob], "Study sketch.png", { type: "image/png" }),
                );
            }, "image/png")
          }
        >
          {uploading ? "Attaching…" : "Attach sketch"}
        </button>
      </div>
    </>
  );
}
