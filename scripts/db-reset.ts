import "dotenv/config";
import { pool } from "../src/server/db";
if (!process.argv.includes("--confirm=ingenium-demo"))
  throw new Error(
    "Destructive demo reset requires: npm run demo:reset -- --confirm=ingenium-demo",
  );
const db = (await pool.query("SELECT current_database() AS name")).rows[0].name;
if (db !== "ingenium_demo" || process.env.DEMO_MODE !== "true")
  throw new Error(
    "Reset is restricted to the ingenium_demo database with DEMO_MODE=true",
  );
await pool.query("TRUNCATE demo_students,demo_metadata,projects CASCADE");
await pool.end();
console.log(
  "Demo data reset. Run npm run db:seed to create a new sample week.",
);
