-- Read-only verification after secure-template-access.sql. Run as postgres.
BEGIN;
SELECT
  NOT EXISTS (SELECT 1 FROM public.templates WHERE password IS NOT NULL) AS plaintext_passwords_removed,
  NOT EXISTS (SELECT 1 FROM public.templates t WHERE t.is_personal = true
    AND NOT EXISTS (SELECT 1 FROM template_private.credentials c WHERE c.template_id = t.id)) AS protected_rows_have_credentials,
  NOT has_schema_privilege('anon', 'template_private', 'USAGE') AS anon_cannot_access_credentials,
  NOT has_schema_privilege('authenticated', 'template_private', 'USAGE') AS users_cannot_access_credentials,
  NOT has_function_privilege('anon', 'public.verify_template_credential(bigint,text)', 'EXECUTE') AS anon_cannot_bypass_rate_limit,
  NOT has_function_privilege('authenticated', 'public.verify_template_credential(bigint,text)', 'EXECUTE') AS users_cannot_bypass_rate_limit,
  has_function_privilege('service_role', 'public.verify_template_credential(bigint,text)', 'EXECUTE') AS server_can_verify;

SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claims" = '{}';
SET LOCAL ROLE anon;
SELECT
  NOT EXISTS (SELECT 1 FROM public.templates WHERE is_personal = true OR is_active IS NOT TRUE) AS direct_protected_reads_blocked,
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.template_catalog()) AS item
    WHERE item ?| ARRAY['password', 'password_hash', 'html_blueprint', 'fields_config']) AS catalog_has_no_secrets;
ROLLBACK;
