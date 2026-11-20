import type { PoolClient } from "pg";
import { query, transaction } from "./db";
/** Recover durable partial responses on reconnect as well as before a new request. */
export async function recoverStaleGenerations(
  projectId: string,
  client?: PoolClient,
) {
  const recover = async (connection: PoolClient) => {
    const interrupted = await query(
      "UPDATE jobs SET status='interrupted',error='The server did not finish this generation. Retry explicitly.',updated_at=now() WHERE project_id=$1 AND type='generation' AND status='processing' AND updated_at<now()-interval '3 minutes' RETURNING payload",
      [projectId],
      connection,
    );
    for (const job of interrupted.rows)
      await query(
        "UPDATE messages SET status='interrupted' WHERE project_id=$1 AND id=$2 AND status='generating'",
        [projectId, job.payload.assistantId],
        connection,
      );
    return interrupted.rowCount ?? 0;
  };
  return client ? recover(client) : transaction(recover);
}
