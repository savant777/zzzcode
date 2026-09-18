-- Run after add-editor-backup-rate-limits.sql. All test counters are rolled back.
BEGIN;
DO $$
DECLARE
    v_hash text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
    v_other text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
    v_result jsonb;
    v_i integer;
    v_role text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(v_role, 'public.editor_backup_rate_limits', 'SELECT,INSERT,UPDATE,DELETE')
           OR has_function_privilege(v_role, 'public.consume_editor_backup_rate_limit(text,text)', 'EXECUTE') THEN
            RAISE EXCEPTION 'Unexpected browser access for %', v_role;
        END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', 'public.consume_editor_backup_rate_limit(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Missing service role permission';
    END IF;
    FOR v_i IN 1..10 LOOP
        v_result := public.consume_editor_backup_rate_limit(v_hash, 'create');
        IF (v_result->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Create blocked too early'; END IF;
    END LOOP;
    v_result := public.consume_editor_backup_rate_limit(v_hash, 'create');
    IF (v_result->>'allowed')::boolean IS DISTINCT FROM false OR (v_result->>'retryAfter')::integer < 1 THEN
        RAISE EXCEPTION 'Minute limit did not block';
    END IF;
    v_result := public.consume_editor_backup_rate_limit(v_other, 'create');
    IF (v_result->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Clients not isolated'; END IF;

    UPDATE public.editor_backup_rate_limits SET expires_at = clock_timestamp() - interval '1 second'
    WHERE client_hash = v_hash AND bucket = 'create:minute';
    v_result := public.consume_editor_backup_rate_limit(v_hash, 'create');
    IF (v_result->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Window did not reset'; END IF;

    UPDATE public.editor_backup_rate_limits SET requests = 50
    WHERE client_hash = v_hash AND bucket = 'create:day';
    v_result := public.consume_editor_backup_rate_limit(v_hash, 'create');
    IF (v_result->>'allowed')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Daily limit did not block'; END IF;
    -- A create limit must not stop users from saving/reading existing backups.
    FOR v_i IN 1..120 LOOP
        v_result := public.consume_editor_backup_rate_limit(v_hash, 'save');
        IF (v_result->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Save blocked too early'; END IF;
    END LOOP;
    v_result := public.consume_editor_backup_rate_limit(v_hash, 'save');
    IF (v_result->>'allowed')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Save limit did not block'; END IF;
    v_result := public.consume_editor_backup_rate_limit(v_hash, 'read');
    IF (v_result->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Operation buckets not isolated'; END IF;
    RAISE NOTICE 'PASS: permissions, minute/day limits, expiry reset, client and operation isolation';
END;
$$;
ROLLBACK;
SELECT 'Rate limit verification passed; test counters rolled back.' AS result;
