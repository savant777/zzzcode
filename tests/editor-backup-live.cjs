// Explicit integration check: localhost + the configured Supabase project.
// Creates one test backup, deletes only that backup in finally; never edits a template.
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const { randomBytes } = require('node:crypto');
loadEnvConfig(process.cwd());
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function checkSharedLimiter(db) {
    const clientHash = randomBytes(32).toString('hex');
    const secondServer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    try {
        const results = await Promise.all(Array.from({ length: 15 }, (_, index) =>
            (index % 2 ? db : secondServer).rpc('consume_editor_backup_rate_limit', {
                p_client_hash: clientHash, p_operation: 'create',
            })));
        check(results.every(result => !result.error), 'Shared limiter RPC failed');
        check(results.filter(result => result.data?.allowed === true).length === 10, 'Shared limiter did not enforce atomic create limit');
        check(results.filter(result => result.data?.allowed === false && result.data.retryAfter > 0).length === 5, 'Shared limiter retry time missing');
        const save = await db.rpc('consume_editor_backup_rate_limit', { p_client_hash: clientHash, p_operation: 'save' });
        check(!save.error && save.data?.allowed === true, 'Create limit incorrectly blocked saving');
        const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
        const denied = await anon.rpc('consume_editor_backup_rate_limit', { p_client_hash: clientHash, p_operation: 'create' });
        check(!!denied.error, 'Anonymous clients can call shared limiter directly');
        console.log('PASS: shared limiter across two clients, 15 concurrent calls / 10 allowed, retry time, operation isolation and anonymous denial');
    } finally {
        const cleaned = await db.from('editor_backup_rate_limits').delete().eq('client_hash', clientHash);
        check(!cleaned.error, 'Rate limit test counter cleanup failed');
    }
}
async function run() {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    await checkSharedLimiter(db);
    const templates = await db.from('templates').select('id').eq('is_active', true).eq('is_personal', false).limit(1);
    check(!templates.error && templates.data?.length, 'Cannot find a public test template');
    const templateId = String(templates.data[0].id);
    const payload = { activeDraftId: 'integration-test', drafts: [{ id: 'integration-test', name: 'API integration test', fieldValues: { text: 'temporary test' }, updatedAt: new Date().toISOString() }] };
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': randomBytes(32).toString('base64url') };
    let saved;
    const endpoint = 'http://localhost:3000/api/editor/backups';
    try {
        const first = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ templateId, payload }) });
        check(first.status === 201, `Create failed: HTTP ${first.status}`);
        saved = await first.json();
        const retry = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ templateId, payload }) });
        const repeated = await retry.json();
        check(retry.status === 200 && repeated.id === saved.id && repeated.token === saved.token, 'Create retry failed');
        const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${saved.token}` };
        const loaded = await fetch(`${endpoint}/${saved.id}?templateId=${templateId}`, { headers: auth });
        check(loaded.status === 200 && (await loaded.json()).payload.drafts[0].fieldValues.text === 'temporary test', 'Read failed');
        const wrong = await fetch(`${endpoint}/${saved.id}?templateId=${templateId}`, { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } });
        check(wrong.status === 404, 'Wrong token was accepted');
        const save = () => fetch(`${endpoint}/${saved.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ templateId, payload, expectedRevision: 1 }) });
        check((await save()).status === 200, 'Save failed');
        check((await save()).status === 409, 'Stale revision was accepted');
        console.log('PASS: real Supabase create/retry/read/save/conflict and wrong-token rejection');
    } finally {
        if (saved?.id) {
            const cleanup = await db.from('editor_backups').delete().eq('id', saved.id).eq('template_id', templateId);
            check(!cleanup.error, 'Test backup cleanup failed');
            console.log('Test backup removed; existing templates and drafts were not modified.');
        }
    }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
