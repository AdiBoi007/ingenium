import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { pool } from "../src/server/db";
await pool.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
);
for (const file of (await readdir("database/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const { rowCount } = await pool.query(
    "SELECT version FROM schema_migrations WHERE version=$1",
    [file],
  );
  if (rowCount) continue;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(`database/migrations/${file}`, "utf8"));
    await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [
      file,
    ]);
    await client.query("COMMIT");
    console.log(`Applied ${file}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
await pool.end();
