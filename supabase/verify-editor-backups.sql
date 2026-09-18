-- Optional verification: run AFTER add-editor-backups.sql in SQL Editor.
-- All inserted rows are rolled back. No existing template/backup is edited.
BEGIN;
DO $$
DECLARE
    v_template bigint;
    v_backup uuid;
    v_result jsonb;
    v_payload jsonb := '{"activeDraftId":"a","drafts":[{"id":"a","name":"Draft 1","fieldValues":{"text":"hello"},"updatedAt":"2026-09-18T00:00:00Z"}]}';
    v_role text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'editor_backups' AND c.relrowsecurity AND c.relforcerowsecurity) THEN
        RAISE EXCEPTION 'RLS is not enabled/forced';
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(v_role, 'public.editor_backups', 'SELECT,INSERT,UPDATE,DELETE')
           OR has_function_privilege(v_role, 'public.save_editor_backup(uuid,bigint,text,bigint,jsonb)', 'EXECUTE')
           OR has_function_privilege(v_role, 'public.editor_backup_payload_valid(jsonb)', 'EXECUTE') THEN
            RAISE EXCEPTION 'Unexpected browser access for %', v_role;
        END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', 'public.save_editor_backup(uuid,bigint,text,bigint,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Missing service role RPC grant';
    END IF;
    IF public.editor_backup_payload_valid('{}'::jsonb)
       OR public.editor_backup_payload_valid('null'::jsonb)
       OR public.editor_backup_payload_valid(jsonb_set(v_payload, '{activeDraftId}', '"missing"')) THEN
        RAISE EXCEPTION 'Invalid payload accepted';
    END IF;

    INSERT INTO public.templates(title) VALUES ('Temporary backup SQL verification') RETURNING id INTO v_template;
    INSERT INTO public.editor_backups(template_id, access_token_hash, payload)
    VALUES (v_template, repeat('a', 64), v_payload) RETURNING id INTO v_backup;

    v_result := public.save_editor_backup(v_backup, v_template, repeat('b', 64), 1, v_payload);
    IF v_result->>'status' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'Wrong token accepted'; END IF;

    v_result := public.save_editor_backup(v_backup, v_template, repeat('a', 64), 1, v_payload);
    IF v_result->>'status' IS DISTINCT FROM 'saved' OR (v_result->>'revision')::bigint <> 2 THEN
        RAISE EXCEPTION 'Expected successful save to revision 2';
    END IF;
    v_result := public.save_editor_backup(v_backup, v_template, repeat('a', 64), 1,
        jsonb_set(v_payload, '{drafts,0,fieldValues,text}', '"stale edit"'));
    IF v_result->>'status' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'Stale save was not rejected'; END IF;
    IF (SELECT payload FROM public.editor_backups WHERE id = v_backup) IS DISTINCT FROM v_payload THEN
        RAISE EXCEPTION 'Conflict changed payload';
    END IF;

    BEGIN
        PERFORM public.save_editor_backup(v_backup, v_template, repeat('a', 64), 2, '{}'::jsonb);
        RAISE EXCEPTION 'Invalid payload was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    IF (SELECT revision FROM public.editor_backups WHERE id = v_backup) <> 2 THEN
        RAISE EXCEPTION 'Failed save changed revision';
    END IF;
    RAISE NOTICE 'PASS: RLS, browser permissions, payload checks, wrong token, save and stale revision';
END;
$$;
ROLLBACK;
SELECT 'Verification passed; all test rows rolled back.' AS result;
