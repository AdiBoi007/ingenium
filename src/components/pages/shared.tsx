"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  X,
  AlertCircle,
  LoaderCircle,
  Search,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

export type Project = {
  id: string;
  name: string;
  exam: string;
  description?: string;
  subjects: string[];
  targetDate?: string;
  archived?: boolean;
  pinned?: boolean;
  accent?: string;
  settings?: Record<string, unknown>;
};
export type Resource = {
  id: string;
  projectId: string;
  title: string;
  type: string;
  subject?: string;
  content?: string;
  description?: string;
  pinned?: boolean;
  url?: string;
  metadata?: Record<string, unknown>;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  extractionStatus?: string;
  deleted?: boolean;
  historical?: boolean;
  currentRevision?: number;
};
export type Lesson = {
  id: string;
  projectId: string;
  title: string;
  subject: string;
  topic?: string;
  channel?: string;
  videoId?: string;
  url?: string;
  duration?: number;
  position?: number;
  saved?: boolean;
  completed?: boolean;
  description?: string;
  metadata?: Record<string, unknown>;
};
export type Task = {
  id: string;
  projectId: string;
  title: string;
  date: string;
  time?: string;
  duration: number;
  subject?: string;
  type: string;
  status: string;
  timezone?: string;
  fixed?: boolean;
  priority?: string;
  resourceId?: string;
  recurrence?: unknown;
  seriesId?: string;
  questionId?: string;
  attemptId?: string;
  sessionId?: string;
};

export function useRemote<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<T>(url);
      if (requestId === generation.current) setData(result);
      return result;
    } catch (e) {
      if (requestId === generation.current)
        setError(e instanceof Error ? e.message : "Could not load this page.");
    } finally {
      if (requestId === generation.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    setData(null);
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-heading-actions">{children}</div>}
    </header>
  );
}
export function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return message ? (
    <div className="page-error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && (
        <button className="button button-ghost" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  ) : null;
}
export function Loading({
  label = "Opening your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="page-loading" role="status">
      <LoaderCircle size={20} className="page-spin" />
      {label}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-empty">
      <div className="page-empty-mark">✳</div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="page-search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          title="Clear search"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={16} />
        </button>
      )}
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const focus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      focus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`page-dialog ${wide ? "page-dialog-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="page-dialog-head">
        <h2>{title}</h2>
        <button
          className="page-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "en-AU",
    options || { day: "numeric", month: "short" },
  );
}
export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function downloadText(text: string, name: string, type = "text/plain") {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
export function StudyLink({
  projectId,
  resourceId,
  lessonId,
  children = "Open in Study",
}: {
  projectId: string;
  resourceId?: string;
  lessonId?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      className="button button-ghost"
      href={`/projects/${projectId}/study?${resourceId ? `resource=${resourceId}` : lessonId ? `lesson=${lessonId}` : ""}`}
    >
      {children}
      <ArrowUpRight size={16} />
    </Link>
  );
}
export function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
export function safeError(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Could not save. Your changes are still here.";
}
export function secondsLabel(seconds = 0) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
