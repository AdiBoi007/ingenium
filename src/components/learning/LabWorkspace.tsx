"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FlaskConical,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, json } from "../../lib/api";
import { Loading, ErrorBox } from "../ui";
import {
  computeModel,
  formatValue,
  labs,
  validateParameters,
  type LabDefinition,
  type ModelId,
  type ModelResult,
  type Parameters,
} from "../../domain/science";

export function LabWorkspace({
  projectId,
  artifactId,
  initialModel = "projectile",
}: {
  projectId: string;
  artifactId?: string;
  initialModel?: string;
}) {
  const router = useRouter();
  const initial = labs.find((x) => x.id === initialModel) ?? labs[0];
  const [modelId, setModelId] = useState<ModelId>(initial.id);
  const [parameters, setParameters] = useState<Parameters>(initial.defaults);
  const [original, setOriginal] = useState<Parameters>(initial.defaults);
  const [validParameters, setValidParameters] = useState<Parameters>(
    initial.defaults,
  );
  const [title, setTitle] = useState(initial.title);
  const [savedId, setSavedId] = useState(artifactId);
  const [revision, setRevision] = useState<number | undefined>();
  const [loading, setLoading] = useState(!!artifactId);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("Scene");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [chooser, setChooser] = useState(false);
  const [controls, setControls] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [enabledSubjects, setEnabledSubjects] = useState<string[] | null>(null);
  const frame = useRef<number>(0);
  const model = labs.find((x) => x.id === modelId)!;
  const errors = useMemo(
    () => validateParameters(modelId, parameters),
    [modelId, parameters],
  );
  const result = useMemo(
    () => computeModel(modelId, validParameters),
    [modelId, validParameters],
  );
  useEffect(() => {
    api<{ project: { subjects: string[] } }>(`/api/projects/${projectId}`)
      .then((r) => setEnabledSubjects(r.project.subjects))
      .catch(() => {});
  }, [projectId]);
  useEffect(() => {
    if (!artifactId) return;
    let cancelled = false;
    setLoading(true);
    api<{
      item: {
        id: string;
        title: string;
        revision: number;
        payload: {
          modelId: ModelId;
          parameters: Parameters;
          originalInput: Parameters;
        };
      };
    }>(`/api/projects/${projectId}/artifacts/${artifactId}`)
      .then(({ item }) => {
        if (cancelled) return;
        const p = item.payload;
        if (
          !labs.some((l) => l.id === p.modelId) ||
          validateParameters(p.modelId, p.parameters).length
        )
          throw new Error(
            "This saved simulation uses an unsupported or invalid model version.",
          );
        setModelId(p.modelId);
        setParameters(p.parameters);
        setValidParameters(p.parameters);
        setOriginal(p.originalInput ?? p.parameters);
        setTitle(item.title);
        setSavedId(item.id);
        setRevision(item.revision);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, projectId]);
  useEffect(() => {
    if (!playing || !result.duration) return;
    let last = 0;
    const step = (stamp: number) => {
      if (last)
        setTime((t) => {
          const next = t + ((stamp - last) / 1000) * speed;
          if (next >= result.duration!) {
            setPlaying(false);
            return result.duration!;
          }
          return next;
        });
      last = stamp;
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, result.duration, speed]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChooser(false);
        setExpanded(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  function update(key: string, value: number | string) {
    if (saving) return;
    const next = { ...parameters, [key]: value };
    setParameters(next);
    setStatus("");
    setPlaying(false);
    setTime(0);
    if (!validateParameters(modelId, next).length) setValidParameters(next);
  }
  function changeModel(next: LabDefinition) {
    if (saving) return;
    setModelId(next.id);
    setParameters(next.defaults);
    setValidParameters(next.defaults);
    setOriginal(next.defaults);
    setTitle(next.title);
    setTime(0);
    setPlaying(false);
    setChooser(false);
    setSavedId(undefined);
    setRevision(undefined);
    setError("");
    setStatus("");
  }
  function restore() {
    if (saving) return;
    setParameters({ ...original });
    setValidParameters({ ...original });
    setTime(0);
    setPlaying(false);
    setStatus("Original values restored.");
  }
  async function save(variation = false) {
    if (errors.length || saving) return;
    setSaving(true);
    setError("");
    const payload = {
      schemaVersion: 1,
      modelId,
      modelVersion: 1,
      originalInput: original,
      parameters: validParameters,
      result,
      savedAt: new Date().toISOString(),
    };
    try {
      const updating = savedId && !variation;
      const r = await api<{ item: { id: string; revision: number } }>(
        `/api/projects/${projectId}/artifacts${updating ? `/${savedId}` : ""}`,
        {
          method: updating ? "PATCH" : "POST",
          body: json({
            title: variation ? `${title} · variation` : title,
            type: "simulation",
            payload,
            ...(updating ? { revision } : {}),
          }),
        },
      );
      setSavedId(r.item.id);
      setRevision(r.item.revision);
      if (variation) {
        setTitle(`${title} · variation`);
        router.push(`/projects/${projectId}/artifacts/${r.item.id}`);
      }
      setStatus(
        variation
          ? "Variation saved to your Library."
          : "Saved to your Library.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save this experiment.",
      );
    } finally {
      setSaving(false);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            title,
            modelId,
            modelVersion: 1,
            parameters: validParameters,
            originalInput: original,
            result,
            assumptions: model.assumptions,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${modelId}-experiment.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const available = labs.filter(
    (l) =>
      (!enabledSubjects ||
        enabledSubjects.includes(l.subject) ||
        enabledSubjects.includes("Engineering") ||
        enabledSubjects.includes("Engineering mathematics") ||
        enabledSubjects.includes("Mechanics")) &&
      `${l.title} ${l.subject}`.toLowerCase().includes(query.toLowerCase()),
  );
  if (loading) return <Loading label="Opening your saved experiment…" />;
  return (
    <section className={`lab-workspace ${expanded ? "lab-expanded" : ""}`}>
      <div className="learn-breadcrumb">
        <Link href={`/projects/${projectId}/study`}>
          <ArrowLeft size={16} />
          Study
        </Link>
        <span>/</span>
        <span>Visualise</span>
        <span className="learn-version">MODEL v1 · DETERMINISTIC</span>
      </div>
      <div className="lab-heading">
        <div>
          <p className="learn-eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</p>
          <input
            aria-label="Experiment title"
            disabled={saving}
            className="lab-title"
            value={title}
            maxLength={120}
            onChange={(e) => {
              setTitle(e.target.value);
              setStatus("");
            }}
          />
          <p>{model.description}</p>
        </div>
        <div className="learn-actions">
          <button
            className="button"
            disabled={saving}
            onClick={() => setChooser(!chooser)}
            aria-expanded={chooser}
          >
            <FlaskConical size={17} />
            Change experiment
            <ChevronDown size={14} />
          </button>
          <button
            className="button button-primary"
            onClick={() => save(false)}
            disabled={saving || !!errors.length}
          >
            {status.startsWith("Saved") ? (
              <Check size={17} />
            ) : (
              <Save size={17} />
            )}{" "}
            {saving ? "Saving…" : "Save experiment"}
          </button>
        </div>
      </div>
      {chooser && (
        <div className="lab-catalog panel">
          <div className="learn-row">
            <h3>Choose an experiment</h3>
            <button
              aria-label="Close experiment catalogue"
              className="icon-button"
              onClick={() => setChooser(false)}
            >
              <X size={18} />
            </button>
          </div>
          <input
            className="input"
            aria-label="Search experiments"
            placeholder="Search experiments or subjects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="lab-catalog-grid">
            {available.map((l) => (
              <button
                key={l.id}
                className={l.id === modelId ? "selected" : ""}
                onClick={() => changeModel(l)}
              >
                <span className="learn-eyebrow">{l.subject}</span>
                <strong>{l.title}</strong>
                <span>{l.description}</span>
              </button>
            ))}
          </div>
          {!available.length && (
            <p>No supported experiments match this project and search.</p>
          )}
        </div>
      )}
      {error && <ErrorBox message={error} />}
      <div role="status" className="learn-status">
        {status}
      </div>
      <div className={`lab-layout ${!controls ? "lab-without-controls" : ""}`}>
        <div className="lab-main panel">
          <div className="lab-toolbar">
            <div
              className="learn-tabs"
              role="tablist"
              aria-label="Experiment view"
            >
              {["Scene", "Graph", "Working"].map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={tab === v}
                  className={tab === v ? "active" : ""}
                  onClick={() => setTab(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="learn-actions">
              <button
                className="icon-button"
                aria-label={controls ? "Hide controls" : "Show controls"}
                onClick={() => setControls(!controls)}
              >
                <SlidersHorizontal size={18} />
              </button>
              <button
                className="icon-button"
                aria-label={expanded ? "Exit full screen" : "Expand experiment"}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <X size={18} /> : <Maximize2 size={18} />}
              </button>
            </div>
          </div>
          {!!errors.length && (
            <div className="lab-validation" role="alert">
              <strong>Showing the last valid values.</strong>
              {errors.map((e) => (
                <span key={e}>{e}</span>
              ))}
            </div>
          )}
          {tab === "Scene" ? (
            <LabScene
              model={model}
              p={validParameters}
              result={result}
              time={time}
            />
          ) : tab === "Graph" ? (
            <Graph model={model} p={validParameters} result={result} />
          ) : (
            <div className="lab-working">
              <p className="learn-eyebrow">FROM INPUT TO RESULT</p>
              <h2>The working, step by step.</h2>
              {result.working.map((line, i) => (
                <div key={line}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <p>{line}</p>
                </div>
              ))}
              {result.note && <p className="learn-notice">{result.note}</p>}
            </div>
          )}
          {model.timeDependent && (
            <div className="lab-playback">
              <button
                className="lab-play"
                aria-label={playing ? "Pause animation" : "Play animation"}
                disabled={!!errors.length || !result.duration}
                onClick={() => {
                  if (time >= Number(result.duration)) setTime(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <input
                aria-label="Simulation time"
                type="range"
                min={0}
                max={result.duration || 1}
                step={(result.duration || 1) / 1000}
                value={time}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(Number(e.target.value));
                }}
              />
              <span>{time.toFixed(2)} s</span>
              <select
                aria-label="Animation speed"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </div>
          )}
          <div className="lab-metrics">
            {result.metrics.map((m) => (
              <div key={m.label}>
                <span>{m.label}</span>
                <strong>
                  {formatValue(m.value)}
                  {typeof m.value === "number" && m.unit && (
                    <small> {m.unit}</small>
                  )}
                </strong>
              </div>
            ))}
          </div>
        </div>
        {controls && (
          <aside className="lab-controls panel">
            <div className="learn-row">
              <h3>Make it your own</h3>
              <button
                className="icon-button"
                disabled={saving}
                onClick={restore}
                title="Restore original values"
                aria-label="Restore original values"
              >
                <RotateCcw size={17} />
              </button>
            </div>
            <p className="learn-muted">Change an input. See what follows.</p>
            {model.parameters.map((parameter) => (
              <label className="lab-control" key={parameter.key}>
                <span>
                  {parameter.label}
                  <small>{parameter.unit}</small>
                </span>
                {parameter.options ? (
                  <select
                    className="input"
                    disabled={saving}
                    aria-label={parameter.label}
                    value={String(parameters[parameter.key])}
                    onChange={(e) => update(parameter.key, e.target.value)}
                  >
                    {parameter.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <div className="lab-number">
                      <input
                        disabled={saving}
                        aria-label={parameter.label}
                        type="number"
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step}
                        value={
                          Number.isNaN(parameters[parameter.key])
                            ? ""
                            : parameters[parameter.key]
                        }
                        onChange={(e) =>
                          update(
                            parameter.key,
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                          )
                        }
                      />
                      <span>{parameter.unit}</span>
                    </div>
                    <input
                      disabled={saving}
                      aria-label={`${parameter.label} slider`}
                      type="range"
                      min={parameter.min}
                      max={parameter.max}
                      step={parameter.step}
                      value={
                        Number.isFinite(parameters[parameter.key])
                          ? parameters[parameter.key]
                          : parameter.min
                      }
                      onChange={(e) =>
                        update(parameter.key, Number(e.target.value))
                      }
                    />
                  </>
                )}
              </label>
            ))}
            {modelId === "projectile" && (
              <div className="lab-gravity">
                <button
                  className={parameters.gravity === 9.81 ? "active" : ""}
                  disabled={saving}
                  onClick={() => update("gravity", 9.81)}
                >
                  Earth
                </button>
                <button
                  className={parameters.gravity === 1.62 ? "active" : ""}
                  disabled={saving}
                  onClick={() => update("gravity", 1.62)}
                >
                  Moon
                </button>
                <button
                  disabled={saving}
                  onClick={() => {
                    const next = { ...parameters, speed: 0, height: 20 };
                    setParameters(next);
                    setValidParameters(next);
                    setTime(0);
                  }}
                >
                  Free fall
                </button>
              </div>
            )}
            <button
              className="button lab-save-variation"
              disabled={saving || !!errors.length}
              onClick={() => save(true)}
            >
              <Save size={16} />
              Save as a variation
            </button>
            <div className="lab-assumptions">
              <BookOpen size={17} />
              <div>
                <strong>Know the model</strong>
                <p>{model.assumptions}</p>
              </div>
            </div>
          </aside>
        )}
      </div>
      <div className="lab-bottom">
        <span>
          <span className="learn-green-dot" />
          All results computed from the current inputs.
        </span>
        <div>
          <button
            className="button button-ghost"
            disabled={!!errors.length}
            onClick={download}
          >
            <Download size={16} />
            Export data
          </button>
          <Link
            className="button button-ghost"
            href={`/projects/${projectId}/study?tool=practice&topic=${encodeURIComponent(({ projectile: "Kinematics", incline: "Friction", spring: "Oscillations", circuit: "DC circuits", lens: "Thin lenses", stoichiometry: "Stoichiometry", dilution: "Solutions", kinetics: "Chemical kinetics", quadratic: "Quadratics", intersection: "Coordinate geometry", inheritance: "Inheritance", mitosis: "Mitosis" } as Record<string, string>)[modelId])}`}
          >
            Try a related question
            <ArrowRight size={16} />
          </Link>
          <Link
            className="button button-ghost"
            href={`/projects/${projectId}/study?context=${encodeURIComponent(title)}${savedId ? `&artifact=${savedId}` : ""}`}
          >
            Ask about this state
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Graph({
  model,
  p,
  result,
}: {
  model: LabDefinition;
  p: Parameters;
  result: ModelResult;
}) {
  const points = result.points;
  let minX = Math.min(0, ...points.map((x) => x.x)),
    maxX = Math.max(1, ...points.map((x) => x.x)),
    minY = Math.min(0, ...points.map((x) => x.y)),
    maxY = Math.max(1, ...points.map((x) => x.y));
  if (model.id === "intersection") {
    const r = Number(p.radius);
    minX = -r * 2.55;
    maxX = r * 2.55;
    minY = -r * 1.3;
    maxY = r * 1.3;
  }
  const rangeX = maxX - minX || 1,
    rangeY = maxY - minY || 1;
  const sx = (x: number) => 65 + ((x - minX) / rangeX) * 510,
    sy = (y: number) => 315 - ((y - minY) / rangeY) * 260;
  const path = points
    .map(
      (pt, i) =>
        `${i && !(model.id === "lens" && (points[i - 1].x - Number(p.focalLength)) * (pt.x - Number(p.focalLength)) < 0) ? "L" : "M"}${sx(pt.x)},${sy(pt.y)}`,
    )
    .join(" ");
  return (
    <div className="lab-graph">
      <svg
        role="img"
        aria-label={`${model.title} graph. ${model.xLabel} against ${model.yLabel}. ${result.metrics.map((m) => `${m.label}: ${formatValue(m.value)} ${m.unit ?? ""}`).join(". ")}`}
        viewBox="0 0 640 380"
      >
        <defs>
          <clipPath id={`graph-clip-${model.id}`}>
            <rect x={65} y={50} width={510} height={270} />
          </clipPath>
        </defs>
        {Array.from({ length: 6 }, (_, i) => (
          <g key={i}>
            <line
              className="lab-grid-line"
              x1={65 + i * 102}
              y1={50}
              x2={65 + i * 102}
              y2={315}
            />
            <line
              className="lab-grid-line"
              x1={65}
              y1={55 + i * 52}
              x2={575}
              y2={55 + i * 52}
            />
            <text x={65 + i * 102} y={338} textAnchor="middle">
              {formatValue(minX + (rangeX * i) / 5, 1)}
            </text>
            <text x={54} y={319 - i * 52} textAnchor="end">
              {formatValue(minY + (rangeY * i) / 5, 1)}
            </text>
          </g>
        ))}
        <line className="lab-axis" x1={65} y1={315} x2={575} y2={315} />
        <line className="lab-axis" x1={65} y1={50} x2={65} y2={315} />
        <g clipPath={`url(#graph-clip-${model.id})`}>
          {model.id === "intersection" && (
            <ellipse
              cx={sx(0)}
              cy={sy(0)}
              rx={(Number(p.radius) / rangeX) * 510}
              ry={(Number(p.radius) / rangeY) * 260}
              className="lab-chart-circle"
            />
          )}
          {model.id === "inheritance" ? (
            points.map((pt, i) => (
              <rect
                key={i}
                x={sx(pt.x) - 30}
                y={sy(pt.y)}
                width={60}
                height={315 - sy(pt.y)}
                rx={5}
                className="lab-chart-fill"
              />
            ))
          ) : (
            <path className="lab-chart-path" d={path} />
          )}
        </g>
        <text x={320} y={367} textAnchor="middle">
          {model.xLabel}
        </text>
        <text transform="translate(18 190) rotate(-90)" textAnchor="middle">
          {model.yLabel}
        </text>
      </svg>
      <p className="learn-muted">
        {model.id === "lens"
          ? "The curve is discontinuous at the focal length; no finite image exists there."
          : model.id === "mitosis"
            ? "Stages: G1, G2, prophase, metaphase, anaphase, telophase, daughter cell."
            : "Graph and values use the same validated parameter revision."}
      </p>
    </div>
  );
}
function LabScene({
  model,
  p,
  result,
  time,
}: {
  model: LabDefinition;
  p: Parameters;
  result: ModelResult;
  time: number;
}) {
  const n = (k: string) => Number(p[k]);
  const v = result.values;
  if (model.id === "quadratic" || model.id === "intersection")
    return <Graph model={model} p={p} result={result} />;
  if (model.id === "inheritance") {
    const a = String(p.parent1),
      b = String(p.parent2);
    return (
      <div className="lab-punnett">
        <div className="lab-scene-caption">
          {a} × {b}
          <span>A complete-dominance model</span>
        </div>
        <div className="lab-punnett-grid">
          <span />
          <strong>{b[0]}</strong>
          <strong>{b[1]}</strong>
          {[...a].map((allele, i) => (
            <div className="lab-punnett-row" key={i}>
              <strong>{allele}</strong>
              {[...b].map((other, j) => (
                <span
                  key={j}
                  className={
                    [allele, other].sort().join("") === "aa" ? "recessive" : ""
                  }
                >
                  {[allele, other].sort().join("")}
                  <small>25%</small>
                </span>
              ))}
            </div>
          ))}
        </div>
        <p>Each square is one equally likely allele combination.</p>
      </div>
    );
  }
  if (model.id === "mitosis") {
    const count = Math.min(Number(v.chromosomes), 12),
      stage = String(p.stage),
      separated = ["Anaphase", "Telophase"].includes(stage),
      replicated = ["G2", "Prophase", "Metaphase"].includes(stage);
    return (
      <div className="lab-scene">
        <svg
          viewBox="0 0 640 360"
          role="img"
          aria-label={`Conceptual ${stage} diagram. ${v.chromosomes} chromosomes and ${v.dna}C DNA.`}
        >
          <ellipse
            cx={320}
            cy={180}
            rx={separated ? 210 : 150}
            ry={115}
            className="lab-cell"
          />
          {Array.from({ length: count }, (_, i) => {
            const x = separated ? 220 + (i % 2) * 190 : 265 + (i % 4) * 37,
              y = 125 + Math.floor(i / (separated ? 2 : 4)) * 32;
            return (
              <g
                key={i}
                transform={`translate(${x},${y})`}
                className={i % 2 ? "lab-chromosome-alt" : "lab-chromosome"}
              >
                <path d="M-6 -10L6 10" />
                {replicated && <path d="M6 -10L-6 10" />}
              </g>
            );
          })}
          <text x={320} y={325} textAnchor="middle">
            {stage}
            {stage === "After cytokinesis" ? " · one daughter cell" : ""} ·
            conceptual illustration
            {Number(v.chromosomes) > 12
              ? " (representative chromosomes shown)"
              : ""}
          </text>
        </svg>
      </div>
    );
  }
  if (model.id === "projectile") {
    const maxX = Math.max(Number(v.range), 8),
      maxY = Math.max(Number(v.maxHeight), 5),
      scale = Math.min(490 / maxX, 205 / maxY),
      sx = (x: number) => 75 + x * scale,
      sy = (y: number) => 280 - y * scale,
      path = result.points
        .map((pt, i) => `${i ? "L" : "M"}${sx(pt.x)} ${sy(pt.y)}`)
        .join(" "),
      t = Math.min(time, Number(v.t)),
      x = Number(v.vx) * t,
      y = Math.max(
        0,
        n("height") + Number(v.vy) * t - 0.5 * n("gravity") * t * t,
      );
    return (
      <div className="lab-scene">
        <svg
          viewBox="0 0 640 360"
          role="img"
          aria-label={`Projectile trajectory. Current time ${t.toFixed(2)} s, horizontal position ${x.toFixed(2)} m, height ${y.toFixed(2)} m.`}
        >
          <defs>
            <marker
              id="lab-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0L6 3L0 6" fill="none" stroke="currentColor" />
            </marker>
          </defs>
          {[1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={75}
              x2={575}
              y1={280 - i * 50}
              y2={280 - i * 50}
              className="lab-grid-line"
            />
          ))}
          <line x1={55} y1={280} x2={590} y2={280} className="lab-axis" />
          <path d={path} className="lab-trajectory" />
          <path d={`M75 280L75 ${sy(n("height"))}`} className="lab-axis" />
          <line
            x1={sx(x)}
            y1={sy(y)}
            x2={sx(x)}
            y2={280}
            className="lab-projection"
          />
          <circle cx={sx(x)} cy={sy(y)} r={11} className="lab-ball" />
          <circle cx={sx(x)} cy={sy(y)} r={20} className="lab-ball-aura" />
          <text
            x={sx(x)}
            y={sy(y) - 30}
            textAnchor="middle"
            className="lab-value-label"
          >
            {y.toFixed(2)} m
          </text>
          <text x={75} y={306}>
            0
          </text>
          <text x={575} y={306} textAnchor="end">
            x (m)
          </text>
          <text x={320} y={340} textAnchor="middle">
            t = {t.toFixed(2)} s · vₓ = {Number(v.vx).toFixed(2)} m/s · vᵧ ={" "}
            {(Number(v.vy) - n("gravity") * t).toFixed(2)} m/s
          </text>
          <text x={72} y={45}>
            y (m)
          </text>
        </svg>
      </div>
    );
  }
  if (model.id === "incline") {
    const angle = n("angle"),
      a = Number(v.acceleration),
      displacement = 0.5 * a * time * time;
    return (
      <div className="lab-scene">
        <svg
          viewBox="0 0 640 360"
          role="img"
          aria-label={`Incline schematic at ${angle} degrees. ${v.held === "yes" ? "Block held by static friction." : "Block sliding down."}`}
        >
          <g transform={`translate(125 280) rotate(${-Math.min(angle, 65)})`}>
            <path d="M0 0H400" className="lab-plane" />
            <rect
              x={Math.max(15, 220 - displacement * 3)}
              y={-49}
              width={65}
              height={49}
              rx={5}
              className="lab-block"
            />
            <path
              d={`M${Math.max(15, 220 - displacement * 3) + 32} -55V-110M${Math.max(15, 220 - displacement * 3) + 32} -110l-6 12m6-12l6 12`}
              className="lab-force"
            />
            <text x={Math.max(15, 220 - displacement * 3) + 44} y={-96}>
              N
            </text>
            <path
              d={`M${Math.max(15, 220 - displacement * 3) + 32} -24h75m0 0l-10-5m10 5l-10 5`}
              className="lab-friction"
            />
            <text x={Math.max(15, 220 - displacement * 3) + 100} y={-36}>
              f
            </text>
            <g
              transform={`translate(${Math.max(15, 220 - displacement * 3) + 32} -24) rotate(${Math.min(angle, 65)})`}
            >
              <path d="M0 0V85m0 0l-5-10m5 10l5-10" className="lab-weight" />
              <text x={9} y={72}>
                mg
              </text>
            </g>
          </g>
          <line x1={90} y1={280} x2={570} y2={280} className="lab-axis" />
          <text x={145} y={305}>
            {angle}° incline
          </text>
          <text x={320} y={338} textAnchor="middle">
            {v.held === "yes"
              ? "Static equilibrium"
              : `s = ${displacement.toFixed(2)} m · v = ${(a * time).toFixed(2)} m/s`}{" "}
            · schematic, not to scale
          </text>
        </svg>
      </div>
    );
  }
  if (model.id === "spring") {
    const omega = Number(v.omega),
      phase = Number(v.phase),
      A = n("amplitude"),
      displacement = A * Math.cos(omega * time + phase),
      x = 350 + displacement * 30,
      coil = Array.from(
        { length: 19 },
        (_, i) =>
          `${i ? "L" : "M"}${110 + ((x - 145) * i) / 18} ${i === 0 || i === 18 ? 170 : i % 2 ? 155 : 185}`,
      ).join(" ");
    return (
      <div className="lab-scene">
        <svg
          viewBox="0 0 640 360"
          role="img"
          aria-label={`Spring oscillator, displacement ${displacement.toFixed(2)} m.`}
        >
          <rect x={70} y={120} width={30} height={100} className="lab-wall" />
          <path d={coil} className="lab-spring" />
          <rect
            x={x - 35}
            y={135}
            width={70}
            height={70}
            rx={7}
            className="lab-block"
          />
          <line x1={350} y1={95} x2={350} y2={255} className="lab-projection" />
          <line x1={105} y1={220} x2={570} y2={220} className="lab-axis" />
          <text x={350} y={282} textAnchor="middle">
            equilibrium
          </text>
          <text x={320} y={330} textAnchor="middle">
            x = {displacement.toFixed(2)} m · v ={" "}
            {(-A * omega * Math.sin(omega * time + phase)).toFixed(2)} m/s · E ={" "}
            {formatValue(v.energy as number)} J
          </text>
        </svg>
      </div>
    );
  }
  if (model.id === "circuit") {
    const parallel = p.connection === "parallel";
    return (
      <div className="lab-scene">
        <svg
          viewBox="0 0 640 360"
          role="img"
          aria-label={`Two-resistor ${p.connection} circuit schematic.`}
        >
          <path
            d={
              parallel
                ? "M120 160V90H460V270H120V180M280 90V270"
                : "M120 160V90H520V270H120V180"
            }
            className="lab-wire"
          />
          <path d="M99 160H141M108 180H132" className="lab-battery" />
          <text x={82} y={213}>
            {n("voltage")} V
          </text>
          {parallel ? (
            <>
              <rect
                x={265}
                y={145}
                width={30}
                height={70}
                className="lab-resistor"
              />
              <rect
                x={445}
                y={145}
                width={30}
                height={70}
                className="lab-resistor"
              />
              <text x={325} y={180}>
                R₁ · {n("r1")} Ω
              </text>
              <text x={495} y={180}>
                R₂ · {n("r2")} Ω
              </text>
            </>
          ) : (
            <>
              <rect
                x={245}
                y={75}
                width={120}
                height={30}
                className="lab-resistor"
              />
              <rect
                x={245}
                y={255}
                width={120}
                height={30}
                className="lab-resistor"
              />
              <text x={305} y={56} textAnchor="middle">
                R₁ · {n("r1")} Ω
              </text>
              <text x={305} y={315} textAnchor="middle">
                R₂ · {n("r2")} Ω
              </text>
            </>
          )}
          <text x={320} y={345} textAnchor="middle">
            I₁ = {formatValue(v.i1 as number)} A · I₂ ={" "}
            {formatValue(v.i2 as number)} A · ideal {p.connection} circuit
          </text>
        </svg>
      </div>
    );
  }
  if (model.id === "lens") {
    const f = n("focalLength"),
      u = n("objectDistance"),
      distance = v.imageDistance as number | null,
      scale = Math.min(5, 220 / Math.max(u, Math.abs(distance ?? 50), f * 2)),
      objX = 320 - u * scale,
      objH = n("objectHeight") * 6,
      imageH = distance === null ? 0 : (-distance / u) * objH,
      imgX = distance === null ? 600 : 320 + distance * scale;
    return (
      <div className="lab-scene">
        <svg
          viewBox="0 0 640 360"
          role="img"
          aria-label={`Thin-lens ray schematic. ${distance === null ? "Image at infinity." : distance > 0 ? "Real inverted image." : "Virtual upright image."}`}
        >
          <line x1={35} y1={180} x2={605} y2={180} className="lab-axis" />
          <ellipse cx={320} cy={180} rx={12} ry={100} className="lab-lens" />
          <path
            d={`M${objX} 180V${180 - objH}l-5 9m5-9l5 9`}
            className="lab-object"
          />
          <line
            x1={objX}
            y1={180 - objH}
            x2={320}
            y2={180 - objH}
            className="lab-ray"
          />
          <line
            x1={320}
            y1={180 - objH}
            x2={605}
            y2={180 - objH + (285 * objH) / (f * scale)}
            className="lab-ray"
          />
          {distance !== null && (
            <>
              <path
                d={`M${imgX} 180V${180 - imageH}l-5 ${imageH > 0 ? 9 : -9}m5 ${imageH > 0 ? -9 : 9}l5 ${imageH > 0 ? 9 : -9}`}
                className="lab-image"
              />
              <line
                x1={objX}
                y1={180 - objH}
                x2={imgX}
                y2={180 - imageH}
                className="lab-centre-ray"
              />
            </>
          )}
          {[-1, 1].map((sign) => (
            <g key={sign}>
              <circle
                cx={320 + sign * f * scale}
                cy={180}
                r={3}
                className="lab-focal"
              />
              <text x={320 + sign * f * scale} y={204} textAnchor="middle">
                F
              </text>
            </g>
          ))}
          <text x={objX} y={320} textAnchor="middle">
            Object
          </text>
          <text x={320} y={344} textAnchor="middle">
            {distance === null
              ? "Parallel outgoing rays · image at infinity"
              : distance > 0
                ? "Real image · inverted"
                : "Virtual image · upright"}{" "}
            · schematic
          </text>
        </svg>
      </div>
    );
  }
  if (model.id === "kinetics") {
    const c = n("initialConcentration") * Math.exp(-n("rate") * time);
    return (
      <div className="lab-scene">
        <svg
          viewBox="0 0 640 360"
          role="img"
          aria-label={`First-order decay at ${time.toFixed(2)} seconds, concentration ${c.toFixed(3)} mol/L.`}
        >
          <path
            d="M230 75V270Q230 285 245 285H395Q410 285 410 270V75"
            className="lab-vessel"
          />
          <rect
            x={233}
            y={100}
            width={174}
            height={182}
            rx={6}
            fill="var(--blue)"
            opacity={
              0.08 +
              (n("initialConcentration") ? c / n("initialConcentration") : 0) *
                0.35
            }
          />
          <text x={320} y={200} textAnchor="middle" className="lab-large-value">
            {c.toFixed(3)}
          </text>
          <text x={320} y={225} textAnchor="middle">
            mol/L
          </text>
          <text x={320} y={330} textAnchor="middle">
            t = {time.toFixed(2)} s · concentration shown by colour intensity
          </text>
        </svg>
      </div>
    );
  }
  const dilution = model.id === "dilution";
  return (
    <div className="lab-scene">
      <svg
        viewBox="0 0 640 360"
        role="img"
        aria-label={
          dilution
            ? "Dilution schematic with conserved solute."
            : "Theoretical water formation from hydrogen and oxygen."
        }
      >
        {[150, 470].map((x, i) => (
          <g key={x}>
            <path
              d={`M${x - 60} 95V255Q${x - 60} 270 ${x - 45} 270H${x + 45}Q${x + 60} 270 ${x + 60} 255V95`}
              className="lab-vessel"
            />
            <rect
              x={x - 56}
              y={dilution && i === 0 ? 205 : 135}
              width={112}
              height={dilution && i === 0 ? 61 : 131}
              rx={5}
              fill="var(--blue)"
              opacity={dilution ? (i === 0 ? 0.3 : 0.1) : i === 0 ? 0.15 : 0.3}
            />
            <text x={x} y={305} textAnchor="middle">
              {dilution
                ? i === 0
                  ? `${n("initialVolume")} mL`
                  : `${n("finalVolume")} mL`
                : i === 0
                  ? `${n("hydrogen")} mol H₂ + ${n("oxygen")} mol O₂`
                  : `${formatValue(v.water as number)} mol H₂O`}
            </text>
          </g>
        ))}
        <path d="M260 190H365l-12-8m12 8l-12 8" className="lab-force" />
        <text x={320} y={70} textAnchor="middle" className="lab-scene-equation">
          {dilution ? "C₁V₁ = C₂V₂" : "2 H₂ + O₂ → 2 H₂O"}
        </text>
        <text x={320} y={345} textAnchor="middle">
          {dilution
            ? "Solute is conserved. Illustration is schematic."
            : "Complete reaction · theoretical yield · schematic"}
        </text>
      </svg>
    </div>
  );
}
export default LabWorkspace;
