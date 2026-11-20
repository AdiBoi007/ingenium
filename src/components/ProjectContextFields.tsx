"use client";
import { useState } from "react";
import { FileUp } from "lucide-react";
import {
  parseSyllabusText,
  projectKindLabels,
  projectKinds,
  type ProjectContext,
  type SyllabusTopic,
} from "@/domain/project-context";
import "./project-context.css";

export function ProjectContextFields({
  value,
  onChange,
  showKind = true,
}: {
  value: ProjectContext;
  onChange: (value: ProjectContext) => void;
  showKind?: boolean;
}) {
  const fields = [
    [
      "institution",
      "School or institution",
      "Optional · any school, college or provider",
    ],
    ["courseCode", "Course code", "Optional · INFO1110, ENG101…"],
    [
      "qualification",
      "Qualification or exam board",
      "Optional · CBSE, HSC, Cambridge…",
    ],
    ["level", "Level or year of study", "Optional · Grade 12, undergraduate…"],
    [
      "academicYear",
      "Academic year or session",
      "Optional · 2027, Semester 1 2027…",
    ],
  ] as const;
  return (
    <div className="project-context-fields">
      {showKind && (
        <label className="field">
          Project kind
          <select
            value={value.projectKind}
            onChange={(e) =>
              onChange({
                ...value,
                projectKind: e.target.value as ProjectContext["projectKind"],
              })
            }
          >
            {projectKinds.map((kind) => (
              <option key={kind} value={kind}>
                {projectKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.map(([key, label, placeholder]) => (
        <label className="field" key={key}>
          {label}
          <input
            maxLength={300}
            value={value[key]}
            placeholder={placeholder}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

export function SyllabusOutline({
  value,
  onChange,
  defaultSubject,
}: {
  value: string;
  onChange: (value: string) => void;
  defaultSubject: string;
}) {
  const [fileError, setFileError] = useState("");
  let topics: SyllabusTopic[] = [],
    error = "";
  try {
    topics = parseSyllabusText(value, defaultSubject || "General");
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <div className="syllabus-outline">
      <label className="field">
        Syllabus or topic outline <span className="optional">Optional</span>
        <textarea
          value={value}
          maxLength={50000}
          rows={5}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            "One topic per line, or Subject | Topic\nProgramming | Functions\nProgramming | Testing and debugging"
          }
        />
      </label>
      <div className="syllabus-import-row">
        <label className="button syllabus-file-button">
          <FileUp size={16} />
          Import a text outline
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            aria-label="Import syllabus text file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileError("");
              try {
                if (file.size > 200000)
                  throw new Error("Choose a text file smaller than 200 KB.");
                const text = await file.text();
                parseSyllabusText(text, defaultSubject || "General");
                onChange(text);
              } catch (e) {
                setFileError((e as Error).message);
              } finally {
                e.target.value = "";
              }
            }}
          />
        </label>
        <small>
          TXT or Markdown. Upload PDFs to Library for source reading.
        </small>
      </div>
      {(error || fileError) && (
        <p className="syllabus-error" role="alert">
          {error || fileError}
        </p>
      )}
      {!!topics.length && (
        <div className="syllabus-preview">
          <strong>
            {topics.length} topic{topics.length === 1 ? "" : "s"} in this
            outline
          </strong>
          <ul>
            {topics.slice(0, 5).map((topic) => (
              <li key={`${topic.subject}:${topic.title}`}>
                <span>{topic.subject}</span>
                {topic.title}
              </li>
            ))}
          </ul>
          {topics.length > 5 && <small>And {topics.length - 5} more.</small>}
        </div>
      )}
      <p className="fine-print">
        Your outline is an editable topic list. Importing it adds no practice
        questions, grades or completed work. Example outlines are not official
        syllabi.
      </p>
    </div>
  );
}
