-- Run after secure-template-access.sql. Credentials already live in template_private.
BEGIN;
-- Refuse to discard unmigrated credentials.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.templates t WHERE t.is_personal IS TRUE
    AND NOT EXISTS (SELECT 1 FROM template_private.credentials c WHERE c.template_id=t.id)) THEN
    RAISE EXCEPTION 'Migrate all protected template credentials before dropping password.';
  END IF;
END $$;
DROP TRIGGER IF EXISTS secure_template_password ON public.templates;
DROP FUNCTION IF EXISTS template_private.capture_password();
ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_password_never_stored;
ALTER TABLE public.templates DROP COLUMN IF EXISTS password;

-- Save metadata and credentials together; callers cannot choose ownership or activation.
CREATE OR REPLACE FUNCTION public.save_template(p_template_id bigint, p_data jsonb, p_password text DEFAULT NULL)
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
    IF NOT FOUND OR (existing.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_owner(auth.uid())) THEN
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
      INSERT INTO template_private.credentials(template_id, password_hash)
      VALUES (saved.id, extensions.crypt(template_private.fingerprint(saved.id, p_password), extensions.gen_salt('bf', 12)))
      ON CONFLICT (template_id) DO UPDATE SET password_hash=EXCLUDED.password_hash;
    END IF;
  ELSE
    DELETE FROM template_private.credentials WHERE template_id=saved.id;
  END IF;
  RETURN jsonb_build_object('id', saved.id, 'is_active', saved.is_active);
END;
$$;
REVOKE ALL ON FUNCTION public.save_template(bigint, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_template(bigint, jsonb, text) TO authenticated;
COMMIT;
