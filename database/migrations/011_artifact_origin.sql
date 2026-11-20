ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS origin_conversation_id text;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS origin_conversation_title text;
UPDATE artifacts a SET origin_conversation_id=a.conversation_id,origin_conversation_title=c.title FROM conversations c WHERE a.project_id=c.project_id AND a.conversation_id=c.id AND a.origin_conversation_id IS NULL;
