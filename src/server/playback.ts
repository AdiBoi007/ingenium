import { z } from "zod";
import {
  ApiError,
  camel,
  projectExists,
  query,
  scoped,
  transaction,
} from "./db";
import type { PoolClient } from "pg";
const eventSchema = z
  .object({
    eventId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/),
    sessionId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/),
    position: z.number().finite().min(0).max(604800),
    duration: z.number().finite().int().min(0).max(604800).optional(),
    watchedSeconds: z.number().finite().min(0).max(60).default(0),
    occurredAt: z.string().datetime().optional(),
    sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    state: z.enum(["playing", "paused", "ended", "seeked", "closed"]),
  })
  .strict();
export async function recordPlayback(
  projectId: string,
  lessonId: string,
  input: unknown,
  client?: PoolClient,
): Promise<any> {
  const event = eventSchema.parse(input);
  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
  if (occurredAt.getTime() > Date.now() + 120000)
    throw new ApiError(400, "Playback event time is too far in the future");
  // Small client clock skew must not reserve a future resume position.
  const observedAt = new Date(Math.min(occurredAt.getTime(), Date.now()));
  const persist = async (connection: PoolClient) => {
    const lesson = (
      await query(
        "SELECT * FROM lessons WHERE project_id=$1 AND id=$2 FOR UPDATE",
        [projectId, lessonId],
        connection,
      )
    ).rows[0];
    if (!lesson) throw new ApiError(404, "Lesson not found in this project");
    const prior = (
      await query(
        "SELECT lesson_id FROM lesson_playback_events WHERE project_id=$1 AND event_id=$2",
        [projectId, event.eventId],
        connection,
      )
    ).rows[0];
    if (prior) {
      if (prior.lesson_id !== lessonId)
        throw new ApiError(
          409,
          "This playback event already belongs to another lesson",
        );
      return camel(lesson);
    }
    const session = (
      await query(
        "SELECT * FROM lesson_playback_sessions WHERE project_id=$1 AND lesson_id=$2 AND session_id=$3",
        [projectId, lessonId, event.sessionId],
        connection,
      )
    ).rows[0];
    const latestInSession =
      !session ||
      (event.sequence !== undefined
        ? event.sequence > Number(session.last_sequence)
        : !session.last_occurred_at ||
          observedAt.getTime() >= new Date(session.last_occurred_at).getTime());
    const latestPosition =
      latestInSession &&
      (!lesson.last_playback_at ||
        observedAt.getTime() >= new Date(lesson.last_playback_at).getTime() ||
        (lesson.last_playback_session_id === event.sessionId &&
          event.sequence !== undefined));
    await query(
      `INSERT INTO lesson_playback_sessions(project_id,lesson_id,session_id,position,state,measured_seconds,ended_at,last_sequence,last_occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5 IN ('ended','closed') THEN $7::timestamptz ELSE NULL END,$8,$7)
       ON CONFLICT(project_id,lesson_id,session_id) DO UPDATE SET
       last_event_at=now(),position=CASE WHEN $9 THEN EXCLUDED.position ELSE lesson_playback_sessions.position END,
       state=CASE WHEN $9 THEN EXCLUDED.state ELSE lesson_playback_sessions.state END,
       measured_seconds=lesson_playback_sessions.measured_seconds+EXCLUDED.measured_seconds,
       ended_at=CASE WHEN $9 THEN EXCLUDED.ended_at ELSE lesson_playback_sessions.ended_at END,
       last_sequence=GREATEST(lesson_playback_sessions.last_sequence,EXCLUDED.last_sequence),
       last_occurred_at=GREATEST(lesson_playback_sessions.last_occurred_at,EXCLUDED.last_occurred_at)`,
      [
        projectId,
        lessonId,
        event.sessionId,
        event.position,
        event.state,
        event.watchedSeconds,
        observedAt,
        event.sequence ?? -1,
        latestInSession,
      ],
      connection,
    );
    await query(
      "INSERT INTO lesson_playback_events(project_id,event_id,lesson_id,session_id,position,measured_seconds,state,occurred_at,sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        projectId,
        event.eventId,
        lessonId,
        event.sessionId,
        event.position,
        event.watchedSeconds,
        event.state,
        observedAt,
        event.sequence ?? null,
      ],
      connection,
    );
    const result = await query(
      `UPDATE lessons SET position=CASE WHEN $8 THEN $3 ELSE position END,
       duration=CASE WHEN $8 THEN COALESCE($4,duration) ELSE duration END,
       watched_seconds=watched_seconds+$5,
       last_watched_at=CASE WHEN $6='playing' OR $5>0 THEN GREATEST(last_watched_at,$7::timestamptz) ELSE last_watched_at END,
       last_playback_at=CASE WHEN $8 THEN GREATEST(last_playback_at,$7::timestamptz) ELSE last_playback_at END,
       last_playback_session_id=CASE WHEN $8 THEN $9 ELSE last_playback_session_id END,
       updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *`,
      [
        projectId,
        lessonId,
        event.position,
        event.duration ?? null,
        event.watchedSeconds,
        event.state,
        observedAt,
        latestPosition,
        event.sessionId,
      ],
      connection,
    );
    return camel(result.rows[0]);
  };
  return client ? persist(client) : transaction(persist);
}
export async function watchHistory(projectId: string, lessonId?: string) {
  if (lessonId) {
    await scoped("lessons", projectId, lessonId);
    return {
      items: (
        await query(
          "SELECT * FROM lesson_playback_sessions WHERE project_id=$1 AND lesson_id=$2 ORDER BY last_event_at DESC LIMIT 200",
          [projectId, lessonId],
        )
      ).rows.map((row) => ({
        ...camel(row),
        measuredSeconds: Number(row.measured_seconds),
      })),
    };
  }
  return {
    items: (
      await query(
        "SELECT l.*, (SELECT count(*)::int FROM lesson_playback_sessions s WHERE s.project_id=l.project_id AND s.lesson_id=l.id AND s.measured_seconds>0) AS session_count FROM lessons l WHERE l.project_id=$1 AND l.last_watched_at IS NOT NULL ORDER BY l.last_watched_at DESC LIMIT 200",
        [projectId],
      )
    ).rows.map(camel),
  };
}
export async function clearWatchHistory(projectId: string, lessonId?: string) {
  return transaction(async (client) => {
    if (lessonId) await scoped("lessons", projectId, lessonId, client);
    // Lock the lesson rows in the same order used by event writes before clearing sessions.
    await query(
      `SELECT id FROM lessons WHERE project_id=$1 ${lessonId ? "AND id=$2" : ""} ORDER BY id FOR UPDATE`,
      [projectId, ...(lessonId ? [lessonId] : [])],
      client,
    );
    await query(
      `DELETE FROM lesson_playback_sessions WHERE project_id=$1 ${lessonId ? "AND lesson_id=$2" : ""}`,
      [projectId, ...(lessonId ? [lessonId] : [])],
      client,
    );
    await query(
      `UPDATE lessons SET position=0,watched_seconds=0,last_watched_at=NULL,last_playback_at=NULL,last_playback_session_id=NULL,updated_at=now() WHERE project_id=$1 ${lessonId ? "AND id=$2" : ""}`,
      [projectId, ...(lessonId ? [lessonId] : [])],
      client,
    );
    return {
      cleared: true,
      notice:
        "Viewing history and resume positions were cleared. Saved lessons, manual completion and notes were retained.",
    };
  });
}
export async function playbackHandler(
  request: Request,
  projectId: string,
  lessonId?: string,
) {
  try {
    await projectExists(projectId);
    if (request.method === "GET")
      return Response.json(await watchHistory(projectId, lessonId), {
        headers: { "Cache-Control": "no-store" },
      });
    if (request.method === "DELETE")
      return Response.json(await clearWatchHistory(projectId, lessonId));
    if (request.method === "POST" && lessonId) {
      if (Number(request.headers.get("content-length") || 0) > 8000)
        throw new ApiError(413, "Playback event too large");
      let input;
      try {
        input = await request.json();
      } catch {
        throw new ApiError(400, "Provide a valid playback event");
      }
      return Response.json({
        item: await recordPlayback(projectId, lessonId, input),
      });
    }
    throw new ApiError(405, "Method not supported");
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Invalid playback event", fields: error.flatten() },
        { status: 400 },
      );
    return Response.json(
      { error: "Playback progress could not be saved. Try again." },
      { status: 500 },
    );
  }
}
