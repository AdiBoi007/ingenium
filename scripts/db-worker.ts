import "dotenv/config";
import { drainIngestionJobs } from "../src/server/ingestion";
import { pool } from "../src/server/db";
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log("Ingenium ingestion worker ready. Press Ctrl+C to stop.");
while (!stopping) {
  const count = await drainIngestionJobs();
  if (count) console.log(`Processed ${count} stored upload job(s).`);
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
await pool.end();
