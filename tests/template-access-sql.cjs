// Isolated PostgreSQL/WASM integration test, never connects to Supabase.
// npm install --prefix <temp-dir> --no-save @electric-sql/pglite
// PGLITE_TEST_ROOT=<temp-dir> node tests/template-access-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const testRequire = createRequire(path.join(process.env.PGLITE_TEST_ROOT || process.cwd(), 'package.json'));
const { PGlite } = testRequire('@electric-sql/pglite');
const { pgcrypto } = testRequire('@electric-sql/pglite/contrib/pgcrypto');
const pg = new PGlite({ extensions: { pgcrypto } });
const sql = file => fs.readFileSync(`supabase/${file}`, 'utf8');
const creator = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const secret = 'ไทย"\\\n🔑' + 'long'.repeat(25);
const fingerprint = (id, password) => createHash('sha256').update(JSON.stringify([String(id), password])).digest('hex');
async function as(role, user, action) {
    await pg.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user || '']);
    await pg.exec(`SET ROLE ${role}`);
    try { return await action(); } finally { await pg.exec('RESET ROLE'); }
}
async function verify(id, password) {
    return as('service_role', null, async () => (await pg.query(
        'SELECT public.verify_template_credential($1,$2) AS ok', [id, fingerprint(id, password)])).rows[0].ok);
}
async function run() {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
        GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;`);
    await pg.exec(sql('schema.sql'));
    await pg.exec(sql('policies.sql'));
    await pg.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`);
    for (const id of [creator, owner, other]) {
        await pg.query('INSERT INTO auth.users VALUES ($1)', [id]);
        await pg.query('INSERT INTO public.creators(user_id,display_name,role) VALUES ($1,$2,$3)', [id, id, id === owner ? 'owner' : 'creator']);
    }
    await pg.query("INSERT INTO public.templates(title,user_id) VALUES ('public',$1)", [creator]);
    await pg.query("INSERT INTO public.templates(title,user_id,is_personal,password,html_blueprint,fields_config) VALUES ('protected',$1,true,$2,'SECRET_HTML','[{\"default_value\":\"SECRET_DEFAULT\"}]')", [creator, secret]);
    await pg.query("INSERT INTO public.templates(title,user_id,is_active) VALUES ('inactive',$1,false)", [creator]);
    await pg.exec("INSERT INTO public.tag_groups(name) VALUES ('houses'); INSERT INTO public.tags(group_id,name,slug) VALUES (1,'Example','example'); INSERT INTO public.template_tags(template_id,tags_id) VALUES (2,1)");
    await pg.exec(sql('secure-template-access.sql'));
    await pg.exec(sql('secure-template-access.sql')); // Rerunnable without losing hashes.
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM public.templates WHERE password IS NOT NULL')).rows[0].n, 0);
    assert.equal(await verify(2, secret), true, 'Legacy browser fingerprint matches migrated Unicode/long password');
    assert.equal(await verify(2, 'wrong'), false);
    await as('anon', null, async () => {
        assert.deepEqual((await pg.query('SELECT id FROM public.templates ORDER BY id')).rows.map(r => Number(r.id)), [1]);
        const catalog = (await pg.query('SELECT public.template_catalog() AS data')).rows[0].data;
        assert.deepEqual(catalog.map(r => r.id), [2, 1]);
        assert.equal(catalog[0].template_tags[0].tags.slug, 'example');
        const serialized = JSON.stringify(catalog);
        for (const privateValue of ['password', 'html_blueprint', 'fields_config', 'SECRET_HTML', 'SECRET_DEFAULT']) assert.ok(!serialized.includes(privateValue));
        await assert.rejects(pg.query('SELECT * FROM template_private.credentials'), /permission denied/);
        await assert.rejects(pg.query("SELECT public.verify_template_credential(2,repeat('a',64))"), /permission denied/);
    });
    await as('authenticated', other, async () => {
        assert.equal((await pg.query('SELECT * FROM public.templates WHERE id=2')).rows.length, 0);
        assert.equal((await pg.query("UPDATE public.templates SET password='hacked' WHERE id=2 RETURNING id")).rows.length, 0);
    });
    await as('authenticated', creator, async () => {
        assert.equal((await pg.query('SELECT * FROM public.templates WHERE id=2')).rows[0].password, null);
        assert.equal((await pg.query('SELECT public.template_catalog() AS data')).rows[0].data.length, 3);
        await pg.query("UPDATE public.templates SET title='edited',password=NULL WHERE id=2");
    });
    assert.equal(await verify(2, secret), true, 'Blank update retains existing credential');
    await as('authenticated', owner, async () => {
        assert.equal((await pg.query('SELECT * FROM public.templates WHERE id=3')).rows.length, 1);
        await pg.query("UPDATE public.templates SET password='rotated' WHERE id=2");
    });
    assert.equal(await verify(2, secret), false);
    assert.equal(await verify(2, 'rotated'), true);
    await as('authenticated', creator, async () => {
        const added = await pg.query("INSERT INTO public.templates(title,user_id,is_personal,password) VALUES ('new',auth.uid(),true,'new-secret') RETURNING id,password");
        assert.equal(added.rows[0].password, null);
        await assert.rejects(pg.query("INSERT INTO public.templates(title,user_id,is_personal) VALUES ('invalid',auth.uid(),true)"), /PASSWORD_REQUIRED/);
        await pg.query('UPDATE public.templates SET is_personal=false WHERE id=2');
        await assert.rejects(pg.query('UPDATE public.templates SET is_personal=true WHERE id=2'), /PASSWORD_REQUIRED/);
    });
    assert.equal(await verify(2, 'rotated'), false, 'Unprotecting removes credential');
    // Rerunning old policy setup cannot reopen protected rows.
    await pg.exec(sql('policies.sql'));
    await as('anon', null, async () => {
        assert.equal((await pg.query('SELECT * FROM public.templates WHERE is_personal=true')).rows.length, 0);
    });
    const checks = await pg.exec(sql('verify-template-access.sql'));
    for (const result of checks) for (const row of result.rows) {
        for (const [name, passed] of Object.entries(row)) assert.equal(passed, true, name);
    }
    console.log('PASS: PostgreSQL migration/re-run, Unicode hash compatibility, private-table permissions, catalog allowlist, RLS, creator/owner edits, credential rotation and password-free writes.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pg.close());
