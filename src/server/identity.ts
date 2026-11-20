import { createHash, randomBytes } from "node:crypto";
import { ApiError, DEMO_STUDENT_ID, query, transaction } from "./db";
import {
  isLocalDemo,
  studentContext,
  type StudentIdentity,
} from "./identity-context";

const cookieName = "ingenium_workspace";
const lifetimeSeconds = 180 * 24 * 60 * 60;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function checkRequestOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Open Ingenium directly to make changes.");
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") === "https"
      ? "https:"
      : requestUrl.protocol;
  const allowed = new Set([requestUrl.origin]);
  if (host && /^[a-zA-Z0-9.:[\]-]+$/.test(host))
    allowed.add(`${protocol}//${host}`);
  if (origin && !allowed.has(origin))
    throw new ApiError(403, "This request came from another website.");
}

export async function consumeRequestBudget(
  key: string,
  limit: number,
  seconds = 60,
) {
  const result = await query(
    `INSERT INTO request_budgets(bucket,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second')
     ON CONFLICT(bucket) DO UPDATE SET
       hits=CASE WHEN request_budgets.expires_at<=now() THEN 1 ELSE request_budgets.hits+1 END,
       expires_at=CASE WHEN request_budgets.expires_at<=now() THEN now()+$2*interval '1 second' ELSE request_budgets.expires_at END
     RETURNING hits`,
    [hash(key), seconds],
  );
  if (result.rows[0].hits > limit)
    throw new ApiError(
      429,
      "A little too much at once. Please try again in a minute.",
    );
}

export async function resolveIdentity(
  request: Request,
): Promise<StudentIdentity | null> {
  if (isLocalDemo()) {
    const result = await query<{
      id: string;
      name: string;
      preferences: Record<string, unknown>;
    }>("SELECT id,name,preferences FROM demo_students WHERE id=$1", [
      DEMO_STUDENT_ID,
    ]);
    return result.rows[0] ? { ...result.rows[0], demo: true } : null;
  }
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
  const result = await query<{
    id: string;
    name: string;
    preferences: Record<string, unknown>;
  }>(
    `SELECT s.id,s.name,s.preferences FROM student_sessions x JOIN demo_students s ON s.id=x.student_id
     WHERE x.token_hash=$1 AND x.expires_at>now()`,
    [hash(cookie)],
  );
  return result.rows[0] ? { ...result.rows[0], demo: false } : null;
}

export async function withIdentity(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    checkRequestOrigin(request);
    const identity = await resolveIdentity(request);
    if (!identity)
      return Response.json(
        {
          error: "Open your workspace to continue.",
          code: "WORKSPACE_SESSION_REQUIRED",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    if (!identity.demo && !["GET", "HEAD"].includes(request.method))
      await consumeRequestBudget("write:" + identity.id, 240);
    return studentContext.run(identity, handler);
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    console.error(
      "Workspace session unavailable",
      error instanceof Error ? error.name : "unknown",
    );
    return Response.json(
      { error: "Your workspace could not be opened. Please try again." },
      { status: 503 },
    );
  }
}

export async function identitySession(request: Request): Promise<Response> {
  try {
    checkRequestOrigin(request);
    const existing = await resolveIdentity(request);
    if (existing)
      return Response.json(
        { student: existing },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (request.method !== "POST")
      return Response.json(
        { student: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    const address =
      request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
    await consumeRequestBudget("new-workspace:" + address, 60, 3600);
    const token = randomBytes(32).toString("base64url");
    const student = {
      id: "learner-" + crypto.randomUUID(),
      name: "Learner",
      demo: false,
      preferences: {},
    };
    await transaction(async (client) => {
      await client.query("INSERT INTO demo_students(id,name) VALUES($1,$2)", [
        student.id,
        student.name,
      ]);
      await client.query(
        "INSERT INTO student_sessions(token_hash,student_id,expires_at) VALUES($1,$2,now()+$3*interval '1 second')",
        [hash(token), student.id, lifetimeSeconds],
      );
    });
    const secure =
      new URL(request.url).protocol === "https:" || Boolean(process.env.VERCEL);
    return Response.json(
      { student },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetimeSeconds}${secure ? "; Secure" : ""}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error(
      "Workspace creation failed",
      error instanceof Error ? error.name : "unknown",
    );
    return Response.json(
      {
        error:
          "Your workspace could not be created. Check the database connection and try again.",
      },
      { status: 503 },
    );
  }
}
