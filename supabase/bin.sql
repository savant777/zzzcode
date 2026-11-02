BEGIN;
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS can_manage_secret boolean NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false;
DROP POLICY IF EXISTS "Hide secret template content" ON public.templates;
CREATE POLICY "Hide secret template content" ON public.templates AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT is_secret OR public.can_edit_template(id));
CREATE OR REPLACE FUNCTION public.save_template(p_template_id bigint, p_data jsonb, p_password text, p_password_encrypted text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  saved public.templates%ROWTYPE;
  existing public.templates%ROWTYPE;
  protected boolean := coalesce((p_data->>'is_personal')::boolean, false);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_active_creator(auth.uid()) OR public.is_owner(auth.uid())) THEN
    RAISE EXCEPTION 'CREATOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_template_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.templates WHERE id = p_template_id FOR UPDATE;
    IF NOT FOUND OR NOT public.can_edit_template(p_template_id) THEN
      RAISE EXCEPTION 'TEMPLATE_OWNER_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF coalesce((p_data->>'is_secret')::boolean, coalesce(existing.is_secret, false)) IS DISTINCT FROM coalesce(existing.is_secret, false)
    AND NOT (public.is_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.creators WHERE user_id=auth.uid() AND is_active AND can_manage_secret)) THEN
    RAISE EXCEPTION 'SECRET_PERMISSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF protected AND (p_password IS NULL OR p_password = '') AND
    (p_template_id IS NULL OR NOT EXISTS (SELECT 1 FROM template_private.credentials WHERE template_id = p_template_id)) THEN
    RAISE EXCEPTION 'PASSWORD_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF p_template_id IS NULL THEN
    INSERT INTO public.templates(title, description, html_blueprint, fields_config, preview_url, is_personal, supports_multiple_drafts, is_active, user_id, is_secret)
    VALUES (p_data->>'title', p_data->>'description', p_data->>'html_blueprint', coalesce(p_data->'fields_config', '[]'::jsonb),
      p_data->>'preview_url', protected, coalesce((p_data->>'supports_multiple_drafts')::boolean, false), false, auth.uid(), coalesce((p_data->>'is_secret')::boolean, false))
    RETURNING * INTO saved;
  ELSE
    UPDATE public.templates SET title=p_data->>'title', description=p_data->>'description', html_blueprint=p_data->>'html_blueprint',
      is_secret=coalesce((p_data->>'is_secret')::boolean, existing.is_secret), fields_config=coalesce(p_data->'fields_config', '[]'::jsonb), preview_url=p_data->>'preview_url', is_personal=protected,
      supports_multiple_drafts=coalesce((p_data->>'supports_multiple_drafts')::boolean, false), updated_at=now()
    WHERE id=p_template_id RETURNING * INTO saved;
  END IF;
  IF protected THEN
    IF p_password IS NOT NULL AND p_password <> '' THEN
      INSERT INTO template_private.credentials(template_id, password_hash, password_encrypted)
      VALUES (saved.id, extensions.crypt(template_private.fingerprint(saved.id, p_password), extensions.gen_salt('bf', 12)), p_password_encrypted)
      ON CONFLICT (template_id) DO UPDATE SET password_hash=EXCLUDED.password_hash, password_encrypted=EXCLUDED.password_encrypted;
    END IF;
  ELSE
    DELETE FROM template_private.credentials WHERE template_id=saved.id;
  END IF;
  RETURN jsonb_build_object('id', saved.id, 'is_active', saved.is_active);
