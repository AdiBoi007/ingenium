-- Keep delayed keepalive/beacon events from replacing a newer resume position.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS last_playback_at timestamptz;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS last_playback_session_id text;
ALTER TABLE lesson_playback_sessions ADD COLUMN IF NOT EXISTS last_sequence bigint NOT NULL DEFAULT -1 CHECK(last_sequence>=-1);
ALTER TABLE lesson_playback_sessions ADD COLUMN IF NOT EXISTS last_occurred_at timestamptz;
ALTER TABLE lesson_playback_events ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE lesson_playback_events ADD COLUMN IF NOT EXISTS sequence bigint CHECK(sequence>=0);
