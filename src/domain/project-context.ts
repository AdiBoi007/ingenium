export const projectKinds = [
  "course",
  "exam",
  "school",
  "personal",
  "custom",
] as const;
export type ProjectKind = (typeof projectKinds)[number];
export const projectKindLabels: Record<ProjectKind, string> = {
  course: "College or university course",
  exam: "Exam preparation",
  school: "School or qualification",
  personal: "Personal learning",
  custom: "Custom project",
};
export type ProjectContext = {
  projectKind: ProjectKind;
  institution: string;
  courseCode: string;
  qualification: string;
  level: string;
  academicYear: string;
  learningGoal: string;
  syllabusText: string;
};
export const emptyProjectContext: ProjectContext = {
  projectKind: "custom",
  institution: "",
  courseCode: "",
  qualification: "",
  level: "",
  academicYear: "",
  learningGoal: "",
  syllabusText: "",
};
export function contextFromProject(
  project: Partial<ProjectContext>,
): ProjectContext {
  return Object.fromEntries(
    Object.entries(emptyProjectContext).map(([key, value]) => [
      key,
      project[key as keyof ProjectContext] ?? value,
    ]),
  ) as ProjectContext;
}
export function normalizeSubjects(value: string): string[] {
  return [
    ...new Map(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => [s.toLocaleLowerCase(), s]),
    ).values(),
  ];
}
export type SyllabusTopic = { subject: string; title: string };
/** Explicit plain-text import: one topic per line, optionally Subject | Topic. */
export function parseSyllabusText(
  text: string,
  defaultSubject = "General",
): SyllabusTopic[] {
  if (text.length > 50000)
    throw new Error("Use a syllabus outline of at most 50,000 characters.");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ""))
    .filter(Boolean);
  if (lines.length > 300)
    throw new Error("Import at most 300 topic lines at a time.");
  const seen = new Set<string>();
  return lines.flatMap((line, index) => {
    const separator = line.indexOf("|");
    const subject = (
      separator < 0 ? defaultSubject : line.slice(0, separator)
    ).trim();
    const title = (separator < 0 ? line : line.slice(separator + 1)).trim();
    if (!subject || !title || subject.length > 200 || title.length > 200)
      throw new Error(
        `Line ${index + 1}: use a subject and topic of 1–200 characters each.`,
      );
    const key = `${subject.toLocaleLowerCase()}\u0000${title.toLocaleLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ subject, title }];
  });
}
export function projectContextLabel(
  project: Partial<ProjectContext> & { exam?: string },
): string {
  const parts = [
    project.courseCode,
    project.exam && project.exam !== "Custom" ? project.exam : "",
    project.qualification,
    project.academicYear,
  ].filter(Boolean);
  return (
    [...new Set(parts)].join(" · ") ||
    projectKindLabels[project.projectKind ?? "custom"]
  );
}
export type ProjectPreset = {
  id: string;
  label: string;
  exam: string;
  subjects: string[];
  templateId: string;
  context: Partial<ProjectContext>;
};
export const projectPresets: ProjectPreset[] = [
  {
    id: "blank",
    label: "Start from a blank project",
    exam: "Custom",
    subjects: [],
    templateId: "custom-v1",
    context: { projectKind: "custom" },
  },
  {
    id: "course",
    label: "Any college or university course",
    exam: "",
    subjects: [],
    templateId: "university-v1",
    context: { projectKind: "course" },
  },
  {
    id: "info1110",
    label: "INFO1110 · editable programming example",
    exam: "Introductory programming",
    subjects: ["Programming"],
    templateId: "programming-v1",
    context: {
      projectKind: "course",
      institution: "University of Sydney",
      courseCode: "INFO1110",
      level: "Undergraduate",
      syllabusText:
        "Programming | Variables and expressions\nProgramming | Conditions and loops\nProgramming | Functions\nProgramming | Collections\nProgramming | Reading and writing files\nProgramming | Testing and debugging",
    },
  },
  {
    id: "school",
    label: "Any school or board",
    exam: "",
    subjects: [],
    templateId: "boards-v1",
    context: { projectKind: "school" },
  },
  {
    id: "grade12",
    label: "Grade 12 · choose your board and subjects",
    exam: "Grade 12",
    subjects: [],
    templateId: "boards-v1",
    context: { projectKind: "school", level: "Grade 12" },
  },
  {
    id: "alevel",
    label: "A-levels · choose your board and subjects",
    exam: "A-levels",
    subjects: [],
    templateId: "alevel-v1",
    context: { projectKind: "school", qualification: "A-levels" },
  },
  ...[
    [
      "jee-combined-v1",
      "JEE Main + Advanced",
      ["Physics", "Chemistry", "Maths"],
    ],
    ["jee-main-v1", "JEE Main", ["Physics", "Chemistry", "Maths"]],
    ["jee-advanced-v1", "JEE Advanced", ["Physics", "Chemistry", "Maths"]],
    ["neet-v1", "NEET", ["Physics", "Chemistry", "Biology"]],
    [
      "gmat-v1",
      "GMAT",
      ["Quantitative Reasoning", "Verbal Reasoning", "Data Insights"],
    ],
    ["sat-v1", "SAT", ["Reading and Writing", "Maths"]],
  ].map(([id, label, subjects]) => ({
    id: id as string,
    label: label as string,
    exam: label as string,
    subjects: subjects as string[],
    templateId: id as string,
    context: { projectKind: "exam" as const },
  })),
  {
    id: "personal",
    label: "Personal interest or independent learning",
    exam: "",
    subjects: [],
    templateId: "custom-v1",
    context: { projectKind: "personal" },
  },
];
