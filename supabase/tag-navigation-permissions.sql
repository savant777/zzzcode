BEGIN;
ALTER TABLE public.tags ALTER COLUMN display_on SET DEFAULT ARRAY['roleplayth']::text[];
CREATE OR REPLACE FUNCTION public.guard_tag_navigation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT (coalesce(public.is_owner(auth.uid()),false) OR EXISTS (
    SELECT 1 FROM public.creators WHERE user_id=auth.uid() AND is_active AND can_manage_secret
  )) THEN
    -- Anyone who can manage this tag may change its public navigation choices.
    -- Only secret managers may change its existing bin choices.
    NEW.display_on := ARRAY(SELECT page FROM unnest(NEW.display_on) AS page
      WHERE page IN ('roleplayth','hogthai'));
    IF TG_OP='UPDATE' THEN
      NEW.display_on := NEW.display_on || ARRAY(SELECT page FROM unnest(OLD.display_on) AS page
        WHERE page IN ('bin','hogthai_bin'));
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_tag_navigation ON public.tags;
CREATE TRIGGER guard_tag_navigation BEFORE INSERT OR UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.guard_tag_navigation();
NOTIFY pgrst, 'reload schema';
COMMIT;
