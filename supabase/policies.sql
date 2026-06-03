-- ==========================================
-- 1. TAG_GROUPS TABLE
-- ==========================================
ALTER TABLE public.tag_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read tag_groups" ON public.tag_groups;
CREATE POLICY "Allow public read tag_groups" ON public.tag_groups FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow Zoe manage tag_groups" ON public.tag_groups;
CREATE POLICY "Allow Zoe manage tag_groups" ON public.tag_groups FOR ALL TO authenticated 
USING (auth.uid() = 'YOUR_CREATOR_USER_ID')
WITH CHECK (auth.uid() = 'YOUR_CREATOR_USER_ID');

-- ==========================================
-- 2. TAGS TABLE
-- ==========================================
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read tags" ON public.tags;
CREATE POLICY "Allow public read tags" ON public.tags FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow Zoe manage tags" ON public.tags;
CREATE POLICY "Allow Zoe manage tags" ON public.tags FOR ALL TO authenticated 
USING (auth.uid() = 'YOUR_CREATOR_USER_ID')
WITH CHECK (auth.uid() = 'YOUR_CREATOR_USER_ID');

-- ==========================================
-- 3. TEMPLATES TABLE
-- ==========================================
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read templates" ON public.templates;
CREATE POLICY "Allow public read templates" ON public.templates FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow Zoe manage templates" ON public.templates;
CREATE POLICY "Allow Zoe manage templates" ON public.templates FOR ALL TO authenticated 
USING (auth.uid() = 'YOUR_CREATOR_USER_ID')
WITH CHECK (auth.uid() = 'YOUR_CREATOR_USER_ID');

-- ==========================================
-- 4. TEMPLATE_TAGS (Join Table)
-- ==========================================
ALTER TABLE public.template_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read template_tags" ON public.template_tags;
CREATE POLICY "Allow public read template_tags" ON public.template_tags FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow Zoe manage template_tags" ON public.template_tags;
CREATE POLICY "Allow Zoe manage template_tags" ON public.template_tags FOR ALL TO authenticated 
USING (auth.uid() = 'YOUR_CREATOR_USER_ID')
WITH CHECK (auth.uid() = 'YOUR_CREATOR_USER_ID');
