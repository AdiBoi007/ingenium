"use client";
import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
function MathText({
  value,
  display = false,
}: {
  value: string;
  display?: boolean;
}) {
  let html: string | null = null;
  try {
    html = katex.renderToString(value, {
      displayMode: display,
      throwOnError: false,
      trust: false,
      strict: "warn",
      maxExpand: 100,
      maxSize: 12,
    });
  } catch {
    html = null;
  }
  return html ? (
    <span
      className={display ? "math-block" : "math-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <code>{value}</code>
  );
}
function inline(text: string): ReactNode[] {
  const parts = text.split(
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\$[^$\n]+\$)/g,
  );
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("$") && part.endsWith("$"))
      return <MathText key={i} value={part.slice(1, -1)} />;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const safe =
        /^https?:\/\//i.test(link[2]) || /^\/projects\//.test(link[2]);
      return safe ? (
        <a
          key={i}
          href={link[2]}
          {...(link[2].startsWith("http")
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {link[1]}
        </a>
      ) : (
        <span key={i}>{link[1]}</span>
      );
    }
    return part;
  });
}
export default function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code = [];
      while (++i < lines.length && !lines[i].startsWith("```"))
        code.push(lines[i]);
      blocks.push(
        <pre key={i}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (line.trim().startsWith("$$")) {
      let formula = line.trim().slice(2);
      if (formula.endsWith("$$")) formula = formula.slice(0, -2);
      else {
        const items = [formula];
        while (++i < lines.length && !lines[i].trim().endsWith("$$"))
          items.push(lines[i]);
        if (i < lines.length) items.push(lines[i].replace(/\$\$$/, ""));
        formula = items.join("\n");
      }
      blocks.push(<MathText key={i} value={formula} display />);
      continue;
    }
    const heading = line.match(/^(#{1,3}) (.+)$/);
    if (heading) {
      blocks.push(<h3 key={i}>{inline(heading[2])}</h3>);
      continue;
    }
    const bullet = line.match(/^\s*(?:[-*]|\d+\.) (.+)$/);
    if (bullet) {
      blocks.push(
        <div className="rich-list-item" key={i}>
          <span aria-hidden="true">•</span>
          <span>{inline(bullet[1])}</span>
        </div>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
      continue;
    }
    blocks.push(
      line.trim() ? (
        <p key={i}>{inline(line)}</p>
      ) : (
        <div key={i} className="rich-break" />
      ),
    );
  }
  return <div className="rich-text">{blocks}</div>;
}
