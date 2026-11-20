ALTER TABLE lessons ADD COLUMN IF NOT EXISTS last_watched_at timestamptz;
CREATE INDEX IF NOT EXISTS lessons_project_last_watched ON lessons(project_id,last_watched_at DESC) WHERE last_watched_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS lessons_project_video ON lessons(project_id,video_id);
CREATE TABLE IF NOT EXISTS lesson_playback_sessions (
 project_id text NOT NULL, lesson_id text NOT NULL, session_id text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), last_event_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 position numeric NOT NULL DEFAULT 0 CHECK(position>=0), measured_seconds numeric NOT NULL DEFAULT 0 CHECK(measured_seconds>=0),
 state text NOT NULL DEFAULT 'playing' CHECK(state IN ('playing','paused','ended','seeked','closed')),
 PRIMARY KEY(project_id,lesson_id,session_id),
 FOREIGN KEY(project_id,lesson_id) REFERENCES lessons(project_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lesson_playback_events (
 project_id text NOT NULL, event_id text NOT NULL, lesson_id text NOT NULL, session_id text NOT NULL,
 position numeric NOT NULL CHECK(position>=0), measured_seconds numeric NOT NULL DEFAULT 0 CHECK(measured_seconds BETWEEN 0 AND 60),
 state text NOT NULL CHECK(state IN ('playing','paused','ended','seeked','closed')), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,event_id),
 FOREIGN KEY(project_id,lesson_id,session_id) REFERENCES lesson_playback_sessions(project_id,lesson_id,session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS playback_events_project_time ON lesson_playback_events(project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS youtube_cache (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, cache_key text NOT NULL,
 payload jsonb NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,cache_key)
);
CREATE TABLE IF NOT EXISTS youtube_cursors (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('search','playlist')), query_hash text NOT NULL, provider_cursor text NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS youtube_cursors_expiry ON youtube_cursors(expires_at);