END;
$$;
REVOKE ALL ON FUNCTION public.save_template(bigint, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_template(bigint, jsonb, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.template_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY id DESC), '[]'::jsonb) FROM (
    SELECT t.id, jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description, 'preview_url', t.preview_url,
      'user_id', t.user_id,
      'editor_ids', coalesce((SELECT jsonb_agg(DISTINCT g.user_id)
        FROM public.template_tags tt JOIN public.tags g ON g.id=tt.tags_id
        JOIN public.tag_groups tg ON tg.id=g.group_id
        WHERE tt.template_id=t.id AND g.user_id IS NOT NULL AND lower(trim(tg.name))='creators'
          AND EXISTS (SELECT 1 FROM public.creator_credit_links l
            WHERE l.uploader_id=t.user_id AND l.credited_creator_id=g.user_id)), '[]'::jsonb), 'is_active', t.is_active, 'is_personal', t.is_personal,
      'template_tags', coalesce((SELECT jsonb_agg(jsonb_build_object('tags', jsonb_build_object(
        'id', g.id, 'name', g.name, 'slug', g.slug, 'is_active', g.is_active,
        'tag_groups', jsonb_build_object('name', tg.name))) ORDER BY g.id)
        FROM public.template_tags tt JOIN public.tags g ON g.id = tt.tags_id
        JOIN public.tag_groups tg ON tg.id = g.group_id
        WHERE tt.template_id = t.id AND g.is_active = true), '[]'::jsonb)
    ) AS item FROM public.templates t
    WHERE NOT t.is_secret AND (t.is_active = true OR (SELECT public.is_owner(auth.uid())) OR public.can_edit_template(t.id))
  ) entries;
$$;
REVOKE ALL ON FUNCTION public.template_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.template_catalog() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bin_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY id DESC), '[]'::jsonb) FROM (
    SELECT t.id, jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description, 'preview_url', t.preview_url,
      'user_id', t.user_id,
      'editor_ids', coalesce((SELECT jsonb_agg(DISTINCT g.user_id)
        FROM public.template_tags tt JOIN public.tags g ON g.id=tt.tags_id
        JOIN public.tag_groups tg ON tg.id=g.group_id
        WHERE tt.template_id=t.id AND g.user_id IS NOT NULL AND lower(trim(tg.name))='creators'
          AND EXISTS (SELECT 1 FROM public.creator_credit_links l
            WHERE l.uploader_id=t.user_id AND l.credited_creator_id=g.user_id)), '[]'::jsonb), 'is_active', t.is_active, 'is_personal', t.is_personal,
      'template_tags', coalesce((SELECT jsonb_agg(jsonb_build_object('tags', jsonb_build_object(
        'id', g.id, 'name', g.name, 'slug', g.slug, 'is_active', g.is_active,
        'tag_groups', jsonb_build_object('name', tg.name))) ORDER BY g.id)
        FROM public.template_tags tt JOIN public.tags g ON g.id = tt.tags_id
        JOIN public.tag_groups tg ON tg.id = g.group_id
        WHERE tt.template_id = t.id AND g.is_active = true), '[]'::jsonb)
    ) AS item FROM public.templates t
    WHERE t.is_secret AND t.is_active = true
  ) entries;
$$;
REVOKE ALL ON FUNCTION public.bin_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bin_catalog() TO service_role;


-- Protect direct writes too, including self-service creator profile updates.
CREATE OR REPLACE FUNCTION public.guard_secret_permissions() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='creators' THEN
    IF (TG_OP='INSERT' AND NEW.can_manage_secret) OR (TG_OP='UPDATE' AND NEW.can_manage_secret IS DISTINCT FROM OLD.can_manage_secret) THEN
      IF NOT coalesce(public.is_owner(auth.uid()),false) THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
    END IF;
  ELSE
    IF (TG_OP='INSERT' AND NEW.is_secret) OR (TG_OP='UPDATE' AND NEW.is_secret IS DISTINCT FROM OLD.is_secret) THEN
      IF NOT (coalesce(public.is_owner(auth.uid()),false) OR EXISTS (SELECT 1 FROM public.creators WHERE user_id=auth.uid() AND is_active AND can_manage_secret)) THEN RAISE EXCEPTION 'SECRET_PERMISSION_REQUIRED'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_creator_secret_permissions ON public.creators;
CREATE TRIGGER guard_creator_secret_permissions BEFORE INSERT OR UPDATE ON public.creators FOR EACH ROW EXECUTE FUNCTION public.guard_secret_permissions();
DROP TRIGGER IF EXISTS guard_template_secret_permissions ON public.templates;
CREATE TRIGGER guard_template_secret_permissions BEFORE INSERT OR UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.guard_secret_permissions();
NOTIFY pgrst, 'reload schema';
COMMIT;
