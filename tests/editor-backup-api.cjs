const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const compiled = ts.transpileModule(fs.readFileSync('lib/editor-backup-api.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const { handleBackupRequest } = loaded.exports;
const rows = new Map();
let rpcCalls = 0;
let limitResult = { data: { allowed: true, retryAfter: 0 } };
const db = {
    from(table) {
        let inserted;
        const filters = [];
        const q = {
            select() { return q; },
            eq(key, value) { filters.push([key, value]); return q; },
            insert(value) { inserted = value; return q; },
            async single() {
                if (rows.has(inserted.id)) return { error: { code: '23505' } };
                const row = { ...inserted, revision: 1, created_at: 'now', updated_at: 'now' };
                rows.set(row.id, structuredClone(row));
                return { data: row }; // Deliberately include hash to test response allowlist.
            },
            async maybeSingle() {
                if (table === 'templates') {
                    const id = filters.find(([key]) => key === 'id')[1];
                    return { data: id === '999' ? null : { id, is_active: true, is_personal: id === '2', password: 'private' } };
                }
                return { data: [...rows.values()].find(row => filters.every(([key, value]) => String(row[key]) === String(value))) || null };
            },
        };
        return q;
    },
    async rpc(name, args) {
        if (name === 'consume_editor_backup_rate_limit') {
            assert.match(args.p_client_hash, /^[0-9a-f]{64}$/);
            return limitResult;
        }
        if (name === 'verify_template_credential') return { data: args.p_template_id === '2' && args.p_fingerprint === createHash('sha256').update(JSON.stringify(['2', 'private'])).digest('hex') };
        rpcCalls++;
        assert.equal(name, 'save_editor_backup');
        const row = rows.get(args.p_backup_id);
        if (row.access_token_hash !== args.p_access_token_hash) return { data: { status: 'not_found' } };
        if (row.revision !== args.p_expected_revision) return { data: { status: 'conflict', revision: row.revision, updatedAt: row.updated_at } };
        row.revision++;
        row.payload = structuredClone(args.p_payload);
        return { data: { status: 'saved', id: row.id, revision: row.revision, updatedAt: 'later' } };
    },
};
const deps = { db, secret: 'test-secret-never-production' };
const payload = { activeDraftId: 'a', drafts: [{ id: 'a', name: 'One', fieldValues: { text: 'hello' }, updatedAt: '2026-09-18T00:00:00Z' }] };
const key = randomBytes(32).toString('base64url');
function request(method, body, headers = {}, query = '') {
    return new Request(`http://localhost/api/editor/backups${query}`, {
        method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
async function run() {
    const create = () => handleBackupRequest(request('POST', { templateId: '1', payload }, { 'idempotency-key': key }), 'create', undefined, deps);
    const first = await create();
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const saved = await first.json();
    assert.equal(saved.token.length, 43);
    assert.equal(saved.access_token_hash, undefined);
    assert.equal(saved.templateId, '1');
    const retry = await create();
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).token, saved.token);
    assert.equal(rows.size, 1);
    const auth = { authorization: `Bearer ${saved.token}` };
    const read = await handleBackupRequest(request('GET', null, auth, '?templateId=1'), 'read', saved.id, deps);
    assert.equal(read.status, 200);
    assert.deepEqual((await read.json()).payload, payload);
    const bad = await handleBackupRequest(request('GET', null, { authorization: `Bearer ${'x'.repeat(43)}` }, '?templateId=1'), 'read', saved.id, deps);
    assert.equal(bad.status, 404);
    const missing = await handleBackupRequest(request('GET', null, auth, '?templateId=1'), 'read', randomUUID(), deps);
    assert.deepEqual(await bad.json(), await missing.json());
    const update = () => handleBackupRequest(request('PUT', { templateId: '1', payload, expectedRevision: 1 }, auth), 'save', saved.id, deps);
    assert.equal((await update()).status, 200);
    assert.equal((await update()).status, 409);
    assert.equal(rpcCalls, 2);
    const invalid = await handleBackupRequest(request('PUT', { templateId: '1', payload: {}, expectedRevision: 2 }, auth), 'save', saved.id, deps);
    assert.equal(invalid.status, 400);
    assert.equal(rpcCalls, 2);
    const cross = await handleBackupRequest(request('PUT', { templateId: '1', payload, expectedRevision: 2 }, { ...auth, origin: 'https://evil.example' }), 'save', saved.id, deps);
    assert.equal(cross.status, 403);
    const leakedId = await handleBackupRequest(request('POST', { templateId: '1', payload }, { 'idempotency-key': saved.id }), 'create', undefined, deps);
    assert.equal(leakedId.status, 400, 'Public backup ID must never be sufficient to recover its token');
    const denied = await handleBackupRequest(request('POST', { templateId: '2', payload }, { 'idempotency-key': randomBytes(32).toString('base64url') }), 'create', undefined, deps);
    assert.equal(denied.status, 403);
    const privateOk = await handleBackupRequest(request('POST', { templateId: '2', fingerprint: createHash('sha256').update(JSON.stringify(['2', 'private'])).digest('hex'), payload }, { 'idempotency-key': randomBytes(32).toString('base64url') }), 'create', undefined, deps);
    assert.equal(privateOk.status, 201);
    const large = await handleBackupRequest(request('PUT', { templateId: '1', payload: { ...payload, large: 'x'.repeat(2097152) }, expectedRevision: 2 }, auth), 'save', saved.id, deps);
    assert.equal(large.status, 413);
    const malformed = new Request('http://localhost/api/editor/backups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal((await handleBackupRequest(malformed, 'create', undefined, deps)).status, 400);
    const previousSaves = rpcCalls;
    limitResult = { data: { allowed: false, retryAfter: 42 } };
    const limited = await update();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '42');
    assert.equal((await limited.json()).retryAfter, 42);
    assert.equal(rpcCalls, previousSaves, 'Denied requests must not reach the save RPC');
    limitResult = { error: { code: 'PGRST202' } };
    const unavailable = await update();
    assert.equal(unavailable.status, 503, 'Missing shared limiter must fail closed');
    assert.equal(rpcCalls, previousSaves);
    const savedVercel = process.env.VERCEL;
    process.env.VERCEL = '1';
    const identities = [];
    const sharedDb = { async rpc(name, args) {
        assert.equal(name, 'consume_editor_backup_rate_limit');
        identities.push(args.p_client_hash);
        return { data: { allowed: identities.length === 1, retryAfter: 30 } };
    } };
    try {
        const freshHandler = () => {
            const module = { exports: {} };
            new Function('exports', 'require', 'module', compiled)(module.exports, require, module);
            return module.exports.handleBackupRequest;
        };
        const firstInstance = await freshHandler()(request('GET', null, {
            'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '1.1.1.1',
        }), 'read', 'invalid-id', { db: sharedDb, secret: deps.secret });
        const secondInstance = await freshHandler()(request('GET', null, {
            'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '8.8.8.8',
        }), 'read', 'invalid-id', { db: sharedDb, secret: deps.secret });
        assert.equal(firstInstance.status, 404);
        assert.equal(secondInstance.status, 429, 'New process must respect shared quota');
        assert.equal(identities[0], identities[1], 'Untrusted forwarded headers cannot change identity');
        const missingIp = await freshHandler()(request('GET', null, { 'x-forwarded-for': '1.1.1.1' }), 'read', saved.id, deps);
        assert.equal(missingIp.status, 503);
    } finally {
        if (savedVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedVercel;
    }
    console.log('PASS: create/retry, read, token privacy, wrong token, revision conflicts, validation, cross-origin, private templates, request limits');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
