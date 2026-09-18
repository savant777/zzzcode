-- Run once in Supabase SQL Editor, after add-editor-backups.sql.
-- Adds shared counters only; does not modify saved backups or templates.
BEGIN;

CREATE TABLE IF NOT EXISTS public.editor_backup_rate_limits (
    client_hash text NOT NULL CHECK (client_hash ~ '^[0-9a-f]{64}$'),
    bucket text NOT NULL CHECK (bucket IN ('create:minute', 'create:day', 'read:minute', 'save:minute')),
    requests integer NOT NULL CHECK (requests > 0),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (client_hash, bucket)
);
CREATE INDEX IF NOT EXISTS editor_backup_rate_limits_expiry_idx
    ON public.editor_backup_rate_limits(expires_at);
ALTER TABLE public.editor_backup_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editor_backup_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.editor_backup_rate_limits FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.editor_backup_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_editor_backup_rate_limit(p_client_hash text, p_operation text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_rule record;
    v_expiry timestamptz;
BEGIN
    IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$'
       OR p_operation IS NULL OR p_operation NOT IN ('create', 'read', 'save') THEN
        RAISE EXCEPTION 'Invalid rate limit input' USING ERRCODE = '22023';
    END IF;

    -- Bounded opportunistic cleanup; never touches actual draft data.
    DELETE FROM public.editor_backup_rate_limits
    WHERE (client_hash, bucket) IN (
        SELECT r.client_hash, r.bucket FROM public.editor_backup_rate_limits r
        WHERE r.expires_at < v_now - interval '1 day'
        ORDER BY r.expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    );

    FOR v_rule IN
        SELECT * FROM (VALUES
            ('create', 'create:minute', 10, 60),
            ('create', 'create:day', 50, 86400),
            ('read', 'read:minute', 120, 60),
            ('save', 'save:minute', 120, 60)
        ) AS rules(operation, bucket, max_requests, seconds)
        WHERE operation = p_operation ORDER BY seconds
    LOOP
        v_expiry := NULL;
        -- The unique row lock makes this atomic even across Vercel instances.
        INSERT INTO public.editor_backup_rate_limits AS existing (client_hash, bucket, requests, expires_at)
        VALUES (p_client_hash, v_rule.bucket, 1, v_now + make_interval(secs => v_rule.seconds))
        ON CONFLICT (client_hash, bucket) DO UPDATE
        SET requests = CASE WHEN existing.expires_at <= v_now THEN 1 ELSE existing.requests + 1 END,
            expires_at = CASE WHEN existing.expires_at <= v_now
                THEN v_now + make_interval(secs => v_rule.seconds) ELSE existing.expires_at END
        WHERE existing.expires_at <= v_now OR existing.requests < v_rule.max_requests
        RETURNING expires_at INTO v_expiry;

        IF v_expiry IS NULL THEN
            SELECT r.expires_at INTO v_expiry FROM public.editor_backup_rate_limits r
            WHERE r.client_hash = p_client_hash AND r.bucket = v_rule.bucket;
            RETURN jsonb_build_object('allowed', false, 'retryAfter',
                greatest(1, ceil(extract(epoch FROM (v_expiry - v_now)))::integer));
        END IF;
    END LOOP;
    RETURN jsonb_build_object('allowed', true, 'retryAfter', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_editor_backup_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_editor_backup_rate_limit(text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
