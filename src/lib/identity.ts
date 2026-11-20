export type WorkspaceStudent = {
  id: string;
  name: string;
  demo: boolean;
  preferences: Record<string, unknown>;
};

let opening: Promise<WorkspaceStudent> | null = null;
/** Share first-visit bootstrapping so parallel page requests cannot create competing cookies. */
export function openWorkspace(): Promise<WorkspaceStudent> {
  if (!opening) {
    opening = fetch("/api/identity/session", {
      method: "POST",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.student)
          throw new Error(
            result.error || "Your workspace could not be opened.",
          );
        return result.student;
      })
      .catch((error) => {
        opening = null;
        throw error;
      });
  }
  return opening;
}
