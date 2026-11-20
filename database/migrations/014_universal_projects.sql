ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_kind text NOT NULL DEFAULT 'custom' CHECK (project_kind IN ('course','exam','school','personal','custom'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS institution text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS course_code text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS qualification text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS learning_goal text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS syllabus_text text NOT NULL DEFAULT '';
-- Existing demonstration projects keep all content; only identify their context.
UPDATE projects SET project_kind='exam' WHERE student_id='adi-demo' AND exam IN ('JEE Main + Advanced','JEE Main','JEE Advanced','NEET','GMAT','SAT');
UPDATE projects SET project_kind='course' WHERE student_id='adi-demo' AND exam IN ('University','University / Custom','Engineering');
