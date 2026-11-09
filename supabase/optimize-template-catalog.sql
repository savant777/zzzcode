-- Run after bin.sql and shared-creator-credit.sql. Rerunnable.
BEGIN;
CREATE OR REPLACE FUNCTION public.template_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH viewer AS MATERIALIZED (
    SELECT auth.uid() AS id, public.is_owner(auth.uid()) AS owner,
      public.is_active_creator(auth.uid()) AS creator
  ), tag_data AS MATERIALIZED (
    SELECT tt.template_id,
      jsonb_agg(jsonb_build_object('tags', jsonb_build_object(
        'id', g.id, 'name', g.name, 'slug', g.slug, 'is_active', g.is_active,
        'tag_groups', jsonb_build_object('name', tg.name))) ORDER BY g.id)
        FILTER (WHERE g.is_active = true) AS template_tags,
      array_agg(DISTINCT g.user_id) FILTER (WHERE g.user_id IS NOT NULL
        AND lower(trim(tg.name)) = 'creators'
        AND EXISTS (SELECT 1 FROM public.creator_credit_links l
          WHERE l.uploader_id = t.user_id AND l.credited_creator_id = g.user_id)) AS editor_ids
    FROM public.template_tags tt
    JOIN public.templates t ON t.id = tt.template_id
    JOIN public.tags g ON g.id = tt.tags_id
    JOIN public.tag_groups tg ON tg.id = g.group_id
    GROUP BY tt.template_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'description', t.description, 'preview_url', t.preview_url,
    'user_id', t.user_id, 'editor_ids', coalesce(to_jsonb(d.editor_ids), '[]'::jsonb),
    'is_active', t.is_active, 'is_personal', t.is_personal,
    'template_tags', coalesce(d.template_tags, '[]'::jsonb)
  ) ORDER BY t.id DESC), '[]'::jsonb)
  FROM public.templates t CROSS JOIN viewer v
  LEFT JOIN tag_data d ON d.template_id = t.id
  WHERE NOT t.is_secret AND (t.is_active = true OR v.owner OR (v.creator AND (
    t.user_id = v.id OR v.id = ANY(d.editor_ids)
  )));
$$;
REVOKE ALL ON FUNCTION public.template_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.template_catalog() TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
