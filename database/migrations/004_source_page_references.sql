ALTER TABLE source_chunks ADD COLUMN IF NOT EXISTS page integer CHECK(page>0);
ALTER TABLE source_chunks ADD COLUMN IF NOT EXISTS start_offset integer CHECK(start_offset>=0);
ALTER TABLE source_chunks ADD COLUMN IF NOT EXISTS end_offset integer CHECK(end_offset>=start_offset);
