"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { api } from "@/lib/api";
import { Loading, ErrorBox } from "./ui";
import { LabWorkspace } from "./learning/LabWorkspace";
export default function ArtifactPage({
  projectId,
  artifactId,
}: {
  projectId: string;
  artifactId: string;
}) {
  const [item, setItem] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api(`/api/projects/${projectId}/artifacts/${artifactId}`)
      .then((r) => setItem(r.item))
      .catch((e) => setError(e.message));
  }, [projectId, artifactId]);
  if (error) return <ErrorBox message={error} />;
  if (!item) return <Loading />;
  return (
    <div className="artifact-page">
      <Link className="text-link" href={`/projects/${projectId}/library`}>
        <ArrowLeft size={17} />
        Back to Library
      </Link>
      {["lab", "simulation", "graph"].includes(item.type) ? (
        <LabWorkspace projectId={projectId} artifactId={artifactId} />
      ) : (
        <section className="panel artifact-document">
          <span className="eyebrow">
            {item.type} · Revision {item.revision}
          </span>
          <h1>{item.title}</h1>
          <pre>
            {typeof item.payload === "string"
              ? item.payload
              : JSON.stringify(item.payload, null, 2)}
          </pre>
          <button
            className="button"
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(
                new Blob([JSON.stringify(item, null, 2)], {
                  type: "application/json",
                }),
              );
              a.download = `${item.title}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Download size={17} />
            Export artifact
          </button>
        </section>
      )}
    </div>
  );
}
