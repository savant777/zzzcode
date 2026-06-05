CREATE OR REPLACE FUNCTION slugify(value TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Generates URL-friendly slugs while preserving supported Thai characters.
  RETURN lower(regexp_replace(regexp_replace(trim(value), '[^a-zA-Z0-9ก-ี้่้็่\s]', '', 'g'), '\s+', '-', 'g'));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_slugify_tags()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := slugify(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tags_slug_trigger ON tags;
CREATE TRIGGER tags_slug_trigger
BEFORE INSERT OR UPDATE ON tags
FOR EACH ROW EXECUTE PROCEDURE trigger_slugify_tags();

CREATE INDEX IF NOT EXISTS idx_template_tags_tags_id ON template_tags(tags_id);
CREATE INDEX IF NOT EXISTS idx_tags_group_id ON tags(group_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_creators_slug ON creators(slug);
CREATE INDEX IF NOT EXISTS idx_creators_active ON creators(is_active);
