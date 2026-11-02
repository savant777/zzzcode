BEGIN;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS display_on text[] NOT NULL DEFAULT ARRAY['roleplayth','hogthai','bin','hogthai_bin']::text[];
-- Preserve the existing community menu grouping for existing tags.
UPDATE public.tags t SET display_on=ARRAY['roleplayth','bin']::text[]
FROM public.tag_groups g WHERE t.group_id=g.id
AND lower(trim(g.name)) NOT IN ('creators','category','css','style');
ALTER TABLE public.tags ADD CONSTRAINT tags_display_on_valid CHECK (display_on <@ ARRAY['roleplayth','hogthai','bin','hogthai_bin']::text[] AND array_position(display_on, NULL) IS NULL);
NOTIFY pgrst, 'reload schema';
COMMIT;
