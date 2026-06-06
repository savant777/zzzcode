-- Non-destructive migration for an existing Supabase project.
-- Use this instead of schema.sql when the database already has production data.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS public.creators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_id text UNIQUE,
  discord_username text,
  display_name text NOT NULL,
  slug text UNIQUE,
  role text NOT NULL DEFAULT 'creator',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT creators_role_check CHECK (role IN ('owner', 'creator'))
);

ALTER TABLE public.creators
ADD COLUMN IF NOT EXISTS discord_id text,
ADD COLUMN IF NOT EXISTS discord_username text;

ALTER TABLE public.tags
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

INSERT INTO public.tag_groups (name)
SELECT 'creators'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tag_groups
  WHERE lower(name) = 'creators'
);

DROP TRIGGER IF EXISTS update_creators_updated_at ON public.creators;
CREATE TRIGGER update_creators_updated_at
  BEFORE UPDATE ON public.creators
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.templates(user_id);
CREATE INDEX IF NOT EXISTS idx_creators_slug ON public.creators(slug);
CREATE INDEX IF NOT EXISTS idx_creators_active ON public.creators(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creators_discord_id_unique ON public.creators(discord_id)
WHERE discord_id IS NOT NULL;

-- Add yourself as the first owner after replacing the values below.
-- INSERT INTO public.creators (user_id, discord_id, discord_username, display_name, slug, role)
-- VALUES ('YOUR_AUTH_USER_ID', 'YOUR_DISCORD_ID', 'your_discord_username', 'Your Name', 'your-slug', 'owner')
-- ON CONFLICT (user_id) DO UPDATE
-- SET discord_id = EXCLUDED.discord_id,
--     discord_username = EXCLUDED.discord_username,
--     display_name = EXCLUDED.display_name,
--     slug = EXCLUDED.slug,
--     role = EXCLUDED.role,
--     is_active = true;
