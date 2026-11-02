BEGIN;
CREATE OR REPLACE FUNCTION public.guard_bin_tag_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tag_id bigint;
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') AND auth.uid() IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='DELETE' THEN tag_id := OLD.tags_id; ELSE tag_id := NEW.tags_id; END IF;
  IF EXISTS (SELECT 1 FROM public.tags WHERE (id=tag_id OR (TG_OP='UPDATE' AND id=OLD.tags_id))
    AND display_on && ARRAY['bin','hogthai_bin']::text[]
    AND NOT (display_on && ARRAY['roleplayth','hogthai']::text[]))
    AND NOT (coalesce(public.is_owner(auth.uid()),false) OR EXISTS (
      SELECT 1 FROM public.creators WHERE user_id=auth.uid() AND is_active AND can_manage_secret
    )) THEN RAISE EXCEPTION 'SECRET_TAG_PERMISSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
DROP TRIGGER IF EXISTS guard_bin_tag_assignment ON public.template_tags;
CREATE TRIGGER guard_bin_tag_assignment BEFORE INSERT OR UPDATE OR DELETE ON public.template_tags FOR EACH ROW EXECUTE FUNCTION public.guard_bin_tag_assignment();
NOTIFY pgrst, 'reload schema';
COMMIT;
