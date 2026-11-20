CREATE TABLE IF NOT EXISTS student_sessions (
 token_hash text PRIMARY KEY,
 student_id text NOT NULL REFERENCES demo_students(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 CHECK(length(token_hash)=64)
);
CREATE INDEX IF NOT EXISTS student_sessions_owner ON student_sessions(student_id);
CREATE INDEX IF NOT EXISTS projects_owner ON projects(student_id);
CREATE TABLE IF NOT EXISTS request_budgets (
 bucket text PRIMARY KEY,
 hits integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL
);
