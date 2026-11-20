ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS question_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attempt_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE tasks ADD CONSTRAINT tasks_question_fkey FOREIGN KEY(project_id,question_id) REFERENCES questions(project_id,id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT tasks_attempt_fkey FOREIGN KEY(project_id,attempt_id) REFERENCES attempts(project_id,id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT tasks_session_fkey FOREIGN KEY(project_id,session_id) REFERENCES test_sessions(project_id,id) ON DELETE CASCADE;
