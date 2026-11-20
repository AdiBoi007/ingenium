import { z } from "zod";
import { ApiError, projectExists } from "./db";
import { createEntity } from "./entities";
import { questions, createTest, progress } from "./learning";
import { previewPlan } from "./planning";
import { computeModel, labs } from "../domain/science";
export const toolRegistry = [
  {
    id: "ask",
    label: "Ask / Explain",
    description: "A project-aware conversation with your tutor.",
    icon: "MessageCircle",
    requires: "ai",
    schemaVersion: 1,
  },
  {
    id: "solve",
    label: "Solve a question",
    description: "Work through a selected question.",
    icon: "Calculator",
    requires: "ai",
    schemaVersion: 1,
  },
  {
    id: "visualise",
    label: "Visualise",
    description: "Explore a trusted interactive scientific model.",
    icon: "Orbit",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "practise",
    label: "Practise",
    description: "Answer original questions and learn from feedback.",
    icon: "PencilLine",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "test",
    label: "Take a test",
    description: "A timed custom test with saved answers.",
    icon: "Timer",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "revise",
    label: "Revise / Flashcards",
    description: "Review your saved ideas on a schedule.",
    icon: "Layers",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "notes",
    label: "Make notes",
    description: "Save a note in your project Library.",
    icon: "FileText",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "plan",
    label: "Make a study plan",
    description: "Preview a feasible schedule before applying it.",
    icon: "CalendarDays",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "lessons",
    label: "Find lessons",
    description: "Open your project’s saved learning videos.",
    icon: "Play",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "progress",
    label: "Analyse progress",
    description: "Inspect actual attempts and revision evidence.",
    icon: "ChartNoAxesCombined",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "sources",
    label: "Search project sources",
    description: "Search this project’s own source passages.",
    icon: "Search",
    requires: null,
    schemaVersion: 1,
  },
  {
    id: "updates",
    label: "Check exam updates",
    description: "Visit authoritative official sources.",
    icon: "Bell",
    requires: null,
    schemaVersion: 1,
  },
] as const;
export async function executeTool(
  projectId: string,
  toolId: string,
  input: any,
) {
  const project = await projectExists(projectId);
  const normalized = toolId === "practice" ? "practise" : toolId;
  const tool = toolRegistry.find((t) => t.id === normalized);
  if (!tool) throw new ApiError(404, "Tool not found");
  if (
    Array.isArray(project.settings.enabledTools) &&
    !project.settings.enabledTools.includes(normalized) &&
    !(
      normalized === "practise" &&
      project.settings.enabledTools.includes("practice")
    )
  )
    throw new ApiError(403, "This tool is disabled in project settings");
  if (tool.requires === "ai")
    throw new ApiError(
      503,
      "Open-ended AI is not connected. Use the deterministic tools or configure the provider.",
    );
  if (normalized === "visualise") {
    const parsed = z
      .object({
        modelId: z.string(),
        parameters: z
          .record(z.string(), z.union([z.number(), z.string()]))
          .optional(),
        title: z.string().max(300).optional(),
      })
      .parse(input);
    const model = labs.find((l) => l.id === parsed.modelId);
    if (!model) throw new ApiError(400, "Choose a supported model");
    if (
      !project.subjects.includes(model.subject) &&
      !project.subjects.some(
        (s: string) => s.includes("Engineering") || s === "Mechanics",
      )
    )
      throw new ApiError(
        400,
        "This model does not belong to an enabled project subject",
      );
    const parameters = parsed.parameters ?? model.defaults;
    let result;
    try {
      result = computeModel(model.id, parameters);
    } catch (error) {
      throw new ApiError(400, (error as Error).message);
    }
    return createEntity("artifacts", projectId, {
      title: parsed.title ?? model.title,
      type: "simulation",
      payload: {
        schemaVersion: 1,
        modelVersion: 1,
        modelId: model.id,
        originalInput: parameters,
        parameters,
        result,
      },
    });
  }
  if (normalized === "practise") {
    const params = new URLSearchParams();
    if (input.subject) params.set("subject", input.subject);
    if (input.topic) params.set("topic", input.topic);
    params.set("limit", String(Math.min(50, Number(input.count || 5))));
    const items = await questions(projectId, params);
    return {
      type: "practice",
      items,
      count: items.length,
      notice:
        items.length < Number(input.count || 5)
          ? "Fewer eligible questions are available than requested."
          : undefined,
    };
  }
  if (normalized === "test") return createTest(projectId, input);
  if (normalized === "notes")
    return createEntity("resources", projectId, { ...input, type: "note" });
  if (normalized === "plan") return previewPlan(projectId, input);
  if (normalized === "progress") return progress(projectId);
  const destination =
    normalized === "revise"
      ? "progress?view=revision"
      : normalized === "lessons"
        ? "cramazon"
        : normalized === "sources"
          ? "library"
          : "settings";
  return { type: "navigation", url: `/projects/${projectId}/${destination}` };
}
