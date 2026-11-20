import { openWorkspace } from "./identity";
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  if (
    typeof window !== "undefined" &&
    !["/api/health", "/api/capabilities", "/api/identity/session"].includes(
      url.split("?")[0],
    )
  )
    await openWorkspace();
  if (options.body instanceof FormData) {
    const caps = await fetch("/api/capabilities").then((r) => r.json());
    const limit = caps.maxUploadBytes || 15 * 1024 * 1024;
    for (const value of options.body.values()) {
      if (value instanceof Blob && value.size > limit)
        throw new Error(
          `Choose a file smaller than ${Math.floor(limit / 1024 / 1024)} MB.`,
        );
    }
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : body.error?.message ||
            body.message ||
            `Request failed (${response.status})`,
    );
  return body as T;
}
export const json = (data: unknown) => JSON.stringify(data);
