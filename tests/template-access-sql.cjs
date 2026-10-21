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
    await pg.exec(sql('password-free-template-writes.sql'));
    await pg.exec(sql('password-free-template-writes.sql'));
    const save = (id, data, password = null) => pg.query('SELECT public.save_template($1,$2,$3) AS saved', [id, data, password]);
    await as('anon', null, async () => assert.rejects(save(null, {title:'denied'}), /permission denied/));
    await as('authenticated', other, async () => assert.rejects(save(2, {title:'denied'}), /TEMPLATE_OWNER_REQUIRED/));
    await as('authenticated', creator, async () => {
        const result = await save(null, {title:'rpc protected', is_personal:true, is_active:true, user_id:owner}, secret);
        const added = result.rows[0].saved;
        assert.equal(added.is_active, false);
        const row = (await pg.query('SELECT * FROM public.templates WHERE id=$1', [added.id])).rows[0];
        assert.equal(row.user_id, creator);
        assert.ok(!('password' in row));
        await save(added.id, {title:'keep', is_personal:true});
        await save(added.id, {title:'rotate', is_personal:true}, 'rpc-rotated');
        global.rpcTemplateId = added.id;
        await assert.rejects(save(null, {title:'missing', is_personal:true}), /PASSWORD_REQUIRED/);
    });
    assert.equal(await verify(global.rpcTemplateId, 'rpc-rotated'), true);
    assert.equal(await verify(global.rpcTemplateId, secret), false);
    await as('authenticated', owner, async () => {
        await save(global.rpcTemplateId, {title:'owner edited', is_personal:false});
        await assert.rejects(save(global.rpcTemplateId, {title:'reprotect', is_personal:true}), /PASSWORD_REQUIRED/);
    });
    assert.equal(await verify(global.rpcTemplateId, 'rpc-rotated'), false);
    await pg.exec(sql('display-template-passwords.sql'));
    await pg.exec(sql('display-template-passwords.sql'));
    const saveEncrypted = (id, password, encrypted) => pg.query('SELECT public.save_template($1,$2,$3,$4) AS saved', [id, {title:'encrypted',is_personal:true}, password, encrypted]);
    await as('authenticated', creator, async () => {
        await saveEncrypted(global.rpcTemplateId, secret, 'v1.test-ciphertext');
        await saveEncrypted(global.rpcTemplateId, null, null);
        await assert.rejects(pg.query('SELECT public.read_template_password_encrypted($1)', [global.rpcTemplateId]), /permission denied/);
    });
    assert.equal(await verify(global.rpcTemplateId, secret), true);
    await as('service_role', null, async () => assert.equal((await pg.query('SELECT public.read_template_password_encrypted($1) AS value', [global.rpcTemplateId])).rows[0].value, 'v1.test-ciphertext'));
    await as('authenticated', creator, async () => { await saveEncrypted(global.rpcTemplateId, 'updated', 'v1.updated'); });
    assert.equal(await verify(global.rpcTemplateId, 'updated'), true);
    const checks = await pg.exec(sql('verify-template-access.sql'));
    for (const result of checks) for (const row of result.rows) {
        for (const [name, passed] of Object.entries(row)) assert.equal(passed, true, name);
    }

    await pg.exec(sql('shared-creator-credit.sql'));
    await pg.exec(sql('shared-creator-credit.sql'));
    const stranger = '00000000-0000-4000-8000-000000000004';
    await pg.query('INSERT INTO auth.users VALUES ($1)', [stranger]);
    await pg.query("INSERT INTO public.creators(user_id,display_name) VALUES ($1,'stranger')", [stranger]);
    const group = (await pg.query("INSERT INTO public.tag_groups(name) VALUES ('creators') RETURNING id")).rows[0].id;
    const tag = (await pg.query("INSERT INTO public.tags(group_id,user_id,name,slug) VALUES ($1,$2,'Credit friend','credit-friend') RETURNING id", [group,other])).rows[0].id;
    const ownTag = (await pg.query("INSERT INTO public.tags(group_id,user_id,name,slug) VALUES ($1,$2,'Uploader','uploader') RETURNING id",[group,creator])).rows[0].id;
    const strangerTag = (await pg.query("INSERT INTO public.tags(group_id,user_id,name,slug) VALUES ($1,$2,'Stranger','stranger') RETURNING id",[group,stranger])).rows[0].id;
    const options = async (id=null) => (await pg.query('SELECT public.creator_credit_options($1) AS ids',[id])).rows[0].ids.map(Number);
    const setCredit = id => pg.query('SELECT public.set_template_creator_credit($1,$2)',[global.rpcTemplateId,id]);
    await as('authenticated', creator, async () => {
        assert.deepEqual(await options(),[Number(ownTag)]);
        await assert.rejects(pg.query('INSERT INTO public.template_tags(template_id,tags_id) VALUES ($1,$2)',[global.rpcTemplateId,tag]),/CREATOR_CREDIT_NOT_ALLOWED/);
        await assert.rejects(pg.query('INSERT INTO public.creator_credit_links(uploader_id,credited_creator_id) VALUES ($1,$2)',[creator,other]),/row-level security/);
    });
    await pg.query('INSERT INTO public.creator_credit_links(uploader_id,credited_creator_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[creator,other]);
    await pg.query('INSERT INTO public.creator_credit_links(uploader_id,credited_creator_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[creator,other]);
    await pg.query('INSERT INTO public.creator_credit_links(uploader_id,credited_creator_id) VALUES ($1,$2)',[other,stranger]);
    await as('authenticated', other, async () => {
        assert.ok(!(await options()).includes(Number(ownTag)), 'Direction is not reciprocal');
        assert.ok((await options()).includes(Number(strangerTag)));
    });
    await as('authenticated', creator, async () => {
        assert.ok((await options()).includes(Number(tag)));
        assert.ok(!(await options()).includes(Number(strangerTag)));
        await pg.query('INSERT INTO public.template_tags(template_id,tags_id) VALUES ($1,$2)',[global.rpcTemplateId,ownTag]);
        await assert.rejects(pg.query('INSERT INTO public.template_tags(template_id,tags_id) VALUES ($1,$2)',[global.rpcTemplateId,tag]),/ONE_CREATOR_CREDIT_REQUIRED/);
        await setCredit(tag);
        await assert.rejects(setCredit(strangerTag),/CREATOR_CREDIT_NOT_ALLOWED/);
    });
    await as('authenticated', other, async () => {
        assert.equal((await pg.query('SELECT public.can_edit_template($1) AS ok',[global.rpcTemplateId])).rows[0].ok,true);
        assert.equal((await pg.query('SELECT user_id FROM public.templates WHERE id=$1',[global.rpcTemplateId])).rows[0].user_id,creator);
        const catalog=(await pg.query('SELECT public.template_catalog() AS data')).rows[0].data;
        const item=catalog.find(t=>t.id===global.rpcTemplateId);
        assert.ok(item.editor_ids.includes(other));
        assert.deepEqual(item.template_tags.filter(t=>t.tags.tag_groups.name==='creators').map(t=>t.tags.slug), ['credit-friend']);
        assert.ok(!(await options(global.rpcTemplateId)).includes(Number(strangerTag)), 'Editor uses original uploader permissions');
        await assert.rejects(setCredit(strangerTag),/CREATOR_CREDIT_NOT_ALLOWED/);
        await saveEncrypted(global.rpcTemplateId, null, null);
        await pg.query('UPDATE public.templates SET is_active=false WHERE id=$1',[global.rpcTemplateId]);
        assert.equal((await pg.query('SELECT id FROM public.templates WHERE id=$1',[global.rpcTemplateId])).rows.length,1);
        assert.ok((await pg.query('SELECT public.template_catalog() AS data')).rows[0].data.some(t=>t.id===global.rpcTemplateId));
        await assert.rejects(pg.query('UPDATE public.templates SET user_id=$1 WHERE id=$2',[other,global.rpcTemplateId]), /TEMPLATE_UPLOADER_IMMUTABLE/);
    });
    await as('authenticated', stranger, async () => {
        assert.equal((await pg.query('SELECT id FROM public.templates WHERE id=$1',[global.rpcTemplateId])).rows.length,0);
        await assert.rejects(saveEncrypted(global.rpcTemplateId,null,null),/TEMPLATE_OWNER_REQUIRED/);
        await assert.rejects(pg.query('INSERT INTO public.template_tags(template_id,tags_id) VALUES ($1,$2)',[global.rpcTemplateId,1]),/row-level security/);
    });
    await pg.query('DELETE FROM public.creator_credit_links WHERE uploader_id=$1 AND credited_creator_id=$2',[creator,other]);
    await as('authenticated', other, async () => {
        assert.equal((await pg.query('SELECT public.can_edit_template($1) AS ok',[global.rpcTemplateId])).rows[0].ok,false);
    });
    await pg.query('INSERT INTO public.creator_credit_links(uploader_id,credited_creator_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[creator,other]);
    await as('authenticated', other, async () => { await setCredit(ownTag); });
    await as('authenticated', creator, async () => { await saveEncrypted(global.rpcTemplateId,null,null); });
    await as('authenticated', other, async () => {
        assert.equal((await pg.query('SELECT public.can_edit_template($1) AS ok',[global.rpcTemplateId])).rows[0].ok,false);
        await assert.rejects(saveEncrypted(global.rpcTemplateId,null,null),/TEMPLATE_OWNER_REQUIRED/);
    });
    const globalTag = (await pg.query("INSERT INTO public.tags(group_id,name,slug) VALUES ($1,'Legacy credit','legacy-credit') RETURNING id",[group])).rows[0].id;
    await as('authenticated', stranger, async () => {
        assert.ok((await options()).includes(Number(globalTag)), 'Legacy accountless credits remain available to all creators');
    });
    await as('authenticated', creator, async () => {
        await setCredit(globalTag);
        const item=(await pg.query('SELECT public.template_catalog() AS data')).rows[0].data.find(t=>t.id===global.rpcTemplateId);
        assert.equal(item.user_id,creator);
        assert.deepEqual(item.editor_ids,[]);
        assert.deepEqual(item.template_tags.filter(t=>t.tags.tag_groups.name==='creators').map(t=>t.tags.slug),['legacy-credit']);
    });
    console.log('PASS: directional mapped credit, option filtering, single attribution, atomic replacement, link revocation, uploader preservation, both editors, protected/inactive access, stranger denial, revoked credit and rerunnable migration.');
    console.log('PASS: PostgreSQL migration/re-run, Unicode hash compatibility, private-table permissions, catalog allowlist, RLS, creator/owner edits, credential rotation and password-free writes.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pg.close());
