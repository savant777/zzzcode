-- Run in Supabase SQL Editor to allow creators to manage their own house/shop
-- tags like activity/commission tags. Existing owner policies remain unchanged.
BEGIN;

ALTER POLICY "Allow creators insert own tags" ON public.tags
WITH CHECK (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
);

ALTER POLICY "Allow creators update own tags" ON public.tags
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
);

ALTER POLICY "Allow creators delete own tags" ON public.tags
USING (
  user_id = auth.uid()
  AND public.is_active_creator(auth.uid())
);

COMMIT;
