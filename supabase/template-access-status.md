# Secure template access — deployment

## Run order

1. Prepare/deploy this app revision together with `secure-template-access.sql`.
   Run that SQL in Supabase SQL Editor as postgres immediately before switching
   production to the new app. Expect a brief maintenance window: old browser tabs
   cannot read protected templates after migration and must refresh to the new app.
2. Run `verify-template-access.sql`. Every boolean result should be true.
3. Test dashboard, No Pass, unlock, refresh, direct Editor links, creator edits,
   inactive cards, backup creation and an existing backup link in production.

Existing prerequisites: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
creator policies, editor backup setup, and `add-editor-backup-rate-limits.sql`.
No service role key belongs in a `NEXT_PUBLIC_` variable. Do NOT rerun schema.sql
(it drops tables). No need to rerun policies.sql for this release.

## What the migration changes

- Moves existing template passwords into bcrypt hashes in `template_private` and
  clears plaintext from `templates.password`. A before-write trigger hashes future
  password updates and always clears the input before any row can be returned.
- Hashes the existing 64-character template/password fingerprint, keeping remembered
  browser unlocks compatible and avoiding bcrypt's 72-byte password limit.
- Blocks anonymous/unrelated-account SELECT of protected and inactive template rows
  with a restrictive policy; creator/owner permissions remain available.
- Adds `template_catalog()` with an explicit list-metadata allowlist and per-user
  inactive visibility. No password, hash, HTML or field defaults are returned.
- Allows only service_role to call credential verification. Browser callers cannot
  bypass the app's shared rate limit via RPC.

The SQL is transactional and rerunnable. It deliberately aborts if an old protected
row has no password and no existing hash; set that row's password first. pgcrypto
must be in the Supabase-standard `extensions` schema. The update timestamp trigger
name follows this repository's schema. A failure rolls back the migration; do not
remove safety checks to force a partially applied migration.

## Application behavior

Editor content is fetched only after server authorization: public active template,
verified remembered credential, creator/owner session, or a valid backup secret
bound to the requested template. No plaintext password is returned by the API.
Shared limits are 120 template-access requests/minute/IP, separate from backup quotas.
Missing configuration or database functions fail closed.

Edit Template: leave password blank to keep it; enter a new one to replace it.
Turning protection off deletes its hash. Turning it on again requires a password.
Create/Edit drafts no longer save plaintext passwords to local storage; unsaved
password input must be re-entered after refreshing. Existing local password fields
are ignored and overwritten by the next draft save.

Existing backup links remain independent access credentials, including after a
password change, matching existing behavior. Keep their tokens private. Changing
passwords invalidates the old remembered password credential, not backup links.
Authorized viewers still receive HTML to render/edit/copy, so this is access control,
not copy prevention. Previously downloaded data cannot be recalled. Rotate any
previously exposed passwords after rollout when needed.

## Validation

- `node tests/template-unlock-api.cjs`
- `node tests/template-unlock.cjs`
- `node tests/editor-backup-api.cjs`
- `node tests/editor-backup-client.cjs`
- `npx tsc --noEmit --pretty false`
- `tests/template-access-sql.cjs`: isolated PostgreSQL/PGlite integration test;
  install @electric-sql/pglite in a temporary folder and set PGLITE_TEST_ROOT to it.

Do not roll back only the app after migration: the old Editor expects plaintext
passwords. Keep the matching app revision or fix forward; hashes cannot be converted
back to their original passwords.

References: [PostgreSQL pgcrypto](https://www.postgresql.org/docs/17/pgcrypto.html),
[restrictive RLS policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
