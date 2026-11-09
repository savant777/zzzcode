const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const compiled = ts.transpileModule(fs.readFileSync('lib/editor-backup-api.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
const binModule = { exports: {} };
new Function('exports', 'require', 'module', ts.transpileModule(fs.readFileSync('lib/bin-server.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(binModule.exports, require, binModule);
new Function('exports', 'require', 'module', compiled)(loaded.exports, name => name === './bin-server' ? binModule.exports : require(name), loaded);
const fingerprint = (id, password) => createHash('sha256').update(JSON.stringify([id, password])).digest('hex');
let password = 'secret';
let row = { id: '1', is_active: true, is_personal: true, user_id: 'creator' };
let limiter = { data: { allowed: true } };
let role = 'creator';
let credited = false;
let activeCreator = true;
let contentReads = 0;
let backupValid = false;
let verifyError = false;
const backup = { id: '12345678-1234-4234-8234-123456789abc', token: 'a'.repeat(43) };
const db = {
    auth: { getUser: async token => ({ data: { user: token === 'valid-session' ? { id: 'creator' } : null } }) },
    async rpc(name, args) {
        if (name === 'consume_editor_backup_rate_limit') return limiter;
        if (name === 'is_template_editor') return { data: credited };
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
    process.env.BIN_PASSWORD = 'test-bin-secret';
    const rememberedBin = binModule.exports.binToken();
    const binRequest = token => new Request('http://localhost', { headers: { 'x-bin-token': token } });
    assert.equal(binModule.exports.binAllowed(binRequest(rememberedBin)), true);
    assert.equal(binModule.exports.binAllowed(binRequest(rememberedBin + 'tampered')), false);
    process.env.BIN_PASSWORD = 'rotated';
    assert.equal(binModule.exports.binAllowed(binRequest(rememberedBin)), false);
    process.env.BIN_PASSWORD = 'test-bin-secret';
    row.is_secret = true;
    assert.equal((await check({ password }, {}, 'read')).status, 403);
    const binAuth = { 'x-bin-token': binModule.exports.binToken() };
    assert.equal((await check({ password }, binAuth, 'read')).status, 200);
    assert.equal((await check({ password: 'wrong' }, binAuth, 'read')).status, 403);
    row.is_secret = false;
    contentReads = 0;
    const valid = await check({ password });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('cache-control'), 'no-store');
    for (const phase of ['rate_limit', 'template_meta', 'authorize', 'total']) {
        assert.match(valid.headers.get('server-timing'), new RegExp(`${phase};dur=[\\d.]+`));
    }
    assert.deepEqual(await valid.json(), { unlocked: true });
    assert.equal((await check({ password: 'wrong' }, {}, 'read')).status, 403);
    assert.equal((await check({ unlocked: true }, {}, 'read')).status, 403);
    assert.equal(contentReads, 0, 'Do not even query HTML before authorization');
    const remembered = fingerprint('1', password);
    const content = await check({ fingerprint: remembered }, {}, 'read');
    assert.equal(content.status, 200);
    assert.match(content.headers.get('server-timing'), /template_read;dur=[\d.]+/);
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
    assert.equal((await check({}, {}, 'read')).status, 403);
    assert.equal((await check({ password: 'wrong' }, {}, 'read')).status, 403);
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
    activeCreator = true;
    role = 'creator';
    credited = true;
    assert.equal((await check({}, auth, 'read')).status, 200);
    credited = false;
    assert.equal((await check({}, auth, 'read')).status, 403);
    row.is_active = true;
    verifyError = true;
    assert.equal((await check({ password }, {}, 'read')).status, 503);
    verifyError = false;
    row.is_personal = false;
    assert.equal((await check({}, {}, 'read')).status, 200);
    assert.equal((await check({}, { origin: 'http://evil.test' })).status, 403);
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVercel = process.env.VERCEL;
    try {
        process.env.NODE_ENV = 'development';
        delete process.env.VERCEL;
        const lan = { origin: 'http://192.168.1.117:3000', host: '192.168.1.117:3000' };
        assert.equal((await check({}, lan, 'read')).status, 200, 'LAN dev Host matches browser origin');
        assert.equal((await check({}, { ...lan, origin: 'http://evil.test' }, 'read')).status, 403);
        assert.equal((await check({}, { ...lan, 'sec-fetch-site': 'cross-site' }, 'read')).status, 403);
        row.is_personal = true;
        const locked = await check({}, lan, 'read');
        assert.equal((await locked.json()).requiresPassword, true);
        row.is_active = false;
        const inactive = await check({}, lan, 'read');
        assert.equal(inactive.status, 403);
        assert.notEqual((await inactive.json()).requiresPassword, true);
        row.is_active = true;
        row.is_personal = false;
        process.env.NODE_ENV = 'production';
        const rejected = await check({}, lan, 'read');
        assert.equal(rejected.status, 403, 'Production does not trust Host override');
        assert.notEqual((await rejected.json()).requiresPassword, true);
    } finally {
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
        if (originalVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalVercel;
    }

    limiter = { data: { allowed: false, retryAfter: 30 } };
    const limited = await check();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '30');
    limiter = { error: { message: 'private database details' } };
    const unavailable = await check();
    assert.equal(unavailable.status, 503);
    assert.ok(!(await unavailable.text()).includes('private database details'));
    let releaseQuota, markMetadata;
    const quotaGate = new Promise(resolve => { releaseQuota = resolve; });
    const metadataStarted = new Promise(resolve => { markMetadata = resolve; });
    let credentialCalls = 0;
    const beforeLimitedRead = contentReads;
    const parallelDb = {
        ...db,
        rpc(name, args) {
            if (name === 'consume_editor_backup_rate_limit') return quotaGate;
            credentialCalls++;
            return db.rpc(name, args);
        },
        from(table) { markMetadata(); return db.from(table); },
    };
    const blocked = loaded.exports.handleTemplateRequest(new Request('http://localhost/api/templates/read', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: '1', password }),
    }), 'read', { db: parallelDb, secret: 'test-only' });
    let deadline;
    try {
        await Promise.race([metadataStarted, new Promise((_, reject) => {
            deadline = setTimeout(() => reject(Error('Metadata must start while quota is pending')), 1000);
        })]);
    } finally { clearTimeout(deadline); }
    assert.equal(credentialCalls, 0, 'No password verification before quota passes');
    assert.equal(contentReads, beforeLimitedRead, 'No HTML read before quota passes');
    releaseQuota({ data: { allowed: false, retryAfter: 30 } });
    assert.equal((await blocked).status, 429);
    assert.equal(credentialCalls, 0);
    assert.equal(contentReads, beforeLimitedRead, 'Quota rejection never reads content');
    console.log('PASS: server template access, credential rotation/binding, backups, inactive/owner access, no pre-auth content, quotas and fail-closed errors.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
