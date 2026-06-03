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

CREATE TRIGGER tags_slug_trigger
BEFORE INSERT OR UPDATE ON tags
FOR EACH ROW EXECUTE PROCEDURE trigger_slugify_tags();

CREATE INDEX idx_template_tags_tags_id ON template_tags(tags_id);
CREATE INDEX idx_tags_group_id ON tags(group_id);
