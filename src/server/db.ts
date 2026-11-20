import "dotenv/config";
import { studentContext, isLocalDemo } from "./identity-context";
import pg, { type PoolClient, type QueryResultRow } from "pg";
// DATE is a calendar date, never a midnight instant converted between timezones.
pg.types.setTypeParser(1082, (value) => value);
const globalForDb = globalThis as unknown as { ingeniumPool?: pg.Pool };
export const pool =
  globalForDb.ingeniumPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 3 : 8,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
if (process.env.NODE_ENV !== "production") globalForDb.ingeniumPool = pool;
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient,
) {
  return (client ?? pool).query<T>(text, values);
}
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export const DEMO_STUDENT_ID = "adi-demo";
export function id(prefix = "item") {
  return `${prefix}-${crypto.randomUUID()}`;
}
export function camel(row: Record<string, any>): any {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const name = key.replace(/_([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
    result[name] =
      value instanceof Date
        ? ["date", "targetDate", "dueDate", "nextReview", "nextDue"].includes(
            name,
          )
          ? value.toISOString().slice(0, 10)
          : value.toISOString()
        : value;
  }
  for (const key of [
    "position",
    "watchedSeconds",
    "score",
    "maxScore",
    "elapsedSeconds",
    "tolerance",
  ])
    if (result[key] !== null && result[key] !== undefined)
      result[key] = Number(result[key]);
  return result;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: unknown,
  ) {
    super(message);
  }
}
export function currentStudentId() {
  const identity = studentContext.getStore();
  if (identity) return identity.id;
  if (isLocalDemo()) return DEMO_STUDENT_ID;
  throw new ApiError(401, "Open your workspace to continue.");
}
export async function projectExists(projectId: string) {
  const result = await query(
    "SELECT * FROM projects WHERE id=$1 AND student_id=$2",
    [projectId, currentStudentId()],
  );
  if (!result.rows[0]) throw new ApiError(404, "Project not found");
  return camel(result.rows[0]);
}
export async function scoped(
  table: string,
  projectId: string,
  recordId: string,
  client?: PoolClient,
) {
  const allowed = [
    "conversations",
    "artifacts",
    "resources",
    "tasks",
    "plans",
    "lessons",
    "questions",
    "test_sessions",
    "attempts",
    "mistakes",
    "flashcards",
    "focus_sessions",
    "jobs",
  ];
  if (!allowed.includes(table)) throw new Error("Unsupported entity");
  const result = await query(
    `SELECT * FROM ${table} WHERE project_id=$1 AND id=$2`,
    [projectId, recordId],
    client,
  );
  if (!result.rows[0])
    throw new ApiError(404, "Item not found in this project");
  return result.rows[0];
}

export async function requireTool(projectId: string, tool: string) {
  const project = await projectExists(projectId);
  const enabled = project.settings?.enabledTools;
  if (
    Array.isArray(enabled) &&
    !enabled.includes(tool) &&
    !(tool === "practise" && enabled.includes("practice"))
  )
    throw new ApiError(
      403,
      "This tool is disabled in project settings. Saved work remains available to read.",
    );
}
