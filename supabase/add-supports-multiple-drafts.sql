ALTER TABLE templates
ADD COLUMN IF NOT EXISTS supports_multiple_drafts boolean DEFAULT false;
