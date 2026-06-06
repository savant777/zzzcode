-- ==========================================
-- 0. CREATOR ACCESS HELPERS
-- ==========================================
-- SECURITY DEFINER helpers avoid recursive RLS checks when policies need to
-- verify whether the current user is an active creator or owner.

CREATE OR REPLACE FUNCTION public.is_active_creator(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.creators c
    WHERE c.user_id = check_user_id
      AND c.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.creators c
    WHERE c.user_id = check_user_id
      AND c.role = 'owner'
      AND c.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_same_creator_role(check_user_id uuid, next_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.creators c
    WHERE c.user_id = check_user_id
      AND c.role = next_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tag_group_slug(check_group_id bigint, check_slug text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tag_groups tg
    WHERE tg.id = check_group_id
      AND lower(regexp_replace(trim(tg.name), '\s+', '-', 'g')) = check_slug
  );
$$;

-- ==========================================
-- 1. CREATORS TABLE
-- ==========================================
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read active creators" ON public.creators;
CREATE POLICY "Allow public read active creators"
ON public.creators
FOR SELECT
TO public
USING (is_active = true);

DROP POLICY IF EXISTS "Allow creators read own profile" ON public.creators;
CREATE POLICY "Allow creators read own profile"
ON public.creators
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow creators update own profile" ON public.creators;
CREATE POLICY "Allow creators update own profile"
ON public.creators
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
  AND public.has_same_creator_role(auth.uid(), role)
  AND is_active = true
);

DROP POLICY IF EXISTS "Allow owner manage creators" ON public.creators;
CREATE POLICY "Allow owner manage creators"
ON public.creators
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

-- ==========================================
-- 2. TAG_GROUPS TABLE
-- ==========================================
ALTER TABLE public.tag_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read tag_groups" ON public.tag_groups;
CREATE POLICY "Allow public read tag_groups"
ON public.tag_groups
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Allow Zoe manage tag_groups" ON public.tag_groups;
DROP POLICY IF EXISTS "Allow owner manage tag_groups" ON public.tag_groups;
CREATE POLICY "Allow owner manage tag_groups"
ON public.tag_groups
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

-- ==========================================
-- 3. TAGS TABLE
-- ==========================================
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read tags" ON public.tags;
CREATE POLICY "Allow public read tags"
ON public.tags
FOR SELECT
TO public
USING (is_active = true);

DROP POLICY IF EXISTS "Allow creators read own tags" ON public.tags;
CREATE POLICY "Allow creators read own tags"
ON public.tags
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow Zoe manage tags" ON public.tags;
DROP POLICY IF EXISTS "Allow owner manage tags" ON public.tags;
CREATE POLICY "Allow owner manage tags"
ON public.tags
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Allow creators insert own tags" ON public.tags;
CREATE POLICY "Allow creators insert own tags"
ON public.tags
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
  AND NOT public.is_tag_group_slug(group_id, 'the-plastics')
);

DROP POLICY IF EXISTS "Allow creators update own tags" ON public.tags;
CREATE POLICY "Allow creators update own tags"
ON public.tags
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
  AND NOT public.is_tag_group_slug(group_id, 'the-plastics')
)
WITH CHECK (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
  AND NOT public.is_tag_group_slug(group_id, 'the-plastics')
);

DROP POLICY IF EXISTS "Allow creators delete own tags" ON public.tags;
CREATE POLICY "Allow creators delete own tags"
ON public.tags
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
  AND NOT public.is_tag_group_slug(group_id, 'the-plastics')
);

-- ==========================================
-- 4. TEMPLATES TABLE
-- ==========================================
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read templates" ON public.templates;
CREATE POLICY "Allow public read templates"
ON public.templates
FOR SELECT
TO public
USING (is_active = true);

DROP POLICY IF EXISTS "Allow Zoe manage templates" ON public.templates;
DROP POLICY IF EXISTS "Allow creators insert own templates" ON public.templates;
CREATE POLICY "Allow creators insert own templates"
ON public.templates
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
);

DROP POLICY IF EXISTS "Allow creators update own templates" ON public.templates;
CREATE POLICY "Allow creators update own templates"
ON public.templates
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
);

DROP POLICY IF EXISTS "Allow creators delete own templates" ON public.templates;
CREATE POLICY "Allow creators delete own templates"
ON public.templates
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
);

DROP POLICY IF EXISTS "Allow owner manage templates" ON public.templates;
CREATE POLICY "Allow owner manage templates"
ON public.templates
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

-- ==========================================
-- 5. TEMPLATE_TAGS (Join Table)
-- ==========================================
ALTER TABLE public.template_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read template_tags" ON public.template_tags;
CREATE POLICY "Allow public read template_tags"
ON public.template_tags
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.templates t
    WHERE t.id = template_tags.template_id
      AND t.is_active = true
  )
);

DROP POLICY IF EXISTS "Allow Zoe manage template_tags" ON public.template_tags;
DROP POLICY IF EXISTS "Allow creators manage own template_tags" ON public.template_tags;
CREATE POLICY "Allow creators manage own template_tags"
ON public.template_tags
FOR ALL
TO authenticated
USING (
  public.is_active_creator(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.templates t
    JOIN public.tags tag ON tag.id = template_tags.tags_id
    WHERE t.id = template_tags.template_id
      AND t.user_id = auth.uid()
      AND (tag.user_id IS NULL OR tag.user_id = auth.uid())
  )
)
WITH CHECK (
  public.is_active_creator(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.templates t
    JOIN public.tags tag ON tag.id = template_tags.tags_id
    WHERE t.id = template_tags.template_id
      AND t.user_id = auth.uid()
      AND (tag.user_id IS NULL OR tag.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Allow owner manage template_tags" ON public.template_tags;
CREATE POLICY "Allow owner manage template_tags"
ON public.template_tags
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));
