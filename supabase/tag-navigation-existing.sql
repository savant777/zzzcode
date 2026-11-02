-- Run once after tag-navigation.sql and tag-navigation-permissions.sql.
-- This updates existing tags only; future tags keep their configured defaults.
BEGIN;
UPDATE public.tags
SET display_on = CASE
  WHEN group_id IN (1, 2, 3)
    THEN ARRAY['roleplayth','hogthai','bin','hogthai_bin']::text[]
  ELSE ARRAY['roleplayth']::text[]
END;
NOTIFY pgrst, 'reload schema';
COMMIT;
