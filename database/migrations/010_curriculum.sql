CREATE TABLE curriculum_templates(id text PRIMARY KEY,name text NOT NULL,family text NOT NULL,version text NOT NULL,subjects jsonb NOT NULL,question_types jsonb NOT NULL,coverage_status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE project_curriculum(project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,template_id text NOT NULL REFERENCES curriculum_templates(id),version_label text NOT NULL DEFAULT 'starter-v1',revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE curriculum_topics(id text PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,code text NOT NULL,title text NOT NULL,subject text NOT NULL,coverage text NOT NULL DEFAULT 'not-started' CHECK(coverage IN ('not-started','in-progress','covered')),confidence text NOT NULL DEFAULT 'unset' CHECK(confidence IN ('unset','low','medium','high')),active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,id),UNIQUE(project_id,code));
CREATE TABLE curriculum_prerequisites(project_id text NOT NULL,topic_id text NOT NULL,prerequisite_id text NOT NULL,CHECK(topic_id<>prerequisite_id),PRIMARY KEY(project_id,topic_id,prerequisite_id),FOREIGN KEY(project_id,topic_id) REFERENCES curriculum_topics(project_id,id) ON DELETE CASCADE,FOREIGN KEY(project_id,prerequisite_id) REFERENCES curriculum_topics(project_id,id) ON DELETE CASCADE);
CREATE TABLE curriculum_changes(id text PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,from_revision integer NOT NULL,to_revision integer NOT NULL,version_label text NOT NULL,snapshot jsonb NOT NULL,mapping jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,to_revision));
CREATE TABLE course_assessments(id text PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title text NOT NULL,course text NOT NULL DEFAULT '',weight numeric NOT NULL CHECK(weight>0 AND weight<=100),max_mark numeric NOT NULL CHECK(max_mark>0 AND max_mark<1000000000),mark numeric CHECK(mark>=0 AND mark<=max_mark),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,id));
CREATE INDEX curriculum_project_active ON curriculum_topics(project_id,active,subject);
CREATE OR REPLACE FUNCTION reject_curriculum_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM projects WHERE id=NEW.project_id FOR UPDATE;
 IF EXISTS(WITH RECURSIVE ancestors(id) AS (SELECT NEW.prerequisite_id UNION SELECT p.prerequisite_id FROM curriculum_prerequisites p JOIN ancestors a ON p.topic_id=a.id WHERE p.project_id=NEW.project_id) SELECT 1 FROM ancestors WHERE id=NEW.topic_id) THEN RAISE EXCEPTION 'Prerequisites cannot contain a cycle' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER curriculum_cycle_check BEFORE INSERT OR UPDATE ON curriculum_prerequisites FOR EACH ROW EXECUTE FUNCTION reject_curriculum_cycle();
CREATE OR REPLACE FUNCTION check_assessment_weight() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM projects WHERE id=NEW.project_id FOR UPDATE;
 IF NEW.weight + COALESCE((SELECT sum(weight) FROM course_assessments WHERE project_id=NEW.project_id AND course=NEW.course AND id<>NEW.id),0)>100 THEN RAISE EXCEPTION 'Assessment weights for this course cannot total more than 100 percent' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_weight_check BEFORE INSERT OR UPDATE ON course_assessments FOR EACH ROW EXECUTE FUNCTION check_assessment_weight();
