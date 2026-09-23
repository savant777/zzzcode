-- Allow deactivation and RETURNING of a creator's own inactive templates.
-- Public visibility and ownership checks for updates remain unchanged.
BEGIN;

DROP POLICY IF EXISTS "Allow creators read own templates" ON public.templates;
CREATE POLICY "Allow creators read own templates"
ON public.templates
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
);

-- Keep existing tag associations visible to the template creator even while
-- the template is inactive. Tag visibility itself still follows tags RLS.
DROP POLICY IF EXISTS "Allow creators read own template_tags" ON public.template_tags;
CREATE POLICY "Allow creators read own template_tags"
ON public.template_tags
FOR SELECT
TO authenticated
USING (
  public.is_active_creator(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.templates t
    WHERE t.id = template_tags.template_id AND t.user_id = auth.uid()
  )
);

COMMIT;
