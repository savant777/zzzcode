# ZZZCODE EDITOR

A template editor for RoleplayTH and Hogthai. Users fill in structured fields,
check the live preview, and copy HTML/BBCode to paste into the destination forum.

Live site: [ZZZCODE EDITOR](https://zzzcode.vercel.app/?group=category&tag=all)

## Roles and workflow

- General users browse templates and use Editor without signing in. Protected
  templates require a password or an existing authorized access link.
- Creators sign in with Discord. New creators complete invite-code onboarding;
  an active creator profile is required to access creator tools.
- Creators manage their own templates and eligible tags. An active Owner can
  manage all templates. Creator credit does not change template ownership.
- Create saves a template with `is_active = false`. Complete configuration in
  Edit, save, and use the activation prompt when ready to publish.
- The built-in Creator Guide is available at `/creator/guide`.

## Features

- Dashboard search, tag filters, No Pass filter, and grid/list views.
- Generated fields: text, BBCode, color, select, slider, checkbox, and gradient.
- BBCode keyboard shortcuts and configurable editor height.
- HEX inputs add `#` and uppercase hex characters; HTML color names are retained.
- Select options support an explicit default and drag ordering.
- Local autosave, undo/redo, optional multiple drafts, and online backup links.
- Repeatable BLOCKs, nested BLOCKs, mixed GBLOCK ordering, Copy, Duplicate,
  Remove, and Collapse/Expand controls.
- Creator form ordering for field groups, standalone BLOCKs, and whole GBLOCKs.
- Supabase storage, creator profiles, Discord onboarding, and tag management.

### Live preview and tags

Templates tagged with slug `hogthai` use the Hogthai parser and preview;
other templates use RoleplayTH. Create/Edit have no separate preview selector.
Copy preserves the source output syntax rather than copying preview HTML.

Hogthai preview supports `dohtml`, Google Fonts, nested BBCode, and line breaks.
It recreates `.postcolor`, block-level `#dohtml_span`, and the `#121212` post
background. The post layout can expand for wide content before scaling into
Preview, keeping fixed-width columns visible on narrow screens.

Category, CSS, and Style tags sort by numeric tag ID ascending in navigation,
Create/Edit, and template cards. New tags append within their group. Other groups
sort by name. Group priority remains separate from the order of tags inside it.

### Blueprint syntax

Define editable variables and configure their defaults through field settings:

```html
<div>{{character_name}}</div>
{{age[GROUP:Basic Info]}}
```

Repeat a section with BLOCK:

```html
[BLOCK:relationships]
  <div>{{name}}</div>
  <div>{{description}}</div>
[/BLOCK:relationships]
```

Group different BLOCK types so Editor can interleave their entries:

```html
<section>
[GBLOCK:conversation]
  [BLOCK:chat]<p>{{message}}</p>[/BLOCK:chat]
  [BLOCK:noti]<aside>{{notice}}</aside>[/BLOCK:noti]
[/GBLOCK:conversation]
</section>
```

GBLOCKs are root-level groups of uniquely named sibling BLOCKs, with only
whitespace between members. Put wrapping HTML outside the GBLOCK. Nested BLOCKs
are supported inside a member; nested GBLOCKs are not. Invalid group syntax is
rejected during synchronization/save. A BLOCK needs its own editable fields to
appear in the forms. GBLOCK markers do not appear in copied output.

Use REPEAT to repeat content according to a numeric field:

```html
[REPEAT:stars]
  *
[/REPEAT]
```

### BLOCK settings and draft compatibility

- Initial count and minimum are non-negative integers. Maximum can be blank for
  unlimited entries; the initial count is normalized into the allowed range.
- Add/Duplicate/Remove enforce limits for root and nested blocks. Existing saved
  arrays are preserved even when a creator changes limits.
- Sorting can be disabled for a BLOCK; locked entries retain their positions.
  Child entries remain within their parent.
- Duplicate gets new entry identities, opens the new entry, and inserts it after
  its source. Copy includes child content and the current variable context.
- Collapse, order, and values persist in drafts/backups. Confirmed reorder has
  its own undo step; cancelling leaves the existing order intact.
- Creator form ordering changes the input layout, not blueprint/output order.
  Saved section order survives field synchronization; new sections append.
- `fields_config` stores these settings; no BLOCK-specific SQL migration is needed.
- Reserved editor state keys include `__zzzcode_entry_id`, `__zzzcode_groups`,
  and `__zzzcode_collapsed`. Existing draft data is reconciled without truncation.

## Online backups

SAVE creates an online backup on first use and saves changes thereafter. Keep
its backup link private: anyone with the link can read and edit that backup.
Open it once on another browser/device, then SAVE before switching devices.
Local autosave alone does not synchronize online changes.

When a newer online revision exists, CANCEL keeps editing, KEEP & LOAD saves one
local copy before loading online data, and OVERWRITE explicitly replaces the
online revision. Local copies stay on that device and are cleared only after a
successful overwrite. Clear Draft clears local editor data, not the online backup.

Backup tokens travel in URL fragments and authorization headers. The database
stores only token hashes. Server saves enforce optimistic revision checks;
conflicts return HTTP 409. Responses use `no-store` and failures retain local work.

Limits: 2 MiB per JSON draft set, 200 drafts per set, 500 characters per draft name.
Shared per-IP limits are 10 creates/minute and 50 creates/24 hours, 120 reads/minute,
and 120 saves/minute. Template-access requests have a separate 120/minute limit.
HTTP 429 includes `Retry-After`; limiter outages fail closed. Vercel IP identities
are HMAC-hashed, and local development shares a counter. These are abuse controls,
not a total storage cap. Deleting a template cascades to its backups.

## Password storage

`template_private.credentials` stores `password_hash` and nullable
`password_encrypted`, linked by `template_id`. `public.templates.password` is
removed. Hash verification uses bcrypt over the template-bound SHA-256 fingerprint,
maintaining remembered unlock compatibility and avoiding bcrypt's length limit.

Creator saves go through server APIs, encrypting displayable passwords with
AES-256-GCM before an atomic metadata/credential save. Only the template creator
and active Owner can retrieve the decrypted value in Edit. Browser roles cannot
read the private credentials table or invoke the encrypted-password read RPC.

Legacy hash-only passwords still unlock templates but cannot be recovered for
display. Re-enter a known password and save once to populate the encrypted column.
Leaving the password field blank retains existing credentials; entering a password
updates both values. Disabling protection deletes credentials. Creator drafts do
not store plaintext passwords in local storage.

Changing a password invalidates its old remembered unlock, but existing backup
links remain independent access credentials. Protected HTML/field defaults are
fetched through authorized server APIs; the public catalog returns metadata only.

## Local development and deployment

Stack: Next.js, React, TypeScript, Tailwind CSS, Supabase, dnd-kit,
react-colorful, Sonner, and Vercel.

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). Configure `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CREATOR_INVITE_CODE=your_bcrypt_hashed_invite_code
TEMPLATE_PASSWORD_ENCRYPTION_KEY=your_64_character_random_hex_key
```

