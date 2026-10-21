-- Run AFTER display-template-passwords.sql and policies.sql.
-- Credit is attribution and grants the linked active creator editing access.
BEGIN;

-- Directional permission: uploader may assign credit to credited_creator_id.
CREATE TABLE IF NOT EXISTS public.creator_credit_links (
  uploader_id uuid NOT NULL REFERENCES public.creators(user_id) ON DELETE CASCADE,
  credited_creator_id uuid NOT NULL REFERENCES public.creators(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (uploader_id, credited_creator_id),
  CHECK (uploader_id <> credited_creator_id)
);
ALTER TABLE public.creator_credit_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_credit_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_credit_links TO authenticated;
GRANT ALL ON public.creator_credit_links TO service_role;
DROP POLICY IF EXISTS "Read own credit links" ON public.creator_credit_links;
CREATE POLICY "Read own credit links" ON public.creator_credit_links FOR SELECT TO authenticated
USING (auth.uid() IN (uploader_id,credited_creator_id));
DROP POLICY IF EXISTS "Owner manages credit links" ON public.creator_credit_links;
CREATE POLICY "Owner manages credit links" ON public.creator_credit_links FOR ALL TO authenticated
USING (public.is_owner(auth.uid())) WITH CHECK (public.is_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_allowed_creator_credit(p_uploader_id uuid, p_tag_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tags g JOIN public.tag_groups tg ON tg.id=g.group_id
    WHERE g.id=p_tag_id AND g.is_active=true AND lower(trim(tg.name))='creators'
      AND (g.user_id IS NULL OR g.user_id=p_uploader_id OR (
        public.is_active_creator(g.user_id) AND EXISTS (
          SELECT 1 FROM public.creator_credit_links l
          WHERE l.uploader_id=p_uploader_id AND l.credited_creator_id=g.user_id
        )
      ))
  );
$$;
REVOKE ALL ON FUNCTION public.is_allowed_creator_credit(uuid,bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_template_editor(check_user_id uuid, p_template_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_active_creator(check_user_id) AND (
    public.is_owner(check_user_id) OR EXISTS (
      SELECT 1 FROM public.templates t WHERE t.id=p_template_id AND (
        t.user_id=check_user_id OR EXISTS (
          SELECT 1 FROM public.template_tags tt JOIN public.tags g ON g.id=tt.tags_id
          JOIN public.tag_groups tg ON tg.id=g.group_id
          WHERE tt.template_id=t.id AND g.user_id=check_user_id AND lower(trim(tg.name))='creators'
            AND EXISTS (SELECT 1 FROM public.creator_credit_links l
              WHERE l.uploader_id=t.user_id AND l.credited_creator_id=check_user_id)
        )
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.is_template_editor(uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_template_editor(uuid,bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.can_edit_template(p_template_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_template_editor(auth.uid(),p_template_id);
$$;
REVOKE ALL ON FUNCTION public.can_edit_template(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_template(bigint) TO anon, authenticated, service_role;


-- Options are evaluated against the original uploader, even when a friend edits.
CREATE OR REPLACE FUNCTION public.creator_credit_options(p_template_id bigint DEFAULT NULL)
RETURNS bigint[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uploader uuid := auth.uid();
BEGIN
  IF NOT coalesce(public.is_active_creator(auth.uid()),false) THEN
    RAISE EXCEPTION 'CREATOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_template_id IS NOT NULL THEN
    IF NOT public.can_edit_template(p_template_id) THEN
      RAISE EXCEPTION 'TEMPLATE_OWNER_REQUIRED' USING ERRCODE='42501';
    END IF;
    SELECT user_id INTO uploader FROM public.templates WHERE id=p_template_id;
  END IF;
  RETURN ARRAY(SELECT g.id FROM public.tags g WHERE public.is_allowed_creator_credit(uploader,g.id) ORDER BY g.id);
END;
$$;
REVOKE ALL ON FUNCTION public.creator_credit_options(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_credit_options(bigint) TO authenticated;

-- Defense in depth: direct REST writes obey the same credit rules and one-credit limit.
CREATE OR REPLACE FUNCTION public.validate_template_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uploader uuid;
BEGIN
  IF public.is_tag_group_slug((SELECT group_id FROM public.tags WHERE id=NEW.tags_id),'creators') THEN
    SELECT user_id INTO uploader FROM public.templates WHERE id=NEW.template_id FOR UPDATE;
    IF NOT public.is_allowed_creator_credit(uploader,NEW.tags_id) THEN
      RAISE EXCEPTION 'CREATOR_CREDIT_NOT_ALLOWED' USING ERRCODE='42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.template_tags tt JOIN public.tags g ON g.id=tt.tags_id
      WHERE tt.template_id=NEW.template_id AND tt.tags_id<>NEW.tags_id
        AND public.is_tag_group_slug(g.group_id,'creators')
        AND (TG_OP='INSERT' OR (tt.template_id,tt.tags_id) IS DISTINCT FROM (OLD.template_id,OLD.tags_id))) THEN
      RAISE EXCEPTION 'ONE_CREATOR_CREDIT_REQUIRED' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_template_credit() FROM PUBLIC;
DROP TRIGGER IF EXISTS validate_template_credit ON public.template_tags;
CREATE TRIGGER validate_template_credit BEFORE INSERT OR UPDATE ON public.template_tags
FOR EACH ROW EXECUTE FUNCTION public.validate_template_credit();

-- Replace atomically: credited editors do not lose permission midway through a change.
CREATE OR REPLACE FUNCTION public.set_template_creator_credit(p_template_id bigint, p_credit_tag_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uploader uuid;
BEGIN
  SELECT user_id INTO uploader FROM public.templates WHERE id=p_template_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_edit_template(p_template_id) THEN
    RAISE EXCEPTION 'TEMPLATE_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_allowed_creator_credit(uploader,p_credit_tag_id) THEN
    RAISE EXCEPTION 'CREATOR_CREDIT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.template_tags tt USING public.tags g
    WHERE tt.template_id=p_template_id AND tt.tags_id=g.id AND public.is_tag_group_slug(g.group_id,'creators');
  INSERT INTO public.template_tags(template_id,tags_id) VALUES (p_template_id,p_credit_tag_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_template_creator_credit(bigint,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_template_creator_credit(bigint,bigint) TO authenticated;

DROP POLICY IF EXISTS "Protect template content" ON public.templates;
CREATE POLICY "Protect template content" ON public.templates AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING ((is_active=true AND is_personal=false) OR public.can_edit_template(id));
DROP POLICY IF EXISTS "Allow credited creators read templates" ON public.templates;
CREATE POLICY "Allow credited creators read templates" ON public.templates FOR SELECT TO authenticated
USING (public.can_edit_template(id));
DROP POLICY IF EXISTS "Allow credited creators update templates" ON public.templates;
CREATE POLICY "Allow credited creators update templates" ON public.templates FOR UPDATE TO authenticated
USING (public.can_edit_template(id)) WITH CHECK (public.can_edit_template(id));

-- Direct updates cannot transfer ownership, even by a credited editor.
CREATE OR REPLACE FUNCTION public.preserve_template_uploader()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'TEMPLATE_UPLOADER_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS preserve_template_uploader ON public.templates;
CREATE TRIGGER preserve_template_uploader BEFORE UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.preserve_template_uploader();

DROP POLICY IF EXISTS "Allow creators manage own template_tags" ON public.template_tags;
DROP POLICY IF EXISTS "Allow editors read template_tags" ON public.template_tags;
CREATE POLICY "Allow editors read template_tags" ON public.template_tags FOR SELECT TO authenticated
USING (public.can_edit_template(template_id));
DROP POLICY IF EXISTS "Allow editors insert template_tags" ON public.template_tags;
CREATE POLICY "Allow editors insert template_tags" ON public.template_tags FOR INSERT TO authenticated
WITH CHECK (public.can_edit_template(template_id) AND EXISTS (
  SELECT 1 FROM public.tags g WHERE g.id=tags_id AND g.is_active=true AND (
    g.user_id IS NULL OR g.user_id=auth.uid() OR public.is_owner(auth.uid())
    OR public.is_tag_group_slug(g.group_id,'creators')
  )
));
DROP POLICY IF EXISTS "Allow editors delete template_tags" ON public.template_tags;
CREATE POLICY "Allow editors delete template_tags" ON public.template_tags FOR DELETE TO authenticated
USING (public.can_edit_template(template_id));

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
  IF protected AND (p_password IS NULL OR p_password = '') AND
    (p_template_id IS NULL OR NOT EXISTS (SELECT 1 FROM template_private.credentials WHERE template_id = p_template_id)) THEN
    RAISE EXCEPTION 'PASSWORD_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF p_template_id IS NULL THEN
    INSERT INTO public.templates(title, description, html_blueprint, fields_config, preview_url, is_personal, supports_multiple_drafts, is_active, user_id)
    VALUES (p_data->>'title', p_data->>'description', p_data->>'html_blueprint', coalesce(p_data->'fields_config', '[]'::jsonb),
      p_data->>'preview_url', protected, coalesce((p_data->>'supports_multiple_drafts')::boolean, false), false, auth.uid())
    RETURNING * INTO saved;
  ELSE
    UPDATE public.templates SET title=p_data->>'title', description=p_data->>'description', html_blueprint=p_data->>'html_blueprint',
      fields_config=coalesce(p_data->'fields_config', '[]'::jsonb), preview_url=p_data->>'preview_url', is_personal=protected,
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
    WHERE t.is_active = true OR (SELECT public.is_owner(auth.uid()))
      OR public.can_edit_template(t.id)
  ) entries;
$$;
REVOKE ALL ON FUNCTION public.template_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.template_catalog() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
