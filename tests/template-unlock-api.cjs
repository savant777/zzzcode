const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const compiled = ts.transpileModule(fs.readFileSync('lib/editor-backup-api.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const fingerprint = (id, password) => createHash('sha256').update(JSON.stringify([id, password])).digest('hex');
let password = 'secret';
let row = { id: '1', is_active: true, is_personal: true, user_id: 'creator' };
let limiter = { data: { allowed: true } };
let role = 'creator';
let activeCreator = true;
let contentReads = 0;
let backupValid = false;
let verifyError = false;
const backup = { id: '12345678-1234-4234-8234-123456789abc', token: 'a'.repeat(43) };
const db = {
    auth: { getUser: async token => ({ data: { user: token === 'valid-session' ? { id: 'creator' } : null } }) },
    async rpc(name, args) {
        if (name === 'consume_editor_backup_rate_limit') return limiter;
        assert.equal(name, 'verify_template_credential');
        return verifyError ? { error: { message: 'private database details' } }
            : { data: args.p_fingerprint === fingerprint(args.p_template_id, password) };
    },
    from(table) {
        let columns;
        const filters = {};
        const q = {
            select(value) { columns = value; return q; },
            eq(key, value) { filters[key] = value; return q; },
            async maybeSingle() {
                if (table === 'creators') return { data: { role, is_active: activeCreator } };
                if (table === 'editor_backups') return { data: backupValid && filters.id === backup.id
                    && filters.template_id === '1' && filters.access_token_hash === createHash('sha256').update(backup.token).digest('hex')
                    ? { id: backup.id } : null };
                assert.equal(table, 'templates');
                assert.ok(!columns.includes('password'));
                if (columns.includes('html_blueprint')) {
                    contentReads++;
                    return { data: { id: '1', html_blueprint: 'protected code', fields_config: [] } };
                }
                return { data: row };
            },
        };
        return q;
    },
};
const check = (credential = {}, headers = {}, operation = 'unlock') => loaded.exports.handleTemplateRequest(new Request('http://localhost/api/templates/' + operation, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ templateId: '1', ...credential }),
}), operation, { db, secret: 'test-only' });
async function run() {
    const valid = await check({ password });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await valid.json(), { unlocked: true });
    assert.equal((await check({ password: 'wrong' }, {}, 'read')).status, 403);
    assert.equal((await check({ unlocked: true }, {}, 'read')).status, 403);
    assert.equal(contentReads, 0, 'Do not even query HTML before authorization');
    const remembered = fingerprint('1', password);
    const content = await check({ fingerprint: remembered }, {}, 'read');
    assert.equal(content.status, 200);
    assert.deepEqual(await content.json(), { template: { id: '1', html_blueprint: 'protected code', fields_config: [] } });
    assert.equal((await check({ fingerprint: fingerprint('2', password) })).status, 403);
    password = 'changed';
    assert.equal((await check({ fingerprint: remembered })).status, 403);
    assert.equal((await check({ fingerprint: 'broken' })).status, 403);
    assert.equal((await check({ backup }, {}, 'read')).status, 403);
    backupValid = true;
    assert.equal((await check({ backup }, {}, 'read')).status, 200);
    assert.equal((await check({ backup: { ...backup, token: 'b'.repeat(43) } }, {}, 'read')).status, 403);
    assert.equal((await check({ templateId: '2', backup }, {}, 'read')).status, 403);
    row.is_active = false;
    assert.equal((await check({ backup }, {}, 'read')).status, 403);
    assert.equal((await check({ password }, {}, 'read')).status, 403);
    const auth = { authorization: 'Bearer valid-session' };
    assert.equal((await check({}, auth, 'read')).status, 200, 'Creator can open their inactive template');
    assert.equal((await check({ password: 'wrong' }, auth)).status, 403, 'Creator must not validate an incorrect password');
    assert.equal((await check({ fingerprint: remembered }, auth)).status, 403, 'Creator must not validate stale remembered credentials');
    assert.equal((await check({ password }, auth)).status, 200);
    row.user_id = 'someone-else';
    assert.equal((await check({}, auth, 'read')).status, 403);
    role = 'owner';
    assert.equal((await check({}, auth, 'read')).status, 200);
    assert.equal((await check({ password: 'wrong' }, auth)).status, 403, 'Owner must not validate an incorrect password');
    activeCreator = false;
    assert.equal((await check({}, auth, 'read')).status, 403);
    assert.equal((await check({}, { authorization: 'Bearer forged' }, 'read')).status, 403);
    row.is_active = true;
    verifyError = true;
    assert.equal((await check({ password }, {}, 'read')).status, 503);
    verifyError = false;
    row.is_personal = false;
    assert.equal((await check({}, {}, 'read')).status, 200);
    assert.equal((await check({}, { origin: 'http://evil.test' })).status, 403);
    limiter = { data: { allowed: false, retryAfter: 30 } };
    const limited = await check();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '30');
    limiter = { error: { message: 'private database details' } };
    const unavailable = await check();
    assert.equal(unavailable.status, 503);
    assert.ok(!(await unavailable.text()).includes('private database details'));
    console.log('PASS: server template access, credential rotation/binding, backups, inactive/owner access, no pre-auth content, quotas and fail-closed errors.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
