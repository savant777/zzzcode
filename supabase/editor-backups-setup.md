# Editor backup setup

## Run in Supabase

1. Open SQL Editor → New query.
2. Paste the entire `add-editor-backups.sql` file and run it.
3. Run `verify-editor-backups.sql` to check permissions and save/conflict behavior.
   The verification runs inside a transaction and rolls back all test data.
4. Run `add-editor-backup-rate-limits.sql`, then `verify-editor-backup-rate-limits.sql`.
   The API requires this shared counter RPC; without it requests return 503 safely.

Do not run `schema.sql`: that existing file drops application tables.
The new migration only adds backup objects and may be rerun with this same definition.
It does not alter existing template permissions or upload any local drafts.

Limits for this initial implementation: 2 MiB per JSON draft set, 200 drafts per set,
500 characters per draft name. The API must validate and explain these limits before
sending data. Deleting a template also deletes its backups (foreign-key cascade).

## Server API contract

Implemented routes (connected to the editor SAVE and backup-link flows):

- `POST /api/editor/backups`: JSON `{ templateId: "117", payload, templatePassword? }`.
  Send `Idempotency-Key` containing a secret random 32-byte base64url value (43
  characters), generated with browser crypto and retained for retries. It is not
  the backup ID and must not be shared/logged. Returns 201 (or 200 on retry) with
  `{ id, templateId, payload, revision, createdAt, updatedAt, token }`.
- `GET /api/editor/backups/{id}?templateId=117`: `Authorization: Bearer <token>`.
- `PUT /api/editor/backups/{id}`: same authorization, JSON
  `{ templateId: "117", payload, expectedRevision: 1 }`.
  Conflict returns HTTP 409 with latest revision/time, never silently overwrites.
- Requests and responses are limited/validated, and all responses are `no-store`.
  Template IDs are decimal strings to avoid JavaScript bigint precision loss.

Shared rate limits now run atomically in Supabase across server instances:

- Create requests: 10/minute AND 50/24 hours per IP (includes retries/invalid attempts).
- Read requests: 120/minute per IP.
- Save requests: 120/minute per IP, independent of creation/reading limits.
- Windows start on first use; they are not aligned to midnight or the clock minute.
- A cheap process-local counter additionally rejects bursts before contacting the DB.
- Vercel uses only its platform `x-vercel-forwarded-for` header, with canonical IP
  formatting. Other forwarded headers are ignored. Missing/invalid platform IP fails
  closed. Local development shares one counter, regardless of caller-supplied headers.
- Stored identities are HMAC hashes of IPs; no raw IP address is saved. Secret key
  rotation resets identity buckets. Expired counters are cleaned in bounded batches
  after one extra day, on subsequent requests; this never deletes backups.
- HTTP 429 includes `Retry-After`, displayed in the editor. Limiter outages return
  503 without saving or deleting work. No unlimited fallback is used.
- Users behind one public IP share limits (e.g. office Wi-Fi). VPN/IP rotation can
  evade per-IP quotas; this is abuse mitigation, not a DDoS firewall or a total
  storage cap. Vercel's platform firewall remains useful for network-level floods.

No new environment variable or external subscription is required. Deploy API code
only after the rate-limit migration has been applied. Do not delete old drafts to
manage quota without a separately agreed retention policy.

Sources: [Vercel request headers](https://vercel.com/docs/headers/request-headers),
[Supabase function privileges](https://supabase.com/docs/guides/database/functions).

- Use the existing `SUPABASE_SERVICE_ROLE_KEY` only in a server module.
- Create: validate template availability/access (including personal template access),
  validate payload, enforce request size and rate limits. Derive a secret 32-byte
  token and a separate UUID using domain-separated HMAC-SHA256 over template ID
  and the secret retry key. Store only the token's lowercase SHA-256 hex digest in `access_token_hash`.
  Insert `template_id` and `payload`; default revision is 1. Return ID, revision, time,
  and the raw token for the link. Retrying with the same secret retry key returns
  the existing backup without overwriting it. Changing the server service-role key
  changes derivation for pending create retries; already-issued link tokens still
  authenticate against their stored digests.
- Read: derive the digest from the supplied token on the server, filter on backup ID,
  template ID AND digest. Select only ID/template/payload/revision/timestamps, never
  return the hash. Use the same not-found response for wrong tokens and missing IDs.
- Save: call `save_editor_backup` with the server-derived digest and the last loaded
  revision. `saved` means success; `conflict` means ask the user; `not_found` means an
  invalid/unavailable link. Never update the table directly for an editor save.
- Explicit OVERWRITE: send the latest revision shown in the conflict dialog. If
  another save happened meanwhile, show the conflict again. Clear the local copy
  only after a confirmed `saved` response; retain it on failures or uncertain responses.
- KEEP & LOAD: replace the single local copy of this backup, then load online data.
  On first association, deliberately migrate any pre-link local copy to the backup ID.
- Keep the token out of query parameters/server logs (use a URL fragment and send it
  in a request header). Disable caching for backup responses; never expose the service
  role key. The token is a bearer credential, so anyone possessing it can edit.

RLS is enabled with no public policies and explicit browser-role grants revoked.
The two functions also revoke default PUBLIC execution. They use SECURITY INVOKER;
only the service role is granted access. API token checks remain mandatory because
that role bypasses RLS. No Supabase Auth account is needed for the user.

## Local editor checks

- SAVE creates a real backup and remembers its link, revision, and saved content.
- Further saves use the revision check; KEEP & LOAD stores one local copy and
  fetches the latest online set. OVERWRITE removes that copy only on success.
- Opening a fragment link in another browser loads the online set. Existing local
  work that differs is confirmed before replacement. Re-entering the editor without
  a link uses its remembered connection and preserves unsaved local edits.
- Use a second browser or private window for independent storage when testing.
  A localhost link works only on the same computer; for phone testing use the
  computer's reachable LAN address. Clipboard support may require HTTPS on phones.
- Run `node tests/editor-backup-client.cjs`, `node tests/editor-backup-api.cjs`, and
  `node tests/editor-local-copy.cjs` for isolated tests.
- `node tests/editor-backup-live.cjs` explicitly tests localhost:3000 against the
  configured Supabase project, creating and cleaning up one temporary backup.

Never commit `.env.local` or share backup tokens/test credentials in logs.