`CREATOR_INVITE_CODE` is a bcrypt hash; escape each `$` as `\$` in `.env.local`.
Generate a password encryption key once with:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Service-role, invite, and encryption keys are server-only. Never prefix them with
`NEXT_PUBLIC_`, commit `.env.local`, or log credentials/backup tokens. Configure
the same encryption key for every deployment sharing the database, including
Production/Preview as needed. Back it up privately: changing or losing it prevents
reading existing encrypted passwords. Redeploy after changing environment values.

Scripts: `npm run dev`, `npm run build`, `npm run start`, and `npm run lint`.

## Supabase setup and migration order

SQL files remain in `supabase/`. **Do not run `schema.sql` on an existing database:**
it drops application tables. It is a legacy bootstrap, including the old password
column. For a fresh database, apply the baseline schema, functions, and policies,
then the applicable migrations. Review SQL before applying it.

For an older database, apply missing migrations in this order:

1. Creator baseline: `migration-creators.sql`, `functions.sql`, and `policies.sql`
   as applicable; review creator/tag permission migrations in `supabase/`.
2. `add-supports-multiple-drafts.sql` for multiple-draft configuration.
3. `add-editor-backups.sql`, then `verify-editor-backups.sql`.
4. `add-editor-backup-rate-limits.sql`, then `verify-editor-backup-rate-limits.sql`.
5. `secure-template-access.sql` to migrate legacy plaintext passwords into private
   hashes and install catalog/access controls. It rejects protected rows without
   either a password or an existing credential. Requires pgcrypto in `extensions`.
6. `password-free-template-writes.sql` to remove the legacy capture trigger and
   password column, installing atomic creator writes.
7. `display-template-passwords.sql` to add encrypted password storage and the
   current save/read RPCs. Configure the encryption env key with matching app code.
8. Run `verify-template-access.sql`; all boolean results should be true.

**For a database already at step 7, do not rerun steps 5 or 6.** Step 5 expects the
removed password column; step 6 reinstalls the older save function. The latest
`display-template-passwords.sql` can be rerun with the current definition.
No `preview_profile` database column is required: preview follows tags.

Coordinate database migrations and deployment of their matching app version.
Do not roll back only the app to a version that expects plaintext passwords.
Backup verification scripts roll back their temporary data. Do not manually delete
online drafts as a retention policy without deciding that policy first.

Main tables: `creators`, `templates`, `tag_groups`, `tags`, `template_tags`,
`editor_backups`, and `template_private.credentials`. Template ownership is based
on `user_id`; assigned creator credit is separate. Tags support deactivation via
`is_active = false`; creator tags are system-managed.

## Verification

Useful isolated checks (no remote database writes):

```bash
node tests/template-password-api.cjs
node tests/template-unlock-api.cjs
node tests/template-unlock.cjs
node tests/template-tags.cjs
node tests/hogthai-preview.cjs
node tests/preview-viewport.cjs
node tests/parser-newlines.cjs
node tests/block-defaults.cjs
node tests/block-editor.cjs
node tests/editor-history.cjs
node tests/form-layout.cjs
node tests/field-input-defaults.cjs
node tests/editor-backup-api.cjs
node tests/editor-backup-client.cjs
node tests/editor-local-copy.cjs
npx tsc --noEmit --pretty false
npm run build
```

`tests/template-access-sql.cjs` runs migrations, permissions, and credential tests
in isolated PostgreSQL/WASM. Install `@electric-sql/pglite` into a temporary folder
and set `PGLITE_TEST_ROOT` to that folder before running it; do not add it to app
dependencies solely for this test.

`tests/editor-backup-live.cjs` is different: it calls localhost:3000 against the
configured Supabase project and creates/cleans up a temporary backup. Run it only
when intentionally testing that database.

After deployment, check dashboard filters, protected-template unlock/refresh,
creator Save, saved-password display, inactive-template activation, Hogthai preview,
and backup create/load/conflict in a second browser. Physical phone drag gestures
and system clipboard behavior require manual testing.

## Project structure

- `app/`: dashboard, Creator pages, Create/Edit/Editor, and server API routes.
- `components/`: form fields, configuration dialogs, blocks, navigation, preview,
  and the built-in Creator Guide.
- `lib/`: parsing, field/block state, ordering, authentication, encryption,
  password APIs, draft persistence, and online backups.
- `supabase/`: SQL baselines, migrations, and verification scripts.
- `tests/`: isolated parser, state, API, component, and database checks.
