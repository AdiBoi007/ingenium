"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Pause,
  PenLine,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react";
import { api, json } from "../../lib/api";
import { Empty, ErrorBox, Loading, Modal } from "../ui";
type Flashcard = {
  id: string;
  front: string;
  back: string;
  subject: string;
  topic: string;
  deck: string;
  dueDate: string;
  suspended: boolean;
  intervalDays: number;
  reviewCount: number;
};
export function FlashcardWorkspace({ projectId }: { projectId: string }) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [view, setView] = useState("due");
  const [deck, setDeck] = useState("");
  const [editing, setEditing] = useState<Flashcard | true | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(0);
  const today = new Date().toLocaleDateString("en-CA");
  const visible = cards.filter(
    (c) =>
      (!deck || c.deck === deck) &&
      (view === "suspended"
        ? c.suspended
        : !c.suspended &&
          (view === "all" || !c.dueDate || c.dueDate.slice(0, 10) <= today)),
  );
  const card = visible[Math.min(index, visible.length - 1)];
  const decks = [...new Set(cards.map((c) => c.deck))];
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api<{ items: Flashcard[] }>(
        `/api/projects/${projectId}/flashcards`,
      );
      setCards(r.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
    api<{ project: { subjects: string[] } }>(`/api/projects/${projectId}`)
      .then((r) => setSubjects(r.project.subjects))
      .catch(() => {});
  }, [load, projectId]);
  useEffect(() => {
    setFlipped(false);
  }, [card?.id]);
  const rate = useCallback(
    async (rating: "again" | "hard" | "good" | "easy") => {
      if (!card || !flipped || busy) return;
      setBusy(true);
      setError("");
      try {
        const r = await api<{ item: Flashcard }>(
          `/api/projects/${projectId}/reviews`,
          { method: "POST", body: json({ cardId: card.id, rating }) },
        );
        setCards((cs) => cs.map((c) => (c.id === card.id ? r.item : c)));
        setStatus(
          `Review saved. Next review: ${new Date(`${r.item.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}.`,
        );
        setReviewed((v) => v + 1);
        setFlipped(false);
        if (view === "all")
          setIndex((i) => Math.min(i + 1, visible.length - 1));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [card, flipped, busy, projectId, view, visible.length],
  );
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        editing ||
        (e.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName))
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      const rating = (
        { "1": "again", "2": "hard", "3": "good", "4": "easy" } as const
      )[e.key as "1"];
      if (rating && flipped) {
        e.preventDefault();
        void rate(rating);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [flipped, rate, editing]);
  async function suspend() {
    if (!card) return;
    setBusy(true);
    try {
      const r = await api<{ item: Flashcard }>(
        `/api/projects/${projectId}/flashcards/${card.id}`,
        { method: "PATCH", body: json({ suspended: !card.suspended }) },
      );
      setCards((cs) => cs.map((c) => (c.id === card.id ? r.item : c)));
      setStatus(
        card.suspended
          ? "Card resumed."
          : "Card suspended. Find it in Suspended.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const selected = cards.filter((c) => !deck || c.deck === deck);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            deck: deck || "All decks",
            cards: selected.map(({ front, back, subject, topic, deck }) => ({
              front,
              back,
              subject,
              topic,
              deck,
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ingenium-flashcards.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <section className="flash-workspace">
      <div className="learn-breadcrumb">
        <Link href={`/projects/${projectId}/study`}>
          <ArrowLeft size={16} />
          Study
        </Link>
        <span>/</span>
        <span>Revision</span>
      </div>
      <div className="lab-heading">
        <div>
          <p className="learn-eyebrow">MAKE THE IMPORTANT THINGS STICK</p>
          <h1>A moment to remember.</h1>
          <p>
            Small reviews, spaced thoughtfully. Recall first, then turn the
            card.
          </p>
        </div>
        <div className="learn-actions">
          <button
            className="button"
            onClick={download}
            disabled={!cards.length}
          >
            <Download size={16} />
            Export deck
          </button>
          <button
            className="button button-primary"
            onClick={() => setEditing(true)}
          >
            <Plus size={17} />
            Add flashcard
          </button>
        </div>
      </div>
      <div className="flash-filterbar">
        <div
          className="learn-tabs"
          role="tablist"
          aria-label="Flashcard status"
        >
          {[
            ["due", "Due for review"],
            ["all", "All cards"],
            ["suspended", "Suspended"],
          ].map(([key, label]) => (
            <button
              role="tab"
              aria-selected={view === key}
              className={view === key ? "active" : ""}
              key={key}
              onClick={() => {
                setView(key);
                setIndex(0);
              }}
            >
              {label}
              {key === "due" && (
                <span>
                  {
                    cards.filter(
                      (c) =>
                        !c.suspended &&
                        (!c.dueDate || c.dueDate.slice(0, 10) <= today),
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </div>
        <select
          aria-label="Flashcard deck"
          value={deck}
          onChange={(e) => {
            setDeck(e.target.value);
            setIndex(0);
          }}
        >
          <option value="">All decks</option>
          {decks.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      {error && <ErrorBox message={error} retry={load} />}
      <p className="learn-status" role="status">
        {status}
      </p>
      {loading ? (
        <Loading label="Getting your cards ready…" />
      ) : !card ? (
        <div className="panel">
          <Empty
            title={
              reviewed
                ? "A little more, remembered."
                : view === "due"
                  ? "You’re all caught up."
                  : "Your next idea belongs here."
            }
            detail={
              reviewed
                ? `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"} this session. Your next reviews have been scheduled.`
                : view === "due"
                  ? "There are no cards due in this view. Browse your deck or add something worth remembering."
                  : "Create a flashcard from a definition, formula or idea you want to keep."
            }
          >
            <button
              className="button"
              onClick={() => {
                setView("all");
                setDeck("");
              }}
            >
              Browse all cards
            </button>
            <button
              className="button button-primary"
              onClick={() => setEditing(true)}
            >
              Create a card
              <Plus size={17} />
            </button>
          </Empty>
        </div>
      ) : (
        <div className="flash-stage">
          <div className="flash-meta">
            <span>
              <Layers size={16} />
              {card.deck}
            </span>
            <span>
              {Math.min(index + 1, visible.length)} of {visible.length} cards
            </span>
          </div>
          <button
            className={`flash-card panel ${flipped ? "flipped" : ""}`}
            onClick={() => setFlipped(!flipped)}
            aria-label={flipped ? "Show question" : "Reveal answer"}
          >
            <span className="learn-eyebrow">
              {flipped
                ? "THE ANSWER"
                : `${card.subject}${card.topic ? " · " + card.topic : ""}`}
            </span>
            <span className="flash-card-content">
              {flipped ? card.back : card.front}
            </span>
            <span className="flash-card-hint">
              <RotateCcw size={16} />
              {flipped
                ? "Tap to return to the question"
                : "Think it through, then tap to reveal"}
              <kbd>space</kbd>
            </span>
          </button>
          <div className="flash-card-actions">
            <button
              className="button button-ghost"
              onClick={() => setEditing(card)}
            >
              <PenLine size={16} />
              Edit card
            </button>
            <button
              className="button button-ghost"
              onClick={suspend}
              disabled={busy}
            >
              {card.suspended ? <Play size={16} /> : <Pause size={16} />}{" "}
              {card.suspended ? "Resume" : "Suspend"}
            </button>
            <span>{card.reviewCount ?? 0} reviews recorded</span>
          </div>
          {flipped && !card.suspended ? (
            <div className="flash-rating">
              <p>How well did you remember?</p>
              <div>
                {[
                  ["again", "Again", "1 day", "1"],
                  [
                    "hard",
                    "Hard",
                    `${Math.max(1, Math.round(Math.max(1, card.intervalDays ?? 0) * 1.2))} days`,
                    "2",
                  ],
                  [
                    "good",
                    "Good",
                    `${Math.max(3, Math.round(Math.max(1, card.intervalDays ?? 0) * 2))} days`,
                    "3",
                  ],
                  [
                    "easy",
                    "Easy",
                    `${Math.max(7, Math.round(Math.max(1, card.intervalDays ?? 0) * 3))} days`,
                    "4",
                  ],
                ].map(([rating, label, next, key]) => (
                  <button
                    key={rating}
                    className={`flash-rating-${rating}`}
                    disabled={busy}
                    onClick={() =>
                      rate(rating as "again" | "hard" | "good" | "easy")
                    }
                  >
                    <strong>{label}</strong>
                    <span>{next}</span>
                    <kbd>{key}</kbd>
                  </button>
                ))}
              </div>
              <small>
                Your rating schedules the next review. Opening a card alone does
                not count.
              </small>
            </div>
          ) : (
            <div className="flash-next">
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
                disabled={index >= visible.length - 1}
                onClick={() => setIndex((i) => i + 1)}
              >
                Next card
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          <p className="learn-fineprint flash-rule">
            Review rule v1: Again → 1 day; Hard → 1.2× interval; Good → 2×
            (minimum 3 days); Easy → 3× (minimum 7 days). Intervals round to
            whole days.
          </p>
        </div>
      )}
      {editing && (
        <FlashcardEditor
          projectId={projectId}
          card={editing === true ? undefined : editing}
          subjects={subjects}
          decks={decks}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            setStatus("Flashcard saved to this project.");
          }}
        />
      )}
    </section>
  );
}
function FlashcardEditor({
  projectId,
  card,
  subjects,
  decks,
  onClose,
  onSaved,
}: {
  projectId: string;
  card?: Flashcard;
  subjects: string[];
  decks: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={card ? "Edit flashcard" : "Something worth remembering"}
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
            await api(
              `/api/projects/${projectId}/flashcards${card ? `/${card.id}` : ""}`,
              {
                method: card ? "PATCH" : "POST",
                body: json({
                  front: f.get("front"),
                  back: f.get("back"),
                  subject: f.get("subject"),
                  topic: f.get("topic"),
                  deck: f.get("deck"),
                }),
              },
            );
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Question or prompt
          <textarea
            className="input"
            name="front"
            rows={3}
            defaultValue={card?.front}
            required
            maxLength={200}
          />
        </label>
        <label>
          Answer
          <textarea
            className="input"
            name="back"
            rows={4}
            defaultValue={card?.back}
            required
            maxLength={12000}
          />
        </label>
        <div className="learn-form-columns">
          <label>
            Subject
            <select name="subject" defaultValue={card?.subject ?? subjects[0]}>
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
              defaultValue={card?.topic}
              placeholder="e.g. Kinematics"
            />
          </label>
        </div>
        <label>
          Deck
          <input
            className="input"
            name="deck"
            list="flashcard-decks"
            defaultValue={card?.deck ?? "My flashcards"}
            required
          />
          <datalist id="flashcard-decks">
            {decks.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        {error && <ErrorBox message={error} />}
        <div className="learn-modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save flashcard"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default FlashcardWorkspace;
