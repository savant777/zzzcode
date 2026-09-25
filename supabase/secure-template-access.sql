-- Deploy with the matching app changes. Run as postgres in Supabase SQL Editor.
-- Transactional and rerunnable. Does not delete templates or backups.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN
  IF (SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pgcrypto') <> 'extensions' THEN
    RAISE EXCEPTION 'pgcrypto must be installed in extensions; inspect extension configuration before continuing';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS template_private;
REVOKE ALL ON SCHEMA template_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS template_private.credentials (
  template_id bigint PRIMARY KEY REFERENCES public.templates(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  password_hash text NOT NULL
);
REVOKE ALL ON template_private.credentials FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE template_private.credentials ENABLE ROW LEVEL SECURITY;

-- Matches the existing browser SHA256(JSON.stringify([String(id), password])).
-- bcrypt receives 64 ASCII bytes, avoiding its 72-byte password truncation limit.
CREATE OR REPLACE FUNCTION template_private.fingerprint(id bigint, password text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT encode(extensions.digest(convert_to('[' || to_json(id::text)::text || ',' || to_json(password)::text || ']', 'UTF8'), 'sha256'), 'hex');
$$;
REVOKE ALL ON FUNCTION template_private.fingerprint(bigint, text) FROM PUBLIC, anon, authenticated;

-- Abort rather than silently making an existing protected template inaccessible.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.templates t WHERE t.is_personal = true AND t.password IS NULL
    AND NOT EXISTS (SELECT 1 FROM template_private.credentials c WHERE c.template_id = t.id)) THEN
    RAISE EXCEPTION 'Protected template has no password. Set its password before rerunning this migration.';
  END IF;
END $$;

INSERT INTO template_private.credentials (template_id, password_hash)
SELECT id, extensions.crypt(template_private.fingerprint(id, password), extensions.gen_salt('bf', 12))
FROM public.templates WHERE is_personal = true AND password IS NOT NULL
ON CONFLICT (template_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Keep the existing password column as a write-only input for creator forms.
-- Clear historical plaintext without changing template ordering/timestamps.
DROP TRIGGER IF EXISTS secure_template_password ON public.templates;
ALTER TABLE public.templates DISABLE TRIGGER update_templates_updated_at;
UPDATE public.templates SET password = NULL WHERE password IS NOT NULL;
ALTER TABLE public.templates ENABLE TRIGGER update_templates_updated_at;

CREATE OR REPLACE FUNCTION template_private.capture_password()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_personal IS TRUE THEN
    IF NEW.password IS NOT NULL THEN
      IF length(NEW.password) = 0 THEN RAISE EXCEPTION 'PASSWORD_REQUIRED' USING ERRCODE = '23514'; END IF;
      INSERT INTO template_private.credentials(template_id, password_hash)
      VALUES (NEW.id, extensions.crypt(template_private.fingerprint(NEW.id, NEW.password), extensions.gen_salt('bf', 12)))
      ON CONFLICT (template_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    ELSIF NOT EXISTS (SELECT 1 FROM template_private.credentials WHERE template_id = NEW.id) THEN
      RAISE EXCEPTION 'PASSWORD_REQUIRED' USING ERRCODE = '23514';
    END IF;
  ELSE
    DELETE FROM template_private.credentials WHERE template_id = NEW.id;
  END IF;
  NEW.password := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION template_private.capture_password() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER secure_template_password BEFORE INSERT OR UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION template_private.capture_password();

ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_password_never_stored;
ALTER TABLE public.templates ADD CONSTRAINT templates_password_never_stored CHECK (password IS NULL);

-- Only the trusted server can verify credentials; public callers cannot bypass
-- the server's rate limiter by invoking this RPC themselves.
CREATE OR REPLACE FUNCTION public.verify_template_credential(p_template_id bigint, p_fingerprint text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN p_fingerprint ~ '^[a-f0-9]{64}$' THEN
    EXISTS (SELECT 1 FROM template_private.credentials c WHERE c.template_id = p_template_id
      AND c.password_hash = extensions.crypt(p_fingerprint, c.password_hash)) ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.verify_template_credential(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_template_credential(bigint, text) TO service_role;

-- Restrictive SELECT remains effective even alongside older permissive policies.
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Protect template content" ON public.templates;
CREATE POLICY "Protect template content" ON public.templates AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  (is_active = true AND is_personal = false)
  OR (SELECT public.is_owner(auth.uid()))
  OR (user_id = (SELECT auth.uid()) AND (SELECT public.is_active_creator(auth.uid())))
);

-- Explicit metadata allowlist; never return password, HTML or field defaults.
CREATE OR REPLACE FUNCTION public.template_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY id DESC), '[]'::jsonb) FROM (
    SELECT t.id, jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description, 'preview_url', t.preview_url,
      'user_id', t.user_id, 'is_active', t.is_active, 'is_personal', t.is_personal,
      'template_tags', coalesce((SELECT jsonb_agg(jsonb_build_object('tags', jsonb_build_object(
        'id', g.id, 'name', g.name, 'slug', g.slug, 'is_active', g.is_active,
        'tag_groups', jsonb_build_object('name', tg.name))) ORDER BY g.id)
        FROM public.template_tags tt JOIN public.tags g ON g.id = tt.tags_id
        JOIN public.tag_groups tg ON tg.id = g.group_id
        WHERE tt.template_id = t.id AND g.is_active = true), '[]'::jsonb)
    ) AS item FROM public.templates t
    WHERE t.is_active = true OR (SELECT public.is_owner(auth.uid()))
      OR (t.user_id = (SELECT auth.uid()) AND (SELECT public.is_active_creator(auth.uid())))
  ) entries;
$$;
REVOKE ALL ON FUNCTION public.template_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.template_catalog() TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
