export type TemplateDefinition = {
  id: string;
  name: string;
  family: string;
  version: string;
  subjects: string[];
  coverageStatus: string;
  questionTypes: string[];
};
export const curriculumTemplates: TemplateDefinition[] = [
  {
    id: "jee-main-v1",
    name: "JEE Main",
    family: "JEE",
    version: "starter-v1",
    subjects: ["Physics", "Chemistry", "Maths"],
    coverageStatus:
      "Original starter topics; not a verified complete official syllabus.",
    questionTypes: ["single", "numerical"],
  },
  {
    id: "jee-advanced-v1",
    name: "JEE Advanced",
    family: "JEE",
    version: "starter-v1",
    subjects: ["Physics", "Chemistry", "Maths"],
    coverageStatus: "Original starter topics; custom practice marking only.",
    questionTypes: ["single", "multiple", "numerical"],
  },
  {
    id: "jee-combined-v1",
    name: "JEE Main + Advanced",
    family: "JEE",
    version: "starter-v1",
    subjects: ["Physics", "Chemistry", "Maths"],
    coverageStatus:
      "Original starter topics; not a verified complete official syllabus.",
    questionTypes: ["single", "multiple", "numerical"],
  },
  {
    id: "neet-v1",
    name: "NEET",
    family: "NEET",
    version: "starter-v1",
    subjects: ["Physics", "Chemistry", "Biology"],
    coverageStatus:
      "Original starter topics; not a verified complete official syllabus.",
    questionTypes: ["single"],
  },
  {
    id: "gmat-v1",
    name: "GMAT",
    family: "GMAT",
    version: "starter-v1",
    subjects: ["Quantitative Reasoning", "Verbal Reasoning", "Data Insights"],
    coverageStatus:
      "Small original practice collection; no official adaptive scoring.",
    questionTypes: ["single", "numerical", "free"],
  },
  {
    id: "sat-v1",
    name: "SAT",
    family: "SAT",
    version: "starter-v1",
    subjects: ["Reading and Writing", "Maths"],
    coverageStatus:
      "Configurable template; original material must be added for full coverage.",
    questionTypes: ["single", "numerical", "free"],
  },
  {
    id: "boards-v1",
    name: "School / board examinations",
    family: "Boards",
    version: "starter-v1",
    subjects: [],
    coverageStatus:
      "Select your board, qualification and syllabus year in project settings. Coverage is student-defined.",
    questionTypes: ["single", "multiple", "numerical", "free"],
  },
  {
    id: "alevel-v1",
    name: "A-levels",
    family: "A-levels",
    version: "starter-v1",
    subjects: [],
    coverageStatus:
      "Exam board, qualification and syllabus year are student-defined; not an official topic map.",
    questionTypes: ["single", "multiple", "numerical", "free"],
  },
  {
    id: "university-v1",
    name: "College / university course",
    family: "University",
    version: "starter-v1",
    subjects: [],
    coverageStatus:
      "Custom course topics and assessment weights; not a verified university curriculum.",
    questionTypes: ["single", "multiple", "numerical", "free"],
  },
  {
    id: "programming-v1",
    name: "Introductory programming · editable example",
    family: "University",
    version: "starter-v1",
    subjects: ["Programming"],
    coverageStatus:
      "Original, editable programming outline. Not an official INFO1110 or university syllabus; use your current course materials.",
    questionTypes: ["single", "multiple", "free"],
  },
  {
    id: "custom-v1",
    name: "Custom learning goal",
    family: "Custom",
    version: "starter-v1",
    subjects: [],
    coverageStatus: "Student-defined subjects and topics.",
    questionTypes: ["single", "multiple", "numerical", "free"],
  },
];
export type CurriculumTopic = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  subject: string;
  coverage: "not-started" | "in-progress" | "covered";
  confidence: "unset" | "low" | "medium" | "high";
  active: boolean;
  revision: number;
  prerequisiteIds: string[];
};
export type Assessment = {
  id: string;
  projectId: string;
  title: string;
  course: string;
  weight: number;
  maxMark: number;
  mark: number | null;
  revision: number;
};
export function selectTemplate(
  exam: string,
  context?: {
    projectKind?: string;
    courseCode?: string;
    settings?: Record<string, unknown>;
  },
): TemplateDefinition {
  const explicit = curriculumTemplates.find(
    (t) => t.id === context?.settings?.templateId,
  );
  if (explicit) return explicit;
  const x = exam.toLowerCase();
  let key = "custom-v1";
  if (x.includes("jee"))
    key =
      (x.includes("main") && x.includes("advanced")) || x === "jee"
        ? "jee-combined-v1"
        : x.includes("advanced")
          ? "jee-advanced-v1"
          : "jee-main-v1";
  else if (x.includes("neet")) key = "neet-v1";
  else if (x.includes("gmat")) key = "gmat-v1";
  else if (/\bsat\b/.test(x)) key = "sat-v1";
  else if (x.includes("a-level") || x.includes("alevel")) key = "alevel-v1";
  else if (x.includes("board") || x.includes("school")) key = "boards-v1";
  else if (
    context?.courseCode?.toUpperCase() === "INFO1110" ||
    x.includes("introductory programming")
  )
    key = "programming-v1";
  else if (context?.projectKind === "school") key = "boards-v1";
  else if (
    context?.projectKind === "course" ||
    x.includes("university") ||
    x.includes("engineering")
  )
    key = "university-v1";
  return curriculumTemplates.find((t) => t.id === key)!;
}
export function topicCode(subject: string, title: string) {
  return `${subject}:${title}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150);
}
export function hasPrerequisiteCycle(edges: Record<string, string[]>): boolean {
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((edges[id] ?? []).some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return Object.keys(edges).some(visit);
}
export function assessmentSummary(
  items: Pick<Assessment, "weight" | "maxMark" | "mark">[],
) {
  let allocatedWeight = 0,
    completedWeight = 0,
    earnedWeightedPoints = 0;
  for (const a of items) {
    if (
      !Number.isFinite(a.weight) ||
      a.weight <= 0 ||
      a.weight > 100 ||
      !Number.isFinite(a.maxMark) ||
      a.maxMark <= 0 ||
      (a.mark !== null &&
        (!Number.isFinite(a.mark) || a.mark < 0 || a.mark > a.maxMark))
    )
      throw new Error(
        "Assessment marks and weights must be finite and within their allowed ranges.",
      );
    allocatedWeight += a.weight;
    if (a.mark !== null) {
      completedWeight += a.weight;
      earnedWeightedPoints += (a.weight * a.mark) / a.maxMark;
    }
  }
  if (allocatedWeight > 100 + 1e-8)
    throw new Error("Assessment weights cannot total more than 100%.");
  return {
    allocatedWeight,
    completedWeight,
    remainingWeight: 100 - completedWeight,
    unallocatedWeight: 100 - allocatedWeight,
    earnedWeightedPoints,
    performanceOnCompleted: completedWeight
      ? (earnedWeightedPoints / completedWeight) * 100
      : null,
  };
}
export type VersionTopic = { code: string; title: string; subject: string };
export function validateTopicMapping(
  existing: Pick<CurriculumTopic, "id">[],
  topics: VersionTopic[],
  mapping: Record<string, string | null>,
) {
  const errors: string[] = [];
  const codes = new Set(topics.map((t) => t.code));
  if (codes.size !== topics.length)
    errors.push("Every new topic code must be unique.");
  const assigned: string[] = [];
  for (const old of existing) {
    if (!(old.id in mapping))
      errors.push(
        `Choose a mapping or explicitly retain as historical for ${old.id}.`,
      );
    else if (mapping[old.id] !== null) {
      if (!codes.has(mapping[old.id]!))
        errors.push(`Unknown target topic ${mapping[old.id]}.`);
      assigned.push(mapping[old.id]!);
    }
  }
  if (new Set(assigned).size !== assigned.length)
    errors.push("Each target topic can map from only one existing topic.");
  if (Object.keys(mapping).some((id) => !existing.some((t) => t.id === id)))
    errors.push(
      "Mapping includes a topic outside this active project curriculum.",
    );
  return errors;
}
